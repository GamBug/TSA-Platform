import assert from 'node:assert/strict';

const beginExpression = `(()=>{
  const root=document.querySelector('#product-header');
  const ids=['product-header','brand','.brand-mark','product-navigation','nav-home','nav-catalog','menu-toggle','demo-chip'];
  const pick=id=>id==='product-header'?root:id==='brand'?root.querySelector('.brand'):id==='product-navigation'?root.querySelector('#product-navigation'):id==='demo-chip'?root.querySelector('.demo-chip'):id.startsWith('.')?root.querySelector(id):root.querySelector('[data-testid="'+id+'"]');
  const rects=()=>Object.fromEntries(ids.map(id=>{const e=pick(id);if(!e||root.hidden)return[id,null];const r=e.getBoundingClientRect();return[id,{x:r.x,y:r.y,width:r.width,height:r.height}]}));
  window.__headerStableRefs=Object.fromEntries(ids.map(id=>[id,pick(id)]));
  if(window.__headerStableRaf)cancelAnimationFrame(window.__headerStableRaf);
  window.__headerStableSamples=[];
  const generation=(window.__headerStableGeneration??0)+1;window.__headerStableGeneration=generation;
  const sample=()=>{if(!window.__headerStableRunning||window.__headerStableGeneration!==generation)return;if(!root.hidden)window.__headerStableSamples.push(rects());window.__headerStableRaf=requestAnimationFrame(sample)};
  window.__headerStableRunning=true;window.__headerStableBaseline=rects();window.__headerStableRaf=requestAnimationFrame(sample);
  return {baseline:window.__headerStableBaseline,gutter:getComputedStyle(document.documentElement).scrollbarGutter};
})()`;

const stopExpression = `(()=>{
  window.__headerStableRunning=false;if(window.__headerStableRaf)cancelAnimationFrame(window.__headerStableRaf);
  const root=document.querySelector('#product-header');
  const ids=['product-header','brand','.brand-mark','product-navigation','nav-home','nav-catalog','menu-toggle','demo-chip'];
  const pick=id=>id==='product-header'?root:id==='brand'?root.querySelector('.brand'):id==='product-navigation'?root.querySelector('#product-navigation'):id==='demo-chip'?root.querySelector('.demo-chip'):id.startsWith('.')?root.querySelector(id):root.querySelector('[data-testid="'+id+'"]');
  const refs=window.__headerStableRefs,base=window.__headerStableBaseline,samples=window.__headerStableSamples;
  const identity=Object.fromEntries(ids.map(id=>[id,refs[id]===pick(id)]));
  const maxDelta=Object.fromEntries(ids.map(id=>[id,Math.max(0,...samples.map(row=>{
    if(!row[id]||!base[id])return 0;return Math.max(...Object.keys(base[id]).map(k=>Math.abs(row[id][k]-base[id][k])));
  }))]));
  return {identity,maxDelta,samples:samples.length,baseline:base};
})()`;

const geometryExpression = `(()=>{
  const root=document.querySelector('#product-header');
  const ids=['product-header','brand','.brand-mark','product-navigation','nav-home','nav-catalog','menu-toggle','demo-chip'];
  const pick=id=>id==='product-header'?root:id==='brand'?root.querySelector('.brand'):id==='product-navigation'?root.querySelector('#product-navigation'):id==='demo-chip'?root.querySelector('.demo-chip'):id.startsWith('.')?root.querySelector(id):root.querySelector('[data-testid="'+id+'"]');
  return Object.fromEntries(ids.map(id=>{const e=pick(id);if(!e||root.hidden)return[id,null];const r=e.getBoundingClientRect();return[id,{x:r.x,y:r.y,width:r.width,height:r.height}]}));
})()`;

export async function captureHeaderGeometry(evaluate) {
  const result = await evaluate(geometryExpression);
  assert.ok(result.brand && result['.brand-mark'] && result['nav-home'] && result['nav-catalog'], 'browse header landmarks are visible');
  return result;
}

export async function assertHeaderGeometryStable(evaluate, expected, label = 'header geometry') {
  const actual = await captureHeaderGeometry(evaluate);
  const deltas = Object.fromEntries(Object.entries(expected).map(([id, rect]) => [id, !rect || !actual[id] ? null : Math.max(...Object.keys(rect).map(key => Math.abs(rect[key] - actual[id][key])))]));
  for (const [id, delta] of Object.entries(deltas)) if (delta !== null) assert.ok(delta <= 1, `${label}: ${id} moved ${delta}px`);
  return { expected, actual, deltas };
}

export async function beginHeaderStability(evaluate) {
  return evaluate(beginExpression);
}

export async function assertHeaderStable(evaluate, label = 'browse routes', { ignoreLayout = [] } = {}) {
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
  const result = await evaluate(stopExpression);
  for (const [id, same] of Object.entries(result.identity)) assert.equal(same, true, `${label}: ${id} node survives route navigation`);
  assert.ok(result.samples >= 2, `${label}: sampled live animation frames`);
  for (const [id, delta] of Object.entries(result.maxDelta)) {
    if (!ignoreLayout.includes(id)) assert.ok(delta <= 1, `${label}: ${id} max layout shift ${delta}px`);
  }
  result.ignoredLayout = ignoreLayout;
  return result;
}

export async function probeScrollbarGutter(evaluate) {
  const result = await evaluate(`(async()=>{
    const html=document.documentElement,app=document.querySelector('#app'),header=document.querySelector('#product-header');
    const stable=getComputedStyle(html).scrollbarGutter;
    const priorMinHeight=app.style.minHeight,priorPaddingBottom=app.style.paddingBottom;
    app.style.minHeight='0';app.style.paddingBottom='0';
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const short={clientWidth:html.clientWidth,innerWidth,scrollHeight:html.scrollHeight,clientHeight:html.clientHeight,headerX:header.getBoundingClientRect().x,headerWidth:header.getBoundingClientRect().width};
    app.style.minHeight='180vh';app.style.paddingBottom=priorPaddingBottom;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const tall={clientWidth:html.clientWidth,innerWidth,scrollHeight:html.scrollHeight,clientHeight:html.clientHeight,headerX:header.getBoundingClientRect().x,headerWidth:header.getBoundingClientRect().width};
    app.style.minHeight=priorMinHeight;app.style.paddingBottom=priorPaddingBottom;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {stable,short,tall};
  })()`);
  assert.equal(result.stable, 'stable', 'root reserves scrollbar gutter for every route height');
  assert.ok(result.short.scrollHeight<=result.short.clientHeight+1,'the short probe route has no document scrollbar');
  assert.ok(result.tall.scrollHeight>result.tall.clientHeight,'the tall probe route has a document scrollbar');
  assert.equal(result.short.headerX, result.tall.headerX, 'short and long pages keep the same header x position');
  assert.equal(result.short.headerWidth, result.tall.headerWidth, 'short and long pages keep the same header width');
  return result;
}
