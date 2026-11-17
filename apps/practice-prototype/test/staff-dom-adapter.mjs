import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/app/staff.js', import.meta.url), 'utf8');

// A small DOM adapter follows the existing topic-screen unit-test pattern.
export class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.events = {}; this.attributes = {};
    this.style = {}; this.isConnected = true; this.disabled = false; this.hidden = false; this.error = '';
  }
  append(...children) {
    for (const child of children) {
      if (child.tagName === 'fragment') this.append(...child.children);
      else { this.children.push(child); if (child instanceof Element) child.parentElement = this; }
    }
  }
  prepend(child) { this.children.unshift(child); }
  replaceChildren(...children) { this.children = []; this._text = ''; this._value = undefined; this.append(...children); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return (this._text ?? '') + this.children.map((child) => child.textContent ?? child).join(''); }
  set value(value) {
    this._value = value;
    if (this.tagName === 'select') for (const option of this.children) option.selected = option.value === value;
  }
  get value() {
    if (this.tagName === 'select') return this.selectedOptions[0]?.value ?? '';
    return this._value ?? '';
  }
  get selectedOptions() {
    const selected = this.children.filter((option) => option.selected);
    return selected.length || this.multiple ? selected : this.children.slice(0, 1);
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) { (this.events[name] ??= []).push(callback); }
  async dispatch(name) { for (const callback of this.events[name] ?? []) await callback({ preventDefault() {}, target: this }); }
  setCustomValidity(error) { this.error = error; }
  reportValidity() {
    return [this, ...this.querySelectorAll('input, textarea, select')].every((input) => input.disabled
      || (!input.error && (!input.required || Boolean(input.value))));
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const data = /^\[data-testid="([^"]+)"\]$/.exec(selector);
    if (data) return this.dataset.testid === data[1];
    return this.tagName === selector;
  }
  querySelectorAll(selectors) {
    const selected = selectors.split(',').map((value) => value.trim());
    return this.children.flatMap((child) => child instanceof Element
      ? [...(selected.some((selector) => child.matches(selector)) ? [child] : []), ...child.querySelectorAll(selectors)] : []);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  find(id) { return this.querySelector(`[data-testid="${id}"]`); }
  focus() {}
  reset() {}
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

export function loadScript(extra = {}) {
  const context = vm.createContext({ Headers, Response, URLSearchParams, crypto: globalThis.crypto,
    renderMath: () => new Element('div'), renderTextWithMath: (text) => String(text ?? ''), ...extra });
  vm.runInContext(source.replace(/^import .*\n/, '').replace('export async function openStaffWorkspace', 'async function openStaffWorkspace')
    + '\nglobalThis.api = { openStaffWorkspace, normalizeStaffDecimal, supportedInteraction, renderPrivateQuestion, parseClozeDraft, parseMatchingDraft };', context);
  return context.api;
}
