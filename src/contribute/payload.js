// What is sent when he presses Send (T-089 rule 3, T-118), and nothing else: exactly what the agreement's "What is sent" says (src/contribute/agreement.en.md).
//   - the pen strokes of each example he selected: where the pen moved and when (each point [x, y, time]; pressure is not collected and is never sent,
//     whatever a point holds: Luis, 2026-11-16)
//   - the label of each example (the formula or text it stands for, or the shape id of a shape drawing) and its kind ('math', 'text' or 'shape');
//     a shape drawing asked for by number of wires (T-132) also says that number (`legs`, the shape it stands for: an AND with three inputs)
//   - for a shape pack he made, once per pack in a contribution: the pack's random number and, for each of its shapes in the contribution, the shape id,
//     the name he gave it and its outline (the outline's lines only: never an uploaded picture)
//   - the version of the app, the date, and the random contribution number made on the device
// No name, no e-mail, no account, no notebook, no page, no ids of strokes or examples, no colours, no device identifier. A test compares the fields with
// these lists (tests/contribute/contribute.test.js).
//
// The table refuses an `examples` of 5,000,000 bytes or more (its size check, docs/release/contributions-server.md). A selection that would be larger is
// cut into several contributions (contributionParts), each under SIZE_LIMIT as storedSize reckons it, each with its own number: nothing is dropped.
export const FIELDS = Object.freeze(['contribution', 'app', 'date', 'examples']);
export const EXAMPLE_FIELDS = Object.freeze(['kind', 'label', 'strokes']);
/** The pack entry of a pack he made: { kind: 'pack', label: its random number, shapes } */
export const PACK_FIELDS = Object.freeze(['kind', 'label', 'shapes']);
export const SHAPE_FIELDS = Object.freeze(['id', 'name', 'outline']);
/** Of an outline as the pack stores it, what is sent: its lines (src/packs/FORMAT.md `outline`); never `source` or an uploaded `image`. */
export const OUTLINE_FIELDS = Object.freeze(['path', 'dashed', 'dashedPath', 'extra']);
/** The most one contribution's `examples` may weigh, as storedSize reckons it: under the table's 5,000,000-byte check, with room to spare. */
export const SIZE_LIMIT = 4_000_000;

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** One stroke as sent: its runs, each point [x, y, t] (numbers only; nothing else of the point or the stroke: no pressure). */
const strokeOf = (s) => (s.segments ?? []).map((seg) => seg.map((p) => p.slice(0, 3).filter(num)));

/** A shape drawing's number of wires as sent (T-132: asked for by number in the trainer, src/packs/wires.js): whole numbers on `in` and `out` only. */
const SIDES = ['in', 'out'];
const legsOf = (s) => {
  const l = s?.legs, out = {};
  if (l && typeof l === 'object') for (const k of SIDES) if (Number.isInteger(l[k]) && l[k] >= 0 && l[k] <= 16) out[k] = l[k];
  return Object.keys(out).length ? out : null;
};

/** One example as sent. A writing example of the dataset store (its ink, label and kind), or a shape drawing { kind: 'shape', label: shape id, strokes }
 *  and, for a drawing asked for by number of wires, `legs` ({ in: 3 }: the label is still the shape's id; the number travels with it). */
export function exampleOf(e) {
  if (e.kind === 'shape') { const legs = legsOf(e.strokes?.[0]); return { kind: 'shape', label: String(e.label), strokes: e.strokes.map(strokeOf), ...(legs ? { legs } : {}) }; }
  return { kind: e.kind === 'text' ? 'text' : 'math', label: String(e.latex), strokes: e.strokes.map(strokeOf) };
}

/** A pack he made, as sent: { label, shapes: [{ id, name, outline }] } -> { kind: 'pack', label, shapes } (the outline's lines only). */
export function packOf(p) {
  const outlineOf = (o) => {
    if (!o || typeof o !== 'object') return null;
    const out = {};
    for (const k of OUTLINE_FIELDS) if (o[k] !== undefined && o[k] !== null && o[k] !== '') out[k] = Array.isArray(o[k]) ? o[k].map(String) : typeof o[k] === 'boolean' ? o[k] : String(o[k]);
    return Object.keys(out).length ? out : null;
  };
  return { kind: 'pack', label: String(p.label), shapes: p.shapes.map((s) => ({ id: String(s.id), name: String(s.name ?? ''), outline: outlineOf(s.outline) })) };
}

/** The pack a shape id belongs to (its first part: `math`, `user:<number>`). */
export const packOfShapeId = (id) => String(id).split('/')[0];

/**
 * The body of one contribution. `examples` are examples of the one dataset store or shape drawings (exampleOf takes what is sent of each); `packs` are
 * the descriptions of his own packs whose drawings are among them (each sent once, before the examples).
 */
export function contributionPayload({ id, examples, packs = [], appVersion, date = new Date() }) {
  if (typeof id !== 'string' || !id) throw new Error('payload: no contribution number');
  if (typeof appVersion !== 'string' || !appVersion) throw new Error('payload: no app version');
  return {
    contribution: id,
    app: appVersion,
    date: date.toISOString().slice(0, 10),
    examples: [...packs.map(packOf), ...examples.map(exampleOf)],
  };
}

/**
 * What a value weighs stored as jsonb, reckoned high (never less than Postgres stores; never less than its JSON text): each value's entry and
 * alignment, a number's header and its digits, a string's bytes, a container's header. The table's check measures the stored jsonb.
 */
export function storedSize(v) {
  if (v === null || typeof v === 'boolean') return 8;
  if (typeof v === 'number') return 16 + 2 * Math.ceil(String(v).replace(/[-+.e]/gi, '').length / 4);
  if (typeof v === 'string') return 12 + new TextEncoder().encode(v).length;
  if (Array.isArray(v)) { let n = 16; for (const x of v) n += storedSize(x); return n; }
  if (typeof v === 'object') { let n = 16; for (const [k, x] of Object.entries(v)) n += 12 + new TextEncoder().encode(k).length + storedSize(x); return n; }
  return 8;
}

/**
 * The selection cut into contributions that each fit (SIZE_LIMIT): the examples in their order, a part closed when the next would not fit; each part
 * carries the description of each pack he made that has drawings in it (once in that part). One example too large alone is a part of its own (the
 * server then refuses it, and the screen says so: it is never dropped here).
 * @param {{ examples: object[], packs?: { label, shapes }[], limit?: number }} o
 * @returns {{ examples: object[], packs: object[] }[]}
 */
export function contributionParts({ examples, packs = [], limit = SIZE_LIMIT }) {
  const byLabel = new Map(packs.map((p) => [String(p.label), p]));
  const parts = [];
  let cur = null;
  const open = () => { cur = { examples: [], packs: [], size: 16 }; parts.push(cur); };
  for (const e of examples) {
    const sent = exampleOf(e);
    const pack = sent.kind === 'shape' ? byLabel.get(packOfShapeId(sent.label)) ?? null : null;
    const cost = (part) => storedSize(sent) + (pack && !part.packs.includes(pack) ? storedSize(packOf(pack)) : 0);
    if (!cur || (cur.examples.length && cur.size + cost(cur) > limit)) open();
    cur.size += cost(cur);
    if (pack && !cur.packs.includes(pack)) cur.packs.push(pack);
    cur.examples.push(e);
  }
  return parts.map(({ examples: ex, packs: ps }) => ({ examples: ex, packs: ps }));
}

/** A random contribution number, made on the device (no clock, no device, no person in it). */
export const newContributionId = () => globalThis.crypto.randomUUID();
