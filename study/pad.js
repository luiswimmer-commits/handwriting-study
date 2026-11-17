// The writing area (T-112). Pointer events of type pen become strokes, drawn with the app's own ink renderer (src/ink/render.js: the same smoothing as
// the notebook, the wet run as it is written and the kept strokes). Nothing of the notebook's page engine is on this page.
//   - Only a pen writes. A finger or a mouse writes nothing; `onRefused(type)` is called once per press that moves (a resting palm is not counted, nor a
//     touch near the time the pen was seen). The pen's eraser end or barrel button writes nothing either (the page has Clear).
//   - Each pen-down run is a stroke of its own, kept with its own times: points [x, y, t] in page units, t in ms from the run's first point (the form the
//     Contribute payload sends), and beside it the run's start in ms from the item's first pen-down and its pointer type.
//   - The page is the area's size when the item starts (page units = CSS px then); if the area changes size (the tablet turns) the page is scaled to fit.
//   - A text item may have a faint ruling (`ruling`: the line spacing in page units), drawn under the ink and never stored with it.
//   const pad = new Pad({ host, onChange, onRefused }); pad.start({ ruling }); pad.writing() -> { strokes, pointers, runStarts, page, ruling }
import { drawStrokes, WetStroke } from '../src/ink/render.js';

// The pen of the app's training places (src/shell/settings.js TRAINING_PEN: the palette's first slot and the default width; tests/study checks they agree)
export const PEN = Object.freeze({ slot: '--c-ink-black', width: 2.6 });
export const MIN_SCREEN_DISTANCE = 1;   // CSS px between kept points, as the notebook's ink keeps them (src/ink/ink.js); first and last always kept
const MOVED = 12;                       // CSS px a finger or a mouse must move before it counts as an attempt to write
const PALM_MS = 1000;                   // a touch this soon after the pen was seen is the hand, not an attempt
const r2 = (n) => Math.round(n * 100) / 100;
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class Pad {
  constructor({ host, onChange = () => {}, onRefused = () => {} }) {
    Object.assign(this, { host, onChange, onRefused });
    host.classList.add('st-stage');
    host.innerHTML = '<canvas class="st-canvas"></canvas>';
    this.canvas = host.firstElementChild;
    this.ctx = this.canvas.getContext('2d');
    this.style = { color: token(PEN.slot), width: PEN.width };
    this.strokes = [];
    this.size = [1, 1];
    this.ruling = 0;
    this._t0 = null;
    this._run = null;
    this._press = null;
    this._penSeen = -Infinity;
    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(host);
    const c = this.canvas;
    this._h = {
      down: (e) => this._down(e), move: (e) => this._move(e), up: (e) => this._up(e), menu: (e) => e.preventDefault(),
    };
    c.addEventListener('pointerdown', this._h.down);
    c.addEventListener('pointermove', this._h.move);
    c.addEventListener('pointerup', this._h.up);
    c.addEventListener('pointercancel', this._h.up);
    c.addEventListener('contextmenu', this._h.menu);
    this._fit();
  }

  /** A clean page for the next item, the area's size as it is now; `ruling`: line spacing in page units, or 0. */
  start({ ruling = 0 } = {}) {
    const r = this.host.getBoundingClientRect();
    this.size = [Math.max(100, Math.round(r.width)), Math.max(100, Math.round(r.height))];
    this.ruling = ruling;
    this.clear();
  }

  get hasInk() { return this.strokes.length > 0; }

  /** What was written: one stroke per pen-down run, and beside them the pointer type and the start of each. */
  writing() {
    const strokes = this.strokes.map((s) => ({ id: s.id, tool: 'pen', segments: s.segments }));
    return {
      strokes,
      pointers: this.strokes.map((s) => [s.type]),
      runStarts: this.strokes.map((s) => [s.at]),
      page: this.size.slice(),
      ruling: this.ruling,
    };
  }

  clear() {
    this.strokes = [];
    this._run = null;
    this._t0 = null;
    this._draw();
    this.onChange();
  }

  destroy() {
    this._ro.disconnect();
    const c = this.canvas, h = this._h;
    c.removeEventListener('pointerdown', h.down); c.removeEventListener('pointermove', h.move);
    c.removeEventListener('pointerup', h.up); c.removeEventListener('pointercancel', h.up); c.removeEventListener('contextmenu', h.menu);
  }

  // ---------------------------------------------------------------- page <-> screen
  _fit() {
    const r = this.host.getBoundingClientRect(), dpr = globalThis.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this._draw();
  }
  get _scale() { const r = this.host.getBoundingClientRect(); return Math.min(r.width / this.size[0], r.height / this.size[1]) || 1; }
  _at(e) { const r = this.canvas.getBoundingClientRect(), s = this._scale; return [(e.clientX - r.left) / s, (e.clientY - r.top) / s, e.clientX, e.clientY]; }
  _setTransform() { const dpr = globalThis.devicePixelRatio || 1, s = this._scale; this.ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0); }

  _draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._setTransform();
    if (this.ruling > 0) {   // faint lines across the page, the first a spacing down from the top
      ctx.strokeStyle = token('--c-paper-line');
      ctx.lineWidth = 1 / this._scale;
      ctx.beginPath();
      for (let y = this.ruling; y < this.size[1]; y += this.ruling) { ctx.moveTo(0, y); ctx.lineTo(this.size[0], y); }
      ctx.stroke();
    }
    drawStrokes(ctx, this.strokes.map((s) => ({ ...s, tool: 'pen', color: this.style.color, width: this.style.width })));
  }

  // ---------------------------------------------------------------- input
  _down(e) {
    e.preventDefault();
    if (e.pointerType !== 'pen') {
      if (!this._run) this._press = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType || 'mouse', told: false };
      return;
    }
    this._penSeen = performance.now();
    if (this._run || (e.buttons & (2 | 32))) return;   // a run already going, or the eraser end / barrel button: nothing is written
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* the window still ends it */ }
    if (this._t0 === null) this._t0 = e.timeStamp;
    const [x, y, sx, sy] = this._at(e);
    this._run = { id: e.pointerId, t0: e.timeStamp, at: Math.max(0, Math.round(e.timeStamp - this._t0)), pts: [[r2(x), r2(y), 0]], last: [sx, sy], pending: null };
    this._setTransform();
    this._wet = new WetStroke(this.ctx, this.style);
    this._wet.add([x, y]);
  }

  _move(e) {
    if (e.pointerType !== 'pen') {
      const p = this._press;
      if (p && p.id === e.pointerId && !p.told && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= MOVED) {
        p.told = true;
        if (performance.now() - this._penSeen > PALM_MS) this.onRefused(p.type);
      }
      return;
    }
    this._penSeen = performance.now();
    const run = this._run;
    if (!run || run.id !== e.pointerId) return;
    const list = typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e];
    for (const c of list) {
      const [x, y, sx, sy] = this._at(c);
      const t = Math.max(run.pts.at(-1)[2], Math.round(c.timeStamp - run.t0));
      if (Math.hypot(sx - run.last[0], sy - run.last[1]) >= MIN_SCREEN_DISTANCE) {
        run.pts.push([r2(x), r2(y), t]); run.last = [sx, sy]; run.pending = null;
        this._wet.add([x, y]);
      } else run.pending = [r2(x), r2(y), t];
    }
  }

  _up(e) {
    if (e.pointerType !== 'pen') { if (this._press?.id === e.pointerId) this._press = null; return; }
    const run = this._run;
    if (!run || run.id !== e.pointerId) return;
    if (run.pending) run.pts.push(run.pending);
    this._run = null;
    this.strokes.push({ id: `r${this.strokes.length + 1}`, segments: [run.pts], type: e.pointerType, at: run.at });
    this._draw();
    this.onChange();
  }
}
