// The study page (T-112): opened from Prolific with ?group=math|pt|en and Prolific's ids. In order: the agreement (I agree / I do not agree), the stylus
// check, two practice items (not stored), the items one at a time (each stored as it is written), the end (everything stored, then back to Prolific with
// the completion code). Nothing moves on by itself and nothing is timed: Next moves on, once something is written with the pen.
import { textsFor, AGREEMENT_VERSION } from './texts.js';
import { GROUPS, PRACTICE, CHECK_TRIES, RULING, readLink, langOfGroup, readConfig, prolificReturn, setIndex, screenFits, browserName, rowOf, allPen } from './plan.js';
import { showItem } from './show.js';
import { Pad } from './pad.js';
import { Outbox, loadSaved, KEY } from './outbox.js';

const app = document.getElementById('st-app');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const q = new URLSearchParams(location.search);
const lang = langOfGroup(q.get('group'));
const T = textsFor(lang);
document.documentElement.lang = lang === 'pt' ? 'pt' : 'en';
document.title = T.title;

const study = { link: null, config: null, set: null, setAt: 0, state: null, outbox: null, pad: null, write: null };
globalThis.__study = study;   // for the browser suite (tests/study/study.e2e.cjs): read only

// ---------------------------------------------------------------- simple screens
function note(title, text, action = null) {
  study.write = null;
  if (study.pad) { study.pad.destroy(); study.pad = null; }
  app.innerHTML = `<div class="st-note" data-st="note"><div class="st-card"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${action ?? ''}</div></div>`;
}
const linkButton = (href, label, primary = true) => `<a class="st-btn${primary ? ' is-primary' : ''}" data-st="back" href="${esc(href)}" rel="noreferrer">${esc(label)}</a>`;

function save() { study.outbox?.save(); }
function forget() { study.outbox?.clear(); try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ } }

// ---------------------------------------------------------------- 1. the agreement
async function agreement() {
  // the agreement as study/build.cjs renders it from docs/release/study-agreement.<lang>.md (the app's Contribute text renderer, run when the page is built)
  const res = await fetch(new URL(`./agreement.${lang}.html`, import.meta.url), { cache: 'no-store' });
  const html = res.ok ? await res.text() : '';
  study.write = null;
  app.innerHTML = `<div class="st-doc" data-st="agreement"><div class="st-doc-body"><article class="st-doc-text">${html}</article></div>
    <div class="st-doc-foot"><button type="button" class="st-btn" data-act="disagree">${esc(T.disagree)}</button>
    <button type="button" class="st-btn is-primary" data-act="agree">${esc(T.agree)}</button></div></div>`;
  app.querySelector('[data-act=agree]').onclick = () => { study.state.agreed = AGREEMENT_VERSION; go('check'); };
  app.querySelector('[data-act=disagree]').onclick = () => { forget(); note(T.declinedTitle, T.declined, linkButton(prolificReturn(study.config, study.config.noConsentCode), T.backToProlific)); };
}

// ---------------------------------------------------------------- the writing screen (check, practice, items)
function writing() {
  if (study.write) return study.write;
  app.innerHTML = `<div class="st-write" data-st="write">
    <div class="st-bar"><span class="st-count" data-st="count"></span><span class="st-msg" data-st="msg" role="status" aria-live="polite"></span>
      <button type="button" class="st-btn" data-act="clear">${esc(T.clear)}</button>
      <button type="button" class="st-btn is-primary" data-act="next">${esc(T.next)}</button></div>
    <div class="st-body"><section class="st-item" data-st="item" aria-live="polite"></section><div data-st="stage"></div></div></div>`;
  const $ = (s) => app.querySelector(s);
  const w = { $, item: null, onNext: null, onRefused: null, msg: (text, warn = true) => { const m = $('[data-st=msg]'); m.textContent = text ?? ''; m.classList.toggle('is-quiet', !warn); } };
  study.pad = new Pad({ host: $('[data-st=stage]'), onChange: () => sync(), onRefused: (type) => w.onRefused?.(type) });
  $('[data-act=clear]').onclick = () => { study.pad.clear(); };
  $('[data-act=next]').onclick = () => { if (study.pad.hasInk) w.onNext?.(); };
  study.write = w;
  addEventListener('resize', () => { if (study.write === w && w.item) paint(w.item, w.hint); });
  return w;
}
function sync() {
  const w = study.write;
  if (!w) return;
  const ink = study.pad?.hasInk ?? false;
  w.$('[data-act=next]').disabled = !ink;
  w.$('[data-act=clear]').disabled = !ink;
  if (ink && w.clearOnInk) { w.msg(''); w.clearOnInk = false; }
}
// The item on top, full width; the writing area is what is left, and must stay at least half the window's height (else the item is not used).
function paint(item, hint = false) {
  const w = study.write;
  w.item = item; w.hint = hint;
  const host = w.$('[data-st=item]');
  const shown = showItem(host, item, study.macros);
  if (shown.ok && hint) host.insertAdjacentHTML('beforeend', `<p class="st-hint">${esc(T.howToWrite)}</p>`);
  const room = w.$('[data-st=stage]').getBoundingClientRect().height >= 0.5 * innerHeight;
  w.px = shown.px;
  return shown.ok && room;
}
function present({ count, item, hint = false, onNext, onRefused, message = '' }) {
  const w = writing();
  w.$('[data-st=count]').textContent = count;
  w.onNext = onNext;
  w.onRefused = onRefused;
  w.msg(message, false);
  const ok = paint(item, hint);
  study.pad.start({ ruling: item.kind === 'text' ? RULING : 0 });   // sized to the area the item leaves
  sync();
  return ok;
}

// ---------------------------------------------------------------- 2. the stylus check
function check() {
  if (!screenFits({ width: screen.width, height: screen.height, touchPoints: navigator.maxTouchPoints ?? 0 })) { incompatible(); return; }
  const s = study.state;
  s.tries = s.tries ?? 0;
  present({
    count: T.checkTitle, item: { kind: 'text', label: T.checkWord, lang }, message: T.checkAsk,
    onNext: () => { const { pointers } = study.pad.writing(); if (allPen(pointers)) go('practice'); else refused(); },
    onRefused: () => refused(),
  });
  function refused() {
    if (study.write?.blocked) return;
    s.tries += 1; save();
    if (s.tries >= CHECK_TRIES) { incompatible(); return; }
    study.pad.clear();
    const w = study.write;
    w.blocked = true;
    w.$('[data-st=stage]').insertAdjacentHTML('beforeend', `<div class="st-cover" data-st="cover"><div class="st-card"><h2>${esc(T.onlyPen)}</h2>
      <button type="button" class="st-btn is-primary" data-act="again">${esc(T.tryAgain)}</button></div></div>`);
    w.$('[data-act=again]').onclick = () => { w.$('[data-st=cover]')?.remove(); w.blocked = false; study.pad.clear(); };
  }
}
function incompatible() {
  forget();
  note(T.noDeviceTitle, T.noDevice, linkButton(prolificReturn(study.config, study.config.incompatibleCode), T.backToProlific));
}

// ---------------------------------------------------------------- 3. practice, not stored
function practice() {
  const s = study.state;
  s.practice = s.practice ?? 0;
  const list = PRACTICE[study.link.group];
  if (s.practice >= list.length) { go('items'); return; }
  const kind = GROUPS[study.link.group].kind;
  present({
    count: T.practice(s.practice + 1, list.length), item: { kind, label: list[s.practice], lang }, hint: true,
    onNext: () => {
      const { pointers } = study.pad.writing();
      if (!allPen(pointers)) { againPen(); return; }
      s.practice += 1; save(); practice();
    },
    onRefused: () => { study.write.msg(T.onlyPen); study.write.clearOnInk = true; },
  });
}
function againPen() { study.pad.clear(); study.write.msg(T.againPen); study.write.clearOnInk = true; }

// ---------------------------------------------------------------- 4. the items, each stored as it is written
function total() { return Math.min(study.config.items[GROUPS[study.link.group].kind], study.set.items.length); }
function itemAt(i) {
  const s = study.state;
  const sw = s.swaps?.[i];
  return sw === undefined ? { item: study.set.items[i], at: i } : { item: study.set.spares[sw], at: 100 + sw };
}
function items() {
  const s = study.state;
  s.done = s.done ?? 0;
  if (s.done >= total()) { go('end'); return; }
  const kind = GROUPS[study.link.group].kind;
  let { item, at } = itemAt(s.done);
  const shown = present({
    count: T.counter(s.done + 1, total()), item: { kind, label: item.label, lang }, hint: s.done === 0,
    message: study.outbox.status === 'offline' ? T.offline : '',
    onNext: () => {
      const ink = study.pad.writing();
      if (!allPen(ink.pointers)) { againPen(); return; }
      const row = rowOf({
        link: study.link, item, setAt: study.setAt, itemAt: at, shownPx: study.write.px, strokes: ink.strokes, pointers: ink.pointers, runStarts: ink.runStarts,
        page: ink.page, ruling: ink.ruling,
        screen: [screen.width, screen.height], browser: browserName(navigator.userAgent), agreement: s.agreed,
      });
      s.done += 1;
      study.outbox.add(row);   // saved with the progress at once; sent behind the next item
      items();
    },
    onRefused: () => { study.write.msg(T.onlyPen); study.write.clearOnInk = true; },
  });
  if (!shown) {   // a formula this screen cannot show at its size: the set's next spare takes its place
    s.swaps = s.swaps ?? {};
    s.spare = s.spare ?? 0;
    if (s.spare < (study.set.spares?.length ?? 0)) { s.swaps[s.done] = s.spare++; save(); items(); }
    else { s.done += 1; save(); items(); }
  }
}

// ---------------------------------------------------------------- 5. the end
async function end() {
  const box = study.outbox;
  const show = () => {
    if (box.pending === 0) {
      forget();
      note(T.doneTitle, T.done, linkButton(prolificReturn(study.config, study.config.completionCode), T.backToProlific));
      return;
    }
    if (box.status === 'sending' || box.status === 'ok') { note(T.sending, ''); return; }
    note(box.status === 'offline' ? T.offline : T.refused, '', `<button type="button" class="st-btn is-primary" data-act="retry">${esc(T.tryAgain)}</button>`);
    app.querySelector('[data-act=retry]').onclick = () => { box.flush(); };
  };
  box.onChange = () => { if (study.state.step === 'end') show(); };
  show();
  await box.flush();
  show();
}

// ---------------------------------------------------------------- the steps
const STEPS = { agree: agreement, check, practice, items, end };
function go(step) {
  study.state.step = step;
  save();
  if (step === 'items' || step === 'end') study.outbox.flush();
  STEPS[step]();
}

async function boot() {
  let raw = null;
  try { const r = await fetch(new URL('config.json', document.baseURI), { cache: 'no-store', credentials: 'omit' }); if (r.ok) raw = await r.json(); } catch { /* not set up */ }
  const cfg = readConfig(raw);
  if (!cfg.ok) { note(T.notSetUp, ''); return; }
  study.config = cfg.config;
  const link = readLink(location.search);
  if (!link) { note(T.badLink, ''); return; }
  study.link = link;
  const data = await (await fetch(new URL(`./${GROUPS[link.group].sets}`, import.meta.url))).json();
  study.setAt = setIndex(link.pid, data.sets.length);
  study.set = data.sets[study.setAt];
  study.macros = data.macros ?? {};
  const key = `${link.group}|${link.pid}|${link.sessionId}`;
  const saved = loadSaved();
  study.state = saved && saved.key === key ? saved : { v: 1, key, step: 'agree' };
  study.outbox = new Outbox({ config: study.config, state: study.state, onChange: () => {
    const w = study.write;
    if (study.state.step !== 'items' || !w) return;
    const m = w.$('[data-st=msg]');
    if (study.outbox.status === 'offline') w.msg(T.offline, false);
    else if (m.textContent === T.offline) w.msg('');
  } });
  if (study.state.step !== 'agree' && study.state.agreed !== AGREEMENT_VERSION) study.state.step = 'agree';
  go(study.state.step);
}

boot().catch((err) => { console.error(err); note(T.notSetUp, ''); });
