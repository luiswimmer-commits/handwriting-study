// Canvas drawing of strokes in page units. The caller sets the context transform, so committed ink is
// redrawn as vectors at the current zoom and stays crisp (nothing is a scaled bitmap).
// Highlighter strokes are translucent and are drawn first, so they sit under pen ink.
// On a dark paper black ink is shown light: `ink` (the paper's ink colour, null on a light paper) replaces black and near-black when drawing;
// every other colour is drawn as it is, and what is stored never changes.

export const HIGHLIGHTER_ALPHA = 0.35;

/** Black and near-black (each channel at most 0x30): the colours a dark paper shows in its ink colour. Any '#rgb' / '#rrggbb' or 'black'. */
export function isNearBlack(color) {
  const c = String(color ?? '').trim().toLowerCase();
  if (c === 'black') return true;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (!m) return false;
  const h = m[1].length === 3 ? [...m[1]].map((d) => d + d) : [m[1].slice(0, 2), m[1].slice(2, 4), m[1].slice(4, 6)];
  return h.every((x) => parseInt(x, 16) <= 0x30);
}

/** The colour a stroke of `color` is shown in on a paper whose ink colour is `ink` (null: a light paper, shown as it is). */
export const displayColor = (color, ink) => (ink && isNearBlack(color) ? ink : color);

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const isDot = (seg) => seg.length === 1 || seg.every((p) => p[0] === seg[0][0] && p[1] === seg[0][1]);

function dot(ctx, p, width) {
  ctx.beginPath();
  ctx.arc(p[0], p[1], width / 2, 0, Math.PI * 2);
  ctx.fill();
}

// One pen-down run as a smoothed path (quadratic through midpoints).
function runPath(ctx, seg) {
  ctx.beginPath();
  ctx.moveTo(seg[0][0], seg[0][1]);
  if (seg.length === 2) ctx.lineTo(seg[1][0], seg[1][1]);
  for (let i = 1; i < seg.length - 1; i++) {
    const m = mid(seg[i], seg[i + 1]);
    ctx.quadraticCurveTo(seg[i][0], seg[i][1], m[0], m[1]);
  }
  if (seg.length > 2) ctx.lineTo(seg[seg.length - 1][0], seg[seg.length - 1][1]);
}

export function drawStroke(ctx, stroke, segments = stroke.segments, ink = null) {
  const color = displayColor(stroke.color, ink);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const seg of segments) {
    if (isDot(seg)) dot(ctx, seg[0], stroke.width);
    else { runPath(ctx, seg); ctx.stroke(); }
  }
}

// Draw strokes in layer order. opts.hidden: Set of ids to skip; opts.map(stroke) -> segments to draw
// instead (drag and resize previews); opts.cull: [x0, y0, x1, y1] page rectangle, others are skipped; opts.ink: the paper's ink colour (a dark paper).
export function drawStrokes(ctx, strokes, opts = {}) {
  const { hidden, map, cull, ink = null } = opts;
  for (const pass of ['highlighter', 'other']) {
    for (const s of strokes) {
      if ((s.tool === 'highlighter') !== (pass === 'highlighter')) continue;
      if (hidden && hidden.has(s.id)) continue;
      const segs = map ? map(s) : null;
      if (cull && !segs) {
        const h = s.width / 2, b = s.bounds;
        if (b[2] + h < cull[0] || b[0] - h > cull[2] || b[3] + h < cull[1] || b[1] - h > cull[3]) continue;
      }
      if (s.tool === 'highlighter') {
        ctx.save();
        ctx.globalAlpha = HIGHLIGHTER_ALPHA;
        drawStroke(ctx, s, segs ?? s.segments, ink);
        ctx.restore();
      } else {
        drawStroke(ctx, s, segs ?? s.segments, ink);
      }
    }
  }
}

// Incremental drawing of the run being written (the "wet" stroke), straight onto a canvas as points
// arrive. The same midpoint smoothing as committed ink, so nothing shifts when the stroke is saved.
// A highlighter is drawn opaque here; the wet canvas itself is given the translucency. The canvas says the ink colour of the paper it is
// drawn over (`canvas.dataset.ink`, set by the Surface; empty on a light paper), so wet ink shows as it will once it is kept.
export class WetStroke {
  constructor(ctx, style) {
    this.ctx = ctx;
    this.style = style;
    this.pts = [];
    this.ink = ctx.canvas?.dataset?.ink || null;
  }

  _setup() {
    const c = this.ctx;
    const color = displayColor(this.style.color, this.ink);
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = this.style.width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
  }

  add(p) {
    const pts = this.pts;
    pts.push(p);
    const n = pts.length;
    this._setup();
    if (n === 1) { dot(this.ctx, p, this.style.width); return; }
    const c = this.ctx;
    c.beginPath();
    if (n === 2) {
      c.moveTo(pts[0][0], pts[0][1]);
      const m = mid(pts[0], pts[1]);
      c.lineTo(m[0], m[1]);
    } else {
      const a = mid(pts[n - 3], pts[n - 2]), b = mid(pts[n - 2], pts[n - 1]);
      c.moveTo(a[0], a[1]);
      c.quadraticCurveTo(pts[n - 2][0], pts[n - 2][1], b[0], b[1]);
    }
    c.stroke();
  }

  // Draw the tail to the last point.
  end() {
    const pts = this.pts, n = pts.length;
    if (n < 2) return;
    this._setup();
    const c = this.ctx, last = pts[n - 1];
    const from = mid(pts[n - 2], last);
    c.beginPath();
    c.moveTo(from[0], from[1]);
    c.lineTo(last[0], last[1]);
    c.stroke();
  }

  // Redraw everything so far (after a zoom or resize changed the transform).
  redraw() {
    const all = this.pts;
    this.pts = [];
    for (const p of all) this.add(p);
  }
}
