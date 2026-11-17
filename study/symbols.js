// The symbol groups (ko, ja, zh) without the DOM (T-112; the owner, 2026-11-16: "we care mostly about the symbol instead of the sequence ... writing all
// symbols then repeating"; "like the shape labeler in our app, also keep the x button in case labeler makes mistake and the view underneath, a 2x
// repetition of each letter before next"; "lets just allow it to run for the ammount i pre-pay and close when ended time").
// A writer copies one symbol at a time, each twice, as the app's pack trainer takes drawings: a drawing is taken when the pen has been lifted for
// takeMs, the area clears for the second repetition, and when both are in, the next symbol comes by itself moveMs later. Under the area a strip shows
// the symbol's two places (a small picture with an x each). x empties a place (it becomes the one being filled); the chevron goes back one symbol to
// see its two pictures and x one of them. So that this works with an insert-only table, a symbol's two rows are sent only when the FOLLOWING symbol is
// complete, at the end, or when the page is hidden; what is sent can no longer be taken back.
// The session runs for the paid time: `minutes` of writing from the first real symbol, the time the page is hidden left out (he has left the tab). When
// the time is up nothing is cut: a drawing in progress is taken when the pen lifts as usual, then everything unsent is sent and the session ends.
// He starts at the link's set and walks on through the list; past the last set he starts again from the first.
//   const s = new SymbolSession({ sets, start, ink, onSend, onEnd, onChange }); s.begin(); s.penDown(); s.penUp(); ...

// takeMs: the pack trainer takes a drawing with the shapes tool's grouping time (src/packs/trainer/capture.js sets the `shapes` tool, whose wait is
// src/ink/recorder.js GROUP_MS = 1000). moveMs: src/packs/trainer/trainer.js MOVE_MS = 900. Both copied, not imported (those modules bring the app's
// page engine; tests/study/symbols.test.js checks they still agree). perSet: the symbols of a set (a row's item_index is place x reps + repetition, 0
// to 179, inside the table's 0..199). minutes: the paid time.
export const SYMBOLS = Object.freeze({ perSet: 90, reps: 2, minutes: 10, takeMs: 1000, moveMs: 900 });

/** A symbol's one key, as stored in the row's `keys`: `u.` and its code point in hex, at least four digits (你 -> u.4f60). */
export const keyOf = (ch) => `u.${ch.codePointAt(0).toString(16).padStart(4, '0')}`;

/** The minutes left as plain words, no seconds: "8 min left", in the last minute "under a minute". */
export const minutesLeft = (ms) => (ms <= 60000 ? 'under a minute' : `${Math.ceil(ms / 60000)} min left`);

const blank = () => [null, null];

export class SymbolSession {
  /**
   * @param {{ sets: { items: { label: string, keys: string }[] }[], start?: number, state?: object|null, minutes?: number, takeMs?: number, moveMs?: number,
   *   wrap?: boolean, ink: { read: () => object|null, clear: () => void, has: () => boolean },
   *   onSend?: (rows: object[]) => void, onEnd?: () => void, onChange?: () => void,
   *   now?: () => number, setTimer?: Function, clearTimer?: Function }} o
   * ink.read(): what is written now ({ strokes, pointers, runStarts, page } of the pad, plus shownPx), or null when nothing is.
   */
  constructor({ sets, start = 0, state = null, minutes = SYMBOLS.minutes, takeMs = SYMBOLS.takeMs, moveMs = SYMBOLS.moveMs, wrap = true, ink,
    onSend = () => {}, onEnd = () => {}, onChange = () => {}, now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h) }) {
    Object.assign(this, { sets, ink, onSend, onEnd, onChange, now, wrap, takeMs, moveMs });
    this.limit = minutes * 60000;
    this._set = setTimer; this._clear = clearTimer;
    this.s = state ?? { pos: { set: start, place: 0 }, cur: blank(), prev: null, viewing: 'cur', done: 0, elapsed: 0, closing: false, ended: false };
    this._since = null;       // when the clock last started running (visible), or null
    this._take = null;        // the take timer
    this._move = null;        // the move-on timer
    this._end = null;         // the time-up timer
  }

  // ---------------------------------------------------------------- what is shown
  symbolAt({ set, place }) { return this.sets[set].items[place]; }
  /** The symbol in view (the current one, or the previous one after the chevron) and its two places; `filling`: the place a drawing goes to. */
  view() {
    const s = this.s, prev = s.viewing === 'prev' && s.prev;
    const pos = prev ? s.prev.pos : s.pos, reps = prev ? s.prev.reps : s.cur;
    const filling = reps.findIndex((r) => r === null);
    return { ...this.symbolAt(pos), pos, reps, filling, viewing: prev ? 'prev' : 'cur', canBack: !prev && !!s.prev && s.prev.reps.some((r) => r && !r.sent) };
  }
  get done() { return this.s.done; }
  get ended() { return this.s.ended; }
  /** Writing time left in ms (the clock runs only while the page is visible and the session has begun). */
  left() { return Math.max(0, this.limit - this.elapsed()); }
  elapsed() { return this.s.elapsed + (this._since === null ? 0 : this.now() - this._since); }

  // ---------------------------------------------------------------- the clock
  /** The first real symbol is shown: the clock starts (or carries on after a reload). */
  begin() { this.visible(true); this.onChange(); }
  /** The page is shown or hidden. Hidden: the clock stops and everything unsent is sent (he may not come back). */
  visible(on) {
    if (this.s.ended) return;
    if (on && this._since === null) { this._since = this.now(); this._armEnd(); }
    if (!on && this._since !== null) {
      this.s.elapsed += this.now() - this._since; this._since = null;
      this._clear(this._end); this._end = null;
      this._sendAll();
    }
  }
  _armEnd() { this._clear(this._end); if (Number.isFinite(this.limit)) this._end = this._set(() => this.timeUp(), Math.max(0, this.left())); }
  /** The paid time is up: nothing is cut. A drawing in progress (ink in the area) is taken when its pause ends; then the session closes. */
  timeUp() {
    if (this.s.ended || this.s.closing) return;
    if (this.left() > 0) { this._armEnd(); return; }
    this.s.closing = true;
    if (!this.ink.has() && !this._take) this._finish();
    else this.onChange();
  }

  // ---------------------------------------------------------------- the pen
  /** A pen-down in the area: the wait to take the drawing starts over; a pen-down while the page waits to move on moves on at once. */
  penDown() {
    this._clear(this._take); this._take = null;
    if (this._move) { this._clear(this._move); this._move = null; this._moveOn(); }
  }
  /** The pen lifted, with ink in the area: the drawing is taken after takeMs unless the pen comes down again. Nothing is taken without ink. */
  penUp() {
    this._clear(this._take); this._take = null;
    if (!this.ink.has() || this.s.ended) return;
    this._take = this._set(() => { this._take = null; this.take(); }, this.takeMs);
  }
  /** Clear: the area is emptied (by the page) and the wait stops. */
  cleared() {
    this._clear(this._take); this._take = null;
    if (this.s.closing) this._finish();
  }
  /** Take what is written as the drawing for the place being filled (also Next). */
  take() {
    this._clear(this._take); this._take = null;
    const ink = this.ink.read();
    if (!ink || this.s.ended) return false;
    const v = this.view();
    if (v.filling < 0) return false;
    v.reps[v.filling] = { ...ink, sent: false };
    this.ink.clear();
    if (v.reps.every(Boolean)) {
      if (v.viewing === 'prev') this.s.viewing = 'cur';          // the previous symbol is whole again: back to the current one
      else { this.s.done += 1; if (!this.s.closing) this._move = this._set(() => { this._move = null; this._moveOn(); }, this.moveMs); }
    }
    if (this.s.closing) { this._finish(); return true; }
    this.onChange();
    return true;
  }

  // ---------------------------------------------------------------- x and the chevron
  /** x on a place of the current or the previous symbol: that drawing is dropped (nothing was sent) and the place is the one being filled. */
  remove(which, rep) {
    const reps = which === 'prev' ? this.s.prev?.reps : this.s.cur;
    if (!reps?.[rep] || reps[rep].sent) return false;
    if (which === 'cur' && reps.every(Boolean)) { this.s.done -= 1; this._clear(this._move); this._move = null; }
    reps[rep] = null;
    this.s.viewing = which === 'prev' ? 'prev' : 'cur';
    this.ink.clear();
    this.onChange();
    return true;
  }
  /** The chevron: back one symbol (to see its two pictures and x one), and forward again. */
  back() { if (!this.view().canBack) return false; this._clear(this._move); this._move = null; this.s.viewing = 'prev'; this.ink.clear(); this.onChange(); return true; }
  forward() {
    if (this.s.viewing !== 'prev') return false;
    if (this.s.prev.reps.some((r) => r === null)) return false;   // a removed drawing must be drawn again first
    this.s.viewing = 'cur'; this.ink.clear();
    if (this.s.cur.every(Boolean) && !this._move) this._move = this._set(() => { this._move = null; this._moveOn(); }, this.moveMs);
    this.onChange();
    return true;
  }

  // ---------------------------------------------------------------- moving on, sending, the end
  nextPos({ set, place }) {
    if (place + 1 < this.sets[set].items.length) return { set, place: place + 1 };
    if (set + 1 < this.sets.length) return { set: set + 1, place: 0 };
    return this.wrap ? { set: 0, place: 0 } : null;
  }
  _moveOn() {
    const s = this.s;
    if (s.ended || !s.cur.every(Boolean)) return;
    if (s.prev) this._send(s.prev);
    s.prev = { pos: s.pos, reps: s.cur };
    const next = this.nextPos(s.pos);
    if (!next || this.left() <= 0) { this._finish(); return; }
    s.pos = next; s.cur = blank(); s.viewing = 'cur';
    this.onChange();
  }
  _rowsOf(sym) {
    const item = this.symbolAt(sym.pos);
    return sym.reps.map((r, rep) => (r && !r.sent ? { item, setAt: sym.pos.set, itemAt: sym.pos.place * SYMBOLS.reps + rep, ink: r } : null)).filter(Boolean);
  }
  _send(sym) {
    const rows = this._rowsOf(sym);
    if (!rows.length) return;
    for (const r of sym.reps) if (r) r.sent = true;
    this.onSend(rows);
  }
  _sendAll() { if (this.s.prev) this._send(this.s.prev); this._send({ pos: this.s.pos, reps: this.s.cur }); this.onChange(); }
  _finish() {
    if (this.s.ended) return;
    this._clear(this._take); this._clear(this._move); this._clear(this._end); this._take = this._move = this._end = null;
    if (this._since !== null) { this.s.elapsed += this.now() - this._since; this._since = null; }
    this.s.ended = true;
    this._sendAll();
    this.onEnd();
  }
  /** Stop every timer (the page is leaving this screen). */
  stop() { this._clear(this._take); this._clear(this._move); this._clear(this._end); this._take = this._move = this._end = null; if (this._since !== null) { this.s.elapsed += this.now() - this._since; this._since = null; } }
}
