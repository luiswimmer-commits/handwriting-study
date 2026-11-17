// What is sent when he presses Send (T-089 rule 3), and nothing else: exactly what the agreement's "What is sent" says (src/contribute/agreement.en.md).
//   - the pen strokes of each example he selected: where the pen moved and when (each point [x, y, time]; pressure is not collected and is never sent,
//     whatever a point holds: Luis, 2026-11-16)
//   - the label of each example (the formula or text it stands for) and its kind
//   - the version of the app, the date, and the random contribution number made on the device
// No name, no e-mail, no account, no notebook, no page, no ids of strokes or examples, no colours, no device identifier. A test compares the fields with
// these lists (tests/contribute/contribute.test.js).
export const FIELDS = Object.freeze(['contribution', 'app', 'date', 'examples']);
export const EXAMPLE_FIELDS = Object.freeze(['kind', 'label', 'strokes']);

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** One stroke as sent: its runs, each point [x, y, t] (numbers only; nothing else of the point or the stroke: no pressure). */
const strokeOf = (s) => (s.segments ?? []).map((seg) => seg.map((p) => p.slice(0, 3).filter(num)));

/** The body of one contribution. `examples` are examples of the one dataset store (their ink, label and kind are taken; nothing else). */
export function contributionPayload({ id, examples, appVersion, date = new Date() }) {
  if (typeof id !== 'string' || !id) throw new Error('payload: no contribution number');
  if (typeof appVersion !== 'string' || !appVersion) throw new Error('payload: no app version');
  return {
    contribution: id,
    app: appVersion,
    date: date.toISOString().slice(0, 10),
    examples: examples.map((e) => ({ kind: e.kind === 'text' ? 'text' : 'math', label: String(e.latex), strokes: e.strokes.map(strokeOf) })),
  };
}

/** A random contribution number, made on the device (no clock, no device, no person in it). */
export const newContributionId = () => globalThis.crypto.randomUUID();
