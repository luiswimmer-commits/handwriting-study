// The rows on their way to the owner's table (T-112 rule 4: "sent as it is written so a lost connection loses one item"). One row per item, sent at once,
// in order. A row that could not be sent stays here and is tried again: when the browser says it is back online, at the next item, at the end, or when he
// presses Try again. Nothing waits on a clock he can see.
//
// The POST is the app's Contribute insert (src/contribute/transport.js) without its privacy gate, which belongs to the app's settings and is not on this
// page: the same request, option for option (no cookie, no referrer, no cache, the client key in both headers, return=minimal), and the same answers
// (409 "already there" counts as stored, so a row sent twice is stored once). tests/study/study.test.js sends one row through both and compares them.
//
// What is kept in the browser, and only in this tab's sessionStorage (gone when the tab is closed; removed by clear() at the end): the progress a reload
// needs to carry on (state) and the rows not stored yet. No cookie, no localStorage, no IndexedDB.

/** One row to the table: { ok: true, again?: true } | { ok: false, reason: 'offline' | 'refused', status? } (transport.js's answers). */
export async function send(payload, { endpoint, publishableKey = null, fetchFn = (url, o) => fetch(url, o) } = {}) {
  if (!endpoint) return { ok: false, reason: 'refused' };
  const headers = { 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  if (publishableKey) { headers.apikey = publishableKey; headers.Authorization = `Bearer ${publishableKey}`; }
  let res;
  try {
    res = await fetchFn(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors' });
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (res.ok) return { ok: true };
  if (res.status === 409) return { ok: true, again: true };
  return { ok: false, reason: 'refused', status: res.status };
}

export const KEY = 'lemmascribble.study.t112';

const storage = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

/** The saved progress of this tab, or null. */
export function loadSaved() {
  try { const raw = storage()?.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export class Outbox {
  /** @param {{ config: { endpoint: string, publishableKey: string }, state: object, onChange?: () => void, sendFn?: typeof send }} o */
  constructor({ config, state, onChange = () => {}, sendFn = send }) {
    this.config = config;
    this.state = state;                 // the page's progress, saved with the rows
    this.rows = Array.isArray(state.outbox) ? state.outbox : [];
    this.onChange = onChange;
    this.sendFn = sendFn;
    this.status = 'ok';                 // 'ok' | 'sending' | 'offline' | 'refused'
    this._running = null;
    this._online = () => { this.flush(); };
    globalThis.addEventListener?.('online', this._online);
  }

  get pending() { return this.rows.length; }

  save() {
    try { storage()?.setItem(KEY, JSON.stringify({ ...this.state, outbox: this.rows })); } catch { /* full or blocked: the rows are still in memory */ }
  }

  add(row) { this.rows.push(row); this.save(); return this.flush(); }

  /** Sends what is waiting, one after another; resolves when nothing more can be sent now. */
  flush() {
    if (this._running) return this._running;
    this._running = (async () => {
      while (this.rows.length) {
        this.status = 'sending'; this.onChange();
        const r = await this.sendFn(this.rows[0], { endpoint: this.config.endpoint, publishableKey: this.config.publishableKey });
        if (!r.ok) { this.status = r.reason === 'offline' ? 'offline' : 'refused'; this.onChange(); return; }
        this.rows.shift();
        this.save();
      }
      this.status = 'ok'; this.onChange();
    })().finally(() => { this._running = null; });
    return this._running;
  }

  /** At the end, everything stored: nothing of the study stays in the browser. */
  clear() {
    try { storage()?.removeItem(KEY); } catch { /* nothing kept */ }
    globalThis.removeEventListener?.('online', this._online);
  }
}
