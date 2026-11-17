import { createPersistentApi } from './persistent-api.js';
import { renderMath, renderTextWithMath } from './math.js';
import { renderQuestionImage } from './question-media.js';
import { attachExamShortcuts } from './exam-shortcuts.js';
import { renderDemoNotice } from './demo-notice.js';

/** Full simulation shares the local identity and sealed Bank delivery engine. */
export async function mountSimulation() {
  document.documentElement.lang = 'en';
  document.title = 'Full simulation · Unofficial TSA practice';
  const app = document.getElementById('app');
  const identity = createPersistentApi();
  app.classList.add('simulation-app');

  let view = null;
  let sectionId = 'math';
  let index = 0;
  let busy = false;
  let pending = null;
  let draft = null;
  let notice = '';
  let syncedAt = performance.now();
  let polling = false;
  let catalog = [];
  let history = [];
  let released = null;
  let authenticated = false;
  let uncertainSwitch = null;

  const keys = new Map();
  const names = {math: 'Mathematics', reading: 'Reading', science: 'Science'};
  const csrf = () => document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('tsa_local_csrf='))
    ?.slice(15) ?? '';
  let boundNonce = csrf();
  let readSequence = 0;

  function clearIdentity() {
    authenticated = false;
    view = null;
    released = null;
    pending = null;
    draft = null;
    uncertainSwitch = null;
    keys.clear();
    readSequence++;
  }

  function el(tag, text = '', className = '') {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  }

  function button(text, id, action, secondary = false) {
    const node = el('button', text, `button${secondary ? ' secondary' : ''}`);
    node.type = 'button';
    node.dataset.testid = id;
    node.disabled = busy;
    node.addEventListener('click', () => void run(action));
    return node;
  }

  async function request(path, body, key) {
    const nonce = csrf();
    const headers = {accept: 'application/json'};
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers['x-csrf-token'] = nonce;
    }

    const signature = path + JSON.stringify(body);
    key ??= body === undefined ? null : keys.get(signature) ?? crypto.randomUUID();
    if (key) headers['idempotency-key'] = key;
    if (body !== undefined) keys.set(signature, key);

    let response;
    let data;
    try {
      response = await fetch(path, {
        method: body === undefined ? 'GET' : path.includes('/answers/') ? 'PUT' : 'POST',
        headers,
        cache: 'no-store',
        credentials: 'same-origin',
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
      data = await response.json();
    } catch {
      throw new Error('The acknowledgement was lost. Retry the same action or reload saved state.');
    }

    if (path.startsWith('/api/') && csrf() !== nonce) {
      throw Object.assign(new Error('The signed-in session changed. Sign in again.'), {status: 401});
    }
    if (!response.ok) {
      if (response.status < 500 && response.status !== 429) keys.delete(signature);
      throw Object.assign(new Error(data.error?.code ?? 'Request failed'), {status: response.status});
    }

    keys.delete(signature);
    return data;
  }

  async function run(action) {
    if (busy) return;
    if (authenticated && csrf() !== boundNonce) {
      clearIdentity();
      notice = 'The signed-in session changed. Sign in again.';
      render();
      return;
    }

    readSequence++;
    const focusId = document.activeElement?.dataset?.testid;
    busy = true;
    render();
    try {
      await action();
    } catch (error) {
      notice = error.message;
      if (error.status === 401) clearIdentity();
    } finally {
      busy = false;
      render();
      if (focusId) {
        app.querySelector(`[data-testid="${focusId}"]:not(:disabled)`)?.focus({preventScroll: true});
      }
    }
  }

  function accept(next) {
    view = next;
    syncedAt = performance.now();
    if (view.state !== 'IN_PROGRESS') {
      if (pending || draft) {
        notice = 'The attempt closed. Results use the answers acknowledged by the server.';
      }
      pending = null;
      draft = null;
    }
    if (!view.sections.some((section) => section.sectionId === sectionId && section.firstOpenedAt)) {
      sectionId = view.activeSectionId
        ?? view.sections.find((section) => section.firstOpenedAt)?.sectionId
        ?? 'math';
    }
  }

  async function load() {
    const id = view.attemptId;
    const sequence = ++readSequence;
    const next = await request(`/api/v3/attempts/${id}`);
    if (sequence !== readSequence || view?.attemptId !== id) return;

    accept(next);
    if (view.state === 'GRADED') {
      const result = await request(`/api/v3/attempts/${id}/result`);
      if (sequence === readSequence && view?.attemptId === id) released = result;
    }
  }

  async function home() {
    catalog = (await request('/api/v3/catalog?limit=100')).items;
    history = (await request('/api/v3/attempts?limit=100')).items;
    const active = history.find((attempt) =>
      ['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED'].includes(attempt.state));
    if (active) {
      view = {attemptId: active.attemptId};
      await load();
    }
  }

  async function login(actor) {
    await identity.loginCandidate(actor);
    authenticated = true;
    boundNonce = csrf();
    notice = '';
    await home();
  }

  async function start(id) {
    await request(`/api/v3/attempts/${id}/start`, {});
    view = {attemptId: id};
    await load();
  }

  async function create(profile) {
    const receipt = await request('/api/v3/attempts', {
      blueprintVersionId: profile.blueprintVersionId,
    });
    await start(receipt.attemptId);
  }

  function remaining(section) {
    const elapsed = section.isOpen ? (performance.now() - syncedAt) / 1000 : 0;
    return Math.max(0, section.remainingSeconds - elapsed);
  }

  function format(seconds) {
    seconds = Math.ceil(Math.max(0, seconds));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  const changed = () => pending !== null || draft !== null || uncertainSwitch !== null;

  async function switchSection(target) {
    if (changed() && !uncertainSwitch) return;
    const targetClock = view.sections.find((section) => section.sectionId === target);
    if (targetClock.isLocked) {
      sectionId = target;
      index = 0;
      return;
    }

    const intent = uncertainSwitch ?? {sectionId: target, key: crypto.randomUUID()};
    uncertainSwitch = intent;
    await request(
      `/api/v3/attempts/${view.attemptId}/section`,
      {sectionId: intent.sectionId},
      intent.key,
    );
    uncertainSwitch = null;
    sectionId = intent.sectionId;
    index = 0;
    await load();
  }

  async function save(slot, value) {
    if (!pending) {
      const prior = view.answers.find((answer) => answer.slotId === slot.slotId);
      pending = {
        slotId: slot.slotId,
        body: {expectedRevision: prior?.revision ?? 0, value},
        key: crypto.randomUUID(),
      };
    }
    await request(
      `/api/v3/attempts/${view.attemptId}/answers/${pending.slotId}`,
      pending.body,
      pending.key,
    );
    pending = null;
    draft = null;
    notice = 'Answer saved.';
    await load();
  }

  function blocks(values, purpose = 'question') {
    const wrap = el('div', '', 'simulation-blocks');
    for (const block of values ?? []) {
      if (block.type === 'text') {
        const paragraph = el('p');
        paragraph.append(renderTextWithMath(block.text));
        wrap.append(paragraph);
      } else if (block.type === 'math') {
        wrap.append(renderMath(block));
      } else if (block.type === 'image') {
        wrap.append(renderQuestionImage(block, {
          attemptId: view.attemptId,
          purpose,
          apiVersion: 'v3',
        }));
      } else if (block.type === 'table') {
        const table = el('table');
        table.append(el('caption', block.caption));

        const head = el('thead');
        const headingRow = el('tr');
        block.headers.forEach((header) => {
          const cell = el('th', header);
          cell.scope = 'col';
          headingRow.append(cell);
        });
        head.append(headingRow);
        table.append(head);

        const body = el('tbody');
        block.rows.forEach((cells) => {
          const row = el('tr');
          cells.forEach((cell) => row.append(el('td', cell)));
          body.append(row);
        });
        table.append(body);
        wrap.append(table);
      }
    }
    return wrap;
  }

  function controls(slot, locked) {
    const group = el('fieldset', '', 'simulation-options');
    group.append(el('legend', 'Your answer'));
    const value = pending?.slotId === slot.slotId
      ? pending.body.value
      : view.answers.find((answer) => answer.slotId === slot.slotId)?.value;
    const disabled = locked || busy || pending !== null || uncertainSwitch !== null;

    if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
      for (const statement of slot.interaction.statements) {
        const row = el('fieldset');
        row.append(el('legend', statement.id), blocks(statement.content));
        for (const choice of [true, false]) {
          const label = el('label', choice ? 'True' : 'False');
          const input = el('input');
          input.type = 'radio';
          input.name = `statement-${statement.id}`;
          input.checked = value?.values?.[statement.id] === choice;
          input.disabled = disabled;
          input.addEventListener('change', () => void run(() => save(slot, {
            type: 'TRUE_FALSE_GROUP',
            values: Object.fromEntries(slot.interaction.statements.map((item) => [
              item.id,
              item.id === statement.id ? choice : value?.values?.[item.id] ?? null,
            ])),
          })));
          label.prepend(input);
          row.append(label);
        }
        group.append(row);
      }
    } else {
      for (const option of slot.interaction.options) {
        const label = el('label');
        const input = el('input');
        input.type = slot.interaction.type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio';
        input.name = 'simulation-answer';
        input.dataset.testid = `option-${option.id}`;
        const selected = draft?.slotId === slot.slotId
          ? draft.optionIds
          : value?.optionIds ?? [];
        input.checked = input.type === 'checkbox'
          ? selected.includes(option.id)
          : value?.optionId === option.id;
        input.disabled = disabled;
        input.addEventListener('change', () => {
          if (input.type === 'radio') {
            void run(() => save(slot, {type: 'SINGLE_CHOICE', optionId: option.id}));
          } else {
            const ids = new Set(draft?.optionIds ?? value?.optionIds ?? []);
            if (input.checked) ids.add(option.id);
            else ids.delete(option.id);
            draft = {
              slotId: slot.slotId,
              optionIds: slot.interaction.options
                .filter((item) => ids.has(item.id))
                .map((item) => item.id),
            };
            render();
          }
        });
        label.append(input, blocks(option.content));
        group.append(label);
      }
      if (slot.interaction.type === 'MULTIPLE_CHOICE' && draft) {
        const saveDraft = button('Save selections', 'simulation-save-selections', () =>
          save(slot, {type: 'MULTIPLE_CHOICE', optionIds: draft.optionIds}));
        saveDraft.disabled = disabled
          || draft.optionIds.length < slot.interaction.minSelections
          || draft.optionIds.length > slot.interaction.maxSelections;
        group.append(
          saveDraft,
          button('Discard draft', 'simulation-discard-draft', () => {
            draft = null;
          }, true),
        );
      }
    }

    const clear = button('Clear answer', 'clear-answer', () => save(
      slot,
      slot.interaction.type === 'SINGLE_CHOICE'
        ? {type: 'SINGLE_CHOICE', optionId: null}
        : slot.interaction.type === 'MULTIPLE_CHOICE'
          ? {type: 'MULTIPLE_CHOICE', optionIds: []}
          : {
              type: 'TRUE_FALSE_GROUP',
              values: Object.fromEntries(
                slot.interaction.statements.map((statement) => [statement.id, null]),
              ),
            },
    ), true);
    clear.disabled = disabled || !value;
    group.append(clear);
    return group;
  }
  function render(){
    const shell=el('div','','simulation-shell'),header=el('header','','simulation-header');
    const title=el('div');title.append(el('p','UNOFFICIAL PRACTICE','eyebrow'),el('h1','Full simulation'));header.append(title);
    if(authenticated)header.append(button('Sign out','simulation-logout',async()=>{await identity.logout();authenticated=false;view=null;released=null;pending=null;draft=null;uncertainSwitch=null;keys.clear();notice='';},true));
    shell.append(header);
    const message=el('p',notice,'simulation-notice');message.setAttribute('role','status');message.dataset.testid='simulation-notice';if(notice)shell.append(message);document.getElementById('announcements').textContent=notice;
    if(!authenticated){const panel=el('section','','simulation-card');panel.dataset.testid='persistent-login';panel.append(el('h2','Open the local practice demo'),el('p','Original synthetic questions. Choose a disposable student identity to begin.'),button('Student A','persistent-login-studentA',()=>login('studentA')),button('Student B','persistent-login-studentB',()=>login('studentB'),true));shell.append(panel);}
    else if(!view){const panel=el('section','','simulation-card');panel.append(el('h2','100 questions. Three separate clocks.'),el('p','Mathematics: 40 questions / 60 minutes. Reading: 20 / 30. Science: 40 / 60. Only the open section uses time. You can return while time remains.'));
      catalog.forEach(p=>panel.append(button('Start full simulation','demo-start',()=>create(p))));if(!catalog.length)panel.append(el('p','No full simulation is currently offered.'));shell.append(panel);
      if(history.length){const list=el('section','','simulation-card');list.append(el('h2','Your attempts'));history.forEach(a=>list.append(button(`${a.state} · ${a.score?`${a.score.correctCount}/100`:'100 questions'}`,`simulation-history-${a.attemptId}`,async()=>{view={attemptId:a.attemptId};released=null;await load();},true)));shell.append(list);}
      shell.append(renderDemoNotice({language:'en'}));
    }else if(view.state==='CREATED'){const panel=el('section','','simulation-card');panel.append(el('h2','Your simulation is reserved'),el('p','The Mathematics clock starts when you begin.'),button('Begin simulation','demo-start',()=>start(view.attemptId)));shell.append(panel);}
    else if(view.state==='IN_PROGRESS'){
      const tabs=el('nav','','simulation-tabs');tabs.setAttribute('aria-label','Simulation sections');tabs.setAttribute('role','tablist');
      view.sections.forEach(s=>{const tab=button('',`section-${s.sectionId}`,()=>switchSection(s.sectionId),true);tab.classList.add('simulation-tab');tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(sectionId===s.sectionId));tab.setAttribute('aria-controls','simulation-panel');tab.disabled=busy||(changed()&&!uncertainSwitch)||Boolean(uncertainSwitch);
        tab.append(el('strong',names[s.sectionId]));const time=el('span',format(remaining(s)));time.dataset.clock=s.sectionId;tab.append(time,el('small',s.isLocked?'Locked · read only':s.isOpen?'Clock running':s.firstOpenedAt?'Paused':'Not opened'));tabs.append(tab);});shell.append(tabs);
      if(uncertainSwitch)shell.append(button('Retry section switch','simulation-retry-switch',()=>switchSection(uncertainSwitch.sectionId)));
      const clock=view.sections.find(s=>s.sectionId===sectionId),slots=view.slots.filter(s=>s.sectionId===sectionId);index=Math.min(index,Math.max(0,slots.length-1));const slot=slots[index];
      const panel=el('section','','simulation-card');panel.id='simulation-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-label',names[sectionId]);
      if(clock.isLocked){const locked=el('p','Time exhausted. Your saved answers are preserved; this section is read only.','simulation-locked');locked.dataset.testid='section-locked';panel.append(locked);}
      if(slot){panel.append(el('p',`${names[sectionId]} · Question ${index+1} of ${slots.length}`,'eyebrow'));const heading=el('h2',`Question ${slot.ordinal}`);heading.id='question-title';panel.append(heading);if(slot.stimulus)panel.append(blocks(slot.stimulus.content));panel.append(blocks(slot.content),controls(slot,clock.isLocked||view.activeSectionId!==sectionId));
        const ack=el('p',pending?'Save unconfirmed':draft?'Selections not saved':view.answers.some(a=>a.slotId===slot.slotId)?'Answer saved':'No answer saved','simulation-save-status');ack.dataset.testid='save-status';ack.classList.toggle('saved',!pending&&!draft&&view.answers.some(a=>a.slotId===slot.slotId));panel.append(ack);
        if(pending)panel.append(button('Retry exact save','simulation-retry-save',()=>save(slot,pending.body.value)));
        const nav=el('div','','simulation-actions');const prev=button('Previous','question-prev',()=>{index--;},true),next=button('Next','question-next',()=>{index++;},true);prev.disabled=busy||changed()||index===0;next.disabled=busy||changed()||index===slots.length-1;nav.append(prev,el('span',`${index+1} / ${slots.length}`),next);panel.append(nav);
      }else panel.append(el('p','Choose a section with remaining time to continue.'));
      const actions=el('div','','simulation-actions');const submit=el('button','Submit all sections','button');submit.type='button';submit.dataset.testid='submit-open';submit.addEventListener('click',()=>app.querySelector('dialog').showModal());submit.disabled=busy||changed();actions.append(submit,button('Reload saved state','simulation-reload',async()=>{await load();pending=null;draft=null;uncertainSwitch=null;notice='Saved state reloaded.';},true));panel.append(actions);shell.append(panel);
      const dialog=el('dialog','','simulation-card');dialog.id='submit-dialog';dialog.setAttribute('aria-labelledby','simulation-submit-title');const heading=el('h2','Submit all 100 questions?');heading.id='simulation-submit-title';dialog.append(heading,el('p','This ends every section, including sections you have not opened. Unanswered questions count as incorrect.'),button('Keep working','submit-cancel',()=>dialog.close(),true),button('Submit all sections','submit-confirm',async()=>{await request(`/api/v3/attempts/${view.attemptId}/submit`,{});await load();}));dialog.addEventListener('close',()=>app.querySelector('[data-testid="submit-open"]')?.focus());shell.append(dialog);
      attachExamShortcuts(shell,{next:()=>{if(!busy&&!changed()&&index<slots.length-1){index++;render();}},previous:()=>{if(!busy&&!changed()&&index>0){index--;render();}},openSubmit:()=>{if(!changed()&&!busy)dialog.showModal();},selectOption:i=>{const input=panel.querySelectorAll('input[name="simulation-answer"]')[i];if(input&&!input.disabled)input.click();}});
    }else if(view.state==='GRADED'&&released){const panel=el('section','','simulation-card');panel.dataset.testid='result';panel.append(el('h2',`${released.correctCount} / ${released.totalCount} correct`),el('p','Unofficial practice · Binary scoring'));
      const table=el('table');const head=el('tr');['Section','Correct','Questions'].forEach(h=>{const th=el('th',h);th.scope='col';head.append(th);});const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody');released.sections.forEach(s=>{const row=el('tr');row.dataset.testid=`result-${s.sectionId}`;row.append(el('td',names[s.sectionId]),el('td',String(s.correctCount)),el('td',String(s.totalCount)));tbody.append(row);});table.append(tbody);panel.append(table,button('Back to offerings','simulation-home',async()=>{view=null;released=null;await home();},true));shell.append(panel);shell.append(renderDemoNotice({language:'en'}));
    }else{const panel=el('section','','simulation-card');panel.append(el('h2',view.state==='SUBMITTED'||view.state==='EXPIRED'?'Your simulation is being graded':`Simulation ${view.state.toLowerCase()}`),el('p','Answers remain on the server. Reload to check the current state.'),button('Check status','simulation-reload',load,true));shell.append(panel);}
    app.replaceChildren(shell);
  }
  const timer=setInterval(async()=>{
    if(authenticated&&csrf()!==boundNonce){clearIdentity();notice='The signed-in session changed. Sign in again.';render();return;}
    if(!view||busy||polling)return;
    if(view.state==='IN_PROGRESS')view.sections.forEach(s=>{const node=app.querySelector(`[data-clock="${s.sectionId}"]`);if(node)node.textContent=format(remaining(s));});
    const due=view.state==='IN_PROGRESS'&&view.sections.some(s=>s.isOpen&&remaining(s)<=0);
    if (due || ['SUBMITTED', 'EXPIRED'].includes(view.state)) {
      polling = true;
      const attemptId = view.attemptId;
      const nonce = boundNonce;
      const refresh = load();
      const sequence = readSequence;
      const isCurrent = () => sequence === readSequence
        && view?.attemptId === attemptId && boundNonce === nonce;
      try {
        await refresh;
        if (isCurrent()) render();
      } catch (error) {
        if (!isCurrent()) return;
        notice = error.message;
        if (error.status === 401) clearIdentity();
        render();
      } finally {
        polling = false;
      }
    }
  },500);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  window.addEventListener('beforeunload',event=>{if(changed()){event.preventDefault();event.returnValue='';}});
  try{const session=await request('/local-auth/session');authenticated=session.authenticated&&session.principal?.roles?.includes('CANDIDATE');if(authenticated)await home();}catch(error){notice=error.message;}
  render();
}
