// What is to be copied, shown clean and large ABOVE the writing area, across the page's full width (T-112; the owner: "better for it to be on top due to
// space, like we designed originally"). A formula is typeset by KaTeX in display style from its label, on ONE line, never broken ("you had a mathmatical
// formula hitting a new line for being long, dont ever do that") and never scrolled; if it is too wide at MATH_PX its letters are made smaller, exactly as
// much as needed, down to MIN_PX ("just decrease a bit letter font if needed"). A formula that still does not fit is not shown (showItem answers ok: false,
// and the page takes the set's next spare). A sentence is plain printed text at TEXT_PX, wrapping like any sentence.
//   showItem(host, item, macros) -> { ok, px }      px: the size the item was shown at (stored with the row); item.show, when the set has it, is the
//                                                   label as the app draws it on the screen (T-123: a matrix of fractions has its rows apart)
//   oneLine(el)                                       true when a rendered formula sits on one line (a matrix's rows are its shape, not lines)
export const MATH_PX = 28;      // the body size of a formula (KaTeX draws it KATEX_SCALE times this, as the text box does: textbox.css .tb-math .katex)
export const MIN_PX = 22;       // never smaller than this
export const TEXT_PX = 28;      // a sentence

export function renderMath(el, latex, macros = {}) {
  el.innerHTML = globalThis.katex.renderToString(latex, { displayMode: true, throwOnError: false, strict: false, trust: false, output: 'html', macros: { ...macros } });
}

/** True when the rendered formula in `el` is on one line: every top-level box of KaTeX's output starts at the same height, and there is no line break. */
export function oneLine(el) {
  if (el.querySelector('.katex-newline')) return false;
  const boxes = [...el.querySelectorAll('.katex-html > .katex-base, .katex-html > .base')].map((b) => b.getBoundingClientRect());
  if (!boxes.length) return false;
  // on one line every box overlaps every other in height (they share a baseline); a box on a second line would lie wholly below
  const top = Math.max(...boxes.map((r) => r.top)), bottom = Math.min(...boxes.map((r) => r.bottom));
  return top < bottom;
}

/** The inner width of an element (its content box). */
export function innerWidth(el) {
  const cs = getComputedStyle(el);
  return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}

export function showItem(host, item, macros = {}) {
  host.textContent = '';
  if (item.kind === 'text') {
    const p = document.createElement('p');
    p.className = 'st-sentence';
    p.lang = item.lang ?? '';
    p.textContent = item.label;
    host.appendChild(p);
    return { ok: true, px: TEXT_PX };
  }
  const el = document.createElement('div');
  el.className = 'st-math';
  host.appendChild(el);
  renderMath(el, item.show ?? item.label, macros);
  if (el.querySelector('.katex-error')) { host.textContent = ''; return { ok: false, px: 0 }; }
  const room = innerWidth(host);
  let px = MATH_PX;
  el.style.fontSize = `${px}px`;
  const need = el.getBoundingClientRect().width;
  if (need > room) px = Math.floor((MATH_PX * room) / need * 10) / 10;
  for (let i = 0; i < 6 && px >= MIN_PX; i++) {   // the width is very nearly proportional to the size; the rules of fractions are not, so check again
    el.style.fontSize = `${px}px`;
    if (el.getBoundingClientRect().width <= room + 0.5) break;
    px = Math.round((px - 0.5) * 10) / 10;
  }
  if (px < MIN_PX || el.getBoundingClientRect().width > room + 0.5 || !oneLine(el)) { host.textContent = ''; return { ok: false, px: 0 }; }
  return { ok: true, px };
}
