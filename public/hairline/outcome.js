/**
 * Outcome: a field with its boundary marked out (a dashed line and a ring of
 * posts), the System on it (the infinity mark, a thin plate on a low base),
 * a goal flag at the far side, and a row of measure bars between them. The
 * pointer picks which of the three is being defined: over the flag it runs
 * up its pole, over the bars they climb (staggered from the pointer), over the
 * edge the posts rise (staggered round the field). At rest the System is lit.
 */
const {
  Cam, fit, prism, proj, rings, rrect, facing, unproj, clamp, poly, open, fillet,
  tween, tset, tval, tdone, mk, pointer, put, register, disposer, solid,
} = HL;

const FX = 86, FY = 58, PB = 5, EDGE = 9, POLE = 46;
const SYS = [-40, 18], FLAG = [44, -30];
const BARS = [0.32, 0.42, 0.52, 0.62, 0.72].map((t) => [lerp2(SYS[0], FLAG[0], t), lerp2(SYS[1], FLAG[1], t)]);
const BAR_REST = [6, 9, 12, 15, 18], BAR_UP = [14, 22, 30, 38, 46], FLAG_REST = 0.3;
function lerp2(a, b, t) { return a + (b - a) * t; } // hoisted: BARS uses it above

/* ------------------------------------------------ the infinity mark */
const inside = (p, pg) => {
  let c = false;
  for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
    const [xi, yi] = pg[i], [xj, yj] = pg[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Open runs of a closed outline whose points pass `keep`, each carried one point past its ends so joins close. */
const runs = (pts, keep) => {
  const n = pts.length, k = pts.map(keep), out = [];
  const start = k.findIndex((v) => !v);
  if (start < 0) return poly(pts);
  let cur = [];
  for (let j = 1; j <= n; j++) {
    const i = (start + j) % n;
    if (k[i]) { if (!cur.length) cur.push(pts[(i - 1 + n) % n]); cur.push(pts[i]); }
    else if (cur.length) { cur.push(pts[i]); out.push(open(cur)); cur = []; }
  }
  if (cur.length) out.push(open(cur));
  return out.join("");
};
/** The two lobes of a lemniscate of half-width A at (cx, cy), laid along screen-horizontal (world x − y): outer outlines (band width w) and teardrop holes. */
function infinity(cx, cy, A, w, n = 40) {
  const pt = (t) => { const s = Math.sin(t), c = Math.cos(t), d = 1 + s * s; return [(A * c) / d, (A * s * c) / d]; };
  const lobe = (t0) => Array.from({ length: n }, (_, i) => pt(t0 + (i / n) * Math.PI));
  const place = ([x, y]) => [cx + (x + y) * Math.SQRT1_2, cy + (y - x) * Math.SQRT1_2];
  const grow = (pts) => {
    let area = 0;
    pts.forEach((p, i) => { const q = pts[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; });
    const s = Math.sign(area);
    const out = pts.map((p, i) => {
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      return place([p[0] + (s * ty * w) / l, p[1] - (s * tx * w) / l]);
    });
    return s < 0 ? out.reverse() : out; // one winding for both lobes
  };
  // a hole is its lobe drawn in toward the lobe's middle, so it keeps the lobe's pointed inner end
  const shrink = (pts, side) => { const c = side * 0.62 * A, f = 1 - w / (0.38 * A); return pts.map(([x, y]) => place([c + (x - c) * f, y * f])); };
  const L = lobe(Math.PI / 2), R = lobe(-Math.PI / 2);
  return { outer: [grow(L), grow(R)], hole: [shrink(L, -1), shrink(R, 1)] };
}
/** The mark as a thin plate from z0 to z1 into g, in its own `mark` group so the page can dress it. Returns what takes the highlight. */
function drawMark(g, P, m, z0, z1) {
  const mg = mk("g", { class: "mark" }, g);
  const at = (pts, z) => pts.map(([x, y]) => P(x, y, z));
  const layer = (z, face) => {
    const o = m.outer.map((pts) => at(pts, z));
    // both lobes in one plate, so the page can shade the top face as one shape
    mk("path", { d: o.map(poly).join(""), class: face ? "fo face" : "fo" }, mg);
    return mk("path", { d: o.map((pts, i) => runs(pts, (p) => !inside(p, o[1 - i]))).join(""), class: "nf sil" }, mg);
  };
  layer(z0, false);
  const top = layer(z1, true);
  const holes = m.hole.map((h) => mk("path", { d: poly(at(h, z1)), class: "sil" }, mg));
  return [top, ...holes];
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let REACH = value, act = "~"; // "~": nothing applied yet, so the first call always draws
  const C = Cam(45, 0.5, 1.86);
  fit(C, [[-FX, -FY, -PB], [FX, FY, -PB], [FX, -FY, -PB], [-FX, FY, -PB], [FLAG[0], FLAG[1], POLE + 4]], 200, 172);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg), [pr, pi] = rings(-FX, -FY, FX, FY, 12, 2.2);
  put(solid(g), prism(P, front, pr, pi, -PB, 0));
  // the boundary, marked on the ground
  const bnd = rrect(-FX + EDGE, -FY + EDGE, FX - EDGE, FY - EDGE, 8, 6);
  mk("path", { d: poly(bnd.map((q) => P(q.u, q.v, 0))), class: "nf dash" }, g);

  // items, painted back to front by x + y
  const items = [];
  const along = (a, b, k) => Array.from({ length: k }, (_, i) => [lerp2(a[0], b[0], (i + 0.5) / k), lerp2(a[1], b[1], (i + 0.5) / k)]);
  const x0 = -FX + EDGE, x1 = FX - EDGE, y0 = -FY + EDGE, y1 = FY - EDGE, posts = [...along([x0, y0], [x1, y0], 6), ...along([x1, y0], [x1, y1], 4), ...along([x1, y1], [x0, y1], 6), ...along([x0, y1], [x0, y0], 4)];
  posts.forEach(([x, y], i) => items.push({ kind: "post", i, x, y, key: x + y }));
  BARS.forEach(([x, y], i) => items.push({ kind: "bar", i, x, y, key: x + y }));
  items.push({ kind: "sys", x: SYS[0], y: SYS[1], key: SYS[0] + SYS[1] });
  items.push({ kind: "flag", x: FLAG[0], y: FLAG[1], key: FLAG[0] + FLAG[1] });
  items.sort((a, b) => a.key - b.key);

  const postEls = [], barEls = []; let markHi = [], flagEls = null; // the System's highlight, and the flag
  for (const it of items) {
    if (it.kind === "post") {
      const [ring, inner] = rings(it.x - 2.2, it.y - 2.2, it.x + 2.2, it.y + 2.2, 2.2, 0.6);
      postEls[it.i] = { ...it, ring, inner, el: solid(g), t: tween(6), drawn: NaN };
    } else if (it.kind === "bar") {
      const [ring, inner] = rings(it.x - 2.8, it.y - 2.8, it.x + 2.8, it.y + 2.8, 1.4, 0.7);
      barEls[it.i] = { ...it, ring, inner, el: solid(g), t: tween(BAR_REST[it.i]), drawn: NaN };
    } else if (it.kind === "sys") {
      const R = 25, ring = rrect(it.x - R, it.y - R, it.x + R, it.y + R, R, 14), inner = rrect(it.x - R + 1.6, it.y - R + 1.6, it.x + R - 1.6, it.y + R - 1.6, R - 1.6, 14);
      put(solid(g), prism(P, front, ring, inner, 0, 6));
      markHi = drawMark(g, P, infinity(it.x, it.y, 18, 3.4), 6, 7.6);
    } else {
      const [ring, inner] = rings(it.x - 1.2, it.y - 1.2, it.x + 1.2, it.y + 1.2, 1.2, 0.4);
      const [br, bi] = rings(it.x - 6, it.y - 6, it.x + 6, it.y + 6, 6, 1);
      put(solid(g), prism(P, front, br, bi, 0, 2.5));
      put(solid(g), prism(P, front, ring, inner, 2.5, POLE));
      // a swallowtail pennant flying along -y, in the pole's vertical plane
      const shape = fillet([[0, 0], [24, 0], [18, 7.5], [24, 15], [0, 15]], [0.8, 0.8, 0.8, 0.8, 0.8]);
      flagEls = { shape, cloth: mk("path", { class: "sil" }, g), t: tween(POLE * FLAG_REST), drawn: NaN };
    }
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const p of [...postEls, ...barEls]) {
      const h = tval(p.t, now);
      if (h !== p.drawn) { p.drawn = h; put(p.el, prism(P, front, p.ring, p.inner, 0, h)); }
      if (!tdone(p.t, now)) moving = true;
    }
    const fh = tval(flagEls.t, now);
    if (fh !== flagEls.drawn) {
      flagEls.drawn = fh;
      flagEls.cloth.setAttribute("d", poly(flagEls.shape.map(([u, v]) => P(FLAG[0], FLAG[1] - 1.2 - u, fh - v))));
    }
    if (!tdone(flagEls.t, now)) moving = true;
    return moving;
  });
  bag.add(B.unregister);

  // hit: on the ground plane, against the parts' resting footprints; the flag's cloth by its rest pose on screen
  const cloth = P(FLAG[0], FLAG[1] - 13, POLE * FLAG_REST - 7);
  function hit([sx, sy]) {
    if (Math.hypot(sx - cloth[0], sy - cloth[1]) < 26) return "outcome";
    const [x, y] = unproj(C, sx, sy, 0);
    if (Math.hypot(x - FLAG[0], y - FLAG[1]) < 16) return "outcome";
    for (const [bx, by] of BARS) if (Math.hypot(x - bx, y - by) < 9) return "measure";
    const inX = x > x0 + 7 && x < x1 - 7 && y > y0 + 7 && y < y1 - 7;
    if (!inX && Math.abs(x) < FX && Math.abs(y) < FY) return "boundary";
    return null;
  }

  function setActive(a, wp) {
    if (a === act && a !== "boundary" && a !== "measure") return;
    const now = performance.now();
    const changed = a !== act;
    act = a;
    // measure: bars climb, staggered out from the one nearest the pointer
    const nb = BARS.reduce((k, b, i) => (Math.hypot(b[0] - wp[0], b[1] - wp[1]) < Math.hypot(BARS[k][0] - wp[0], BARS[k][1] - wp[1]) ? i : k), 0);
    barEls.forEach((b, i) => tset(b.t, a === "measure" ? lerp2(BAR_REST[i], BAR_UP[i], REACH) : BAR_REST[i], now, Math.abs(i - nb) * 45));
    // boundary: posts rise, staggered round the field from the nearest
    const np = postEls.reduce((k, p, i) => (Math.hypot(p.x - wp[0], p.y - wp[1]) < Math.hypot(postEls[k].x - wp[0], postEls[k].y - wp[1]) ? i : k), 0);
    const N = postEls.length;
    postEls.forEach((p, i) => { const d = Math.min(Math.abs(i - np), N - Math.abs(i - np)); tset(p.t, a === "boundary" ? 6 + 12 * REACH : 6, now, d * 40); });
    tset(flagEls.t, a === "outcome" ? lerp2(POLE * FLAG_REST, POLE, REACH) : POLE * FLAG_REST, now, 0);
    if (changed) {
      flagEls.cloth.classList.toggle("hi", a === "outcome");
      barEls.forEach((b) => b.el.sil.classList.toggle("hi", a === "measure"));
      postEls.forEach((p) => p.el.sil.classList.toggle("hi", a === "boundary"));
      markHi.forEach((el) => el.classList.toggle("hi", !a));
      read.textContent = a || "rest";
    }
    B.wake();
  }

  bag.add(pointer(stage, {
    move: (p) => { const wp = unproj(C, p[0], p[1], 0); setActive(hit(p) ?? "", wp); },
    leave: () => setActive("", [0, 0]),
  }));
  setActive("", [0, 0]);
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { REACH = v; const a = act; act = "~"; setActive(a, [0, 0]); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "outcome",
  means: "A System's charter: the flag it works toward, the bars that measure it, and the fence that bounds its role.",
  rules: [1, 2, 4, 9],
  range: [0.5, 0.8, 1],
  tour: [[297, 173], [214, 162], [136, 196], null],
  mount,
});
