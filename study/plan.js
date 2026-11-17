// The study page's rules, without the DOM (T-112): the link from Prolific, the configuration, which set a writer gets, the row stored for each item, the
// device check. Node imports it for the tests (tests/study/study.test.js).
import { contributionPayload, newContributionId } from '../src/contribute/payload.js';
import { STUDY_VERSION } from './texts.js';

/** The three groups: the formulas (English page) and the two languages of sentences. */
export const GROUPS = Object.freeze({
  math: Object.freeze({ kind: 'math', lang: 'en', sets: 'sets.math.json' }),
  en: Object.freeze({ kind: 'text', lang: 'en', sets: 'sets.en.json' }),
  pt: Object.freeze({ kind: 'text', lang: 'pt', sets: 'sets.pt.json' }),
});

/** How many items a writer copies (the owner, 2026-11-16: "make sure there is next button instead of timer": a number, never a clock). The configuration's
 *  `items` may change them to match the study's stated length on Prolific. */
export const ITEMS = Object.freeze({ math: 35, text: 30 });
export const PRACTICE = Object.freeze({
  math: Object.freeze(['y=2x+1', '\\frac{3}{4}']),
  en: Object.freeze(['The sun is warm today.', 'I like green apples.']),
  pt: Object.freeze(['O sol está quente hoje.', 'Eu gosto de maçãs verdes.']),
});
// the faint ruling of a sentence's writing area: line spacing in page units (CSS px when the item starts), about 14 mm on a tablet's screen (an iPad shows
// about 132 CSS px to the inch: 72 px is 13.9 mm; the browser cannot know the screen's real size). Stored with each row as `ruling`; formulas have none.
export const RULING = 72;
export const CHECK_TRIES = 3;        // a finger or a mouse gets a clear line and another try; the third sends him back
export const MIN_SHORT_SIDE = 600;   // CSS px on the screen's short side
export const PROLIFIC_COMPLETE = 'https://app.prolific.com/submissions/complete';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const CODE = /^[A-Za-z0-9_-]{1,32}$/;
const SAFE_URL = /^https:\/\/[^\s]+$|^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[^\s]*$/;

/** The link Prolific opens: ?group=math|pt|en&PROLIFIC_PID=..&STUDY_ID=..&SESSION_ID=.. -> { group, pid, studyId, sessionId } or null. */
export function readLink(search) {
  const q = new URLSearchParams(search);
  const group = q.get('group'), pid = q.get('PROLIFIC_PID'), studyId = q.get('STUDY_ID'), sessionId = q.get('SESSION_ID');
  if (!Object.hasOwn(GROUPS, group ?? '') || ![pid, studyId, sessionId].every((v) => ID.test(v ?? ''))) return null;
  return Object.freeze({ group, pid, studyId, sessionId });
}

/** The page's language for a group (Portuguese for pt; English otherwise), also from a group that is not known yet. */
export const langOfGroup = (group) => (group === 'pt' ? 'pt' : 'en');

/**
 * The configuration file beside the page (config.json, never in the repository; study/README.md):
 *   { endpoint, publishableKey, completionCode, incompatibleCode, noConsentCode, items?: { math, text }, prolificUrl? }
 * -> { ok: true, config } | { ok: false, missing: [keys] }. No value is ever guessed; prolificUrl defaults to Prolific's own completion address.
 */
export function readConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const missing = [];
  const endpoint = str(c.endpoint);
  if (!SAFE_URL.test(endpoint)) missing.push('endpoint');
  const publishableKey = str(c.publishableKey);
  if (!publishableKey || /^sb_secret_/i.test(publishableKey)) missing.push('publishableKey');
  const completionCode = str(c.completionCode), incompatibleCode = str(c.incompatibleCode), noConsentCode = str(c.noConsentCode);
  if (!CODE.test(completionCode)) missing.push('completionCode');
  if (!CODE.test(incompatibleCode)) missing.push('incompatibleCode');
  if (!CODE.test(noConsentCode)) missing.push('noConsentCode');
  const prolificUrl = str(c.prolificUrl) || PROLIFIC_COMPLETE;
  if (!SAFE_URL.test(prolificUrl)) missing.push('prolificUrl');
  const count = (v, d) => (Number.isInteger(v) && v >= 1 && v <= 200 ? v : d);
  const items = Object.freeze({ math: count(c.items?.math, ITEMS.math), text: count(c.items?.text, ITEMS.text) });
  if (missing.length) return { ok: false, missing };
  return { ok: true, config: Object.freeze({ endpoint, publishableKey, completionCode, incompatibleCode, noConsentCode, prolificUrl, items }) };
}

/** Where a button sends him back to Prolific: with a completion code, or (no code: he did not agree) Prolific's own site. */
export function prolificReturn(config, code = null) {
  const base = config?.prolificUrl ?? PROLIFIC_COMPLETE;
  if (!code) return `${new URL(base).origin}/`;
  const u = new URL(base);
  u.searchParams.set('cc', code);
  return u.toString();
}

/** A small, stable hash of a text (FNV-1a, 32 bits). */
export function hash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Which of the pre-built sets a writer gets: from his Prolific ID, so a reload gives the same set and no counter is needed. */
export const setIndex = (pid, count) => hash(`t112:${pid}`) % count;

/** The items a writer copies, in order: the set's first `n` (a formula that cannot be shown on his screen is replaced by the set's next spare). */
export function itemsOf(set, n) {
  return set.items.slice(0, n);
}

/** Whether the screen can be a writer's: touch, and a short side of at least MIN_SHORT_SIDE CSS px. */
export const screenFits = ({ width, height, touchPoints }) => Math.min(width, height) >= MIN_SHORT_SIDE && touchPoints > 0;

/** The browser's name only (no version, no device): what rule 4 stores. */
export function browserName(ua = '') {
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/EdgA?\/|EdgiOS\//.test(ua)) return 'Edge';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/CriOS\/|Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Other';
}

/** The row stored for one item, and nothing else (tests/study/study.test.js compares the fields with ROW_FIELDS). */
export const ROW_FIELDS = Object.freeze(['contribution', 'app', 'date', 'examples', 'study_group', 'prolific_pid', 'study_id', 'session_id', 'lang', 'keys',
  'set_index', 'item_index', 'shown_px', 'page', 'ruling', 'pointers', 'run_starts', 'screen', 'browser', 'agreement']);

/**
 * One row. `strokes`: the page's pen strokes as the store keeps them ({ segments: [[[x, y, t]...]...] }); `pointers` and `runStarts` follow the same
 * nesting (per stroke, per run: the pointer type, and the run's first point in ms from the item's first pen-down). The ink goes through the app's own
 * Contribute payload (src/contribute/payload.js), so its form is exactly what Contribute sends.
 */
export function rowOf({ link, item, setAt, itemAt, shownPx, strokes, pointers, runStarts, page, ruling = 0, screen, browser, agreement, id = newContributionId(), date = new Date() }) {
  const group = GROUPS[link.group];
  const base = contributionPayload({ id, appVersion: STUDY_VERSION, date, examples: [{ kind: group.kind, latex: item.label, strokes }] });
  return {
    ...base,
    study_group: link.group, prolific_pid: link.pid, study_id: link.studyId, session_id: link.sessionId,
    lang: group.kind === 'math' ? 'latex' : group.lang,
    keys: String(item.keys ?? '').split(' ').filter(Boolean),
    set_index: setAt, item_index: itemAt,
    shown_px: Math.round(shownPx * 10) / 10,
    page: page.map((v) => Math.round(v)),
    ruling: ruling > 0 ? Math.round(ruling) : null,
    pointers: pointers.map((runs) => runs.map((p) => String(p))),
    run_starts: runStarts.map((runs) => runs.map((t) => Math.max(0, Math.round(t)))),
    screen: screen.map((v) => Math.round(v)),
    browser,
    agreement,
  };
}

/** True when every run of every stroke was made with a pen (an item written otherwise is not taken). */
export const allPen = (pointers) => pointers.length > 0 && pointers.every((runs) => runs.length > 0 && runs.every((p) => p === 'pen'));
