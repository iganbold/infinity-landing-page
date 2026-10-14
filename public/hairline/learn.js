/**
 * Learn: the System (the infinity mark) rides a stack of memory layers, the
 * company brain, on a plinth. Round it stand the flags of outcomes it has
 * carried. The flag under the pointer slides in to the brain and the layers
 * thicken, from the bottom up, staggered: the brain grows by what it has
 * done. Letting go, the flag returns and the brain keeps its shape. At rest
 * the System is lit. The slider is how much a lesson grows the brain.
 */
const {
  Cam, fit, prism, proj, rings, rrect, facing, clamp, poly, open, fillet, seg,
  tween, tset, tval, tdone, mk, pointer, put, register, disposer, solid,
} = HL;

const FX = 80, FY = 60, PB = 5, N = 6, RX = 60, RY = 42, POLE = 20;
const RADII = [31, 27.5, 24, 20.5], LAYER = 3.6;
const FLAGS = Array.from({ length: N }, (_, i) => { const a = (i / N) * Math.PI * 2 - Math.PI * 0.62; return [Math.cos(a) * RX, Math.sin(a) * RY]; });

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

const disc = (cx, cy, R, b) => [rrect(cx - R, cy - R, cx + R, cy + R, R, 14), rrect(cx - R + b, cy - R + b, cx + R - b, cy + R - b, R - b, 14)];
const CLOTH = fillet([[0, 0], [13, 0], [10, 4], [13, 8], [0, 8]], [0.6, 0.6, 0.6, 0.6, 0.6]);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let GROW = value, act = -2;
  const C = Cam(45, 0.5, 1.8);
  fit(C, [[-FX, -FY, -PB], [FX, FY, -PB], [FX, -FY, -PB], [-FX, FY, -PB], [0, 0, RADII.length * (LAYER + 6) + 8]], 200, 170);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg), [pr, pi] = rings(-FX, -FY, FX, FY, 12, 2.2);
  put(solid(g), prism(P, front, pr, pi, -PB, 0));
  // each outcome's track to the brain, on the ground
  mk("path", { d: FLAGS.map(([x, y]) => { const l = Math.hypot(x, y); return seg(P(x - (x / l) * 6, y - (y / l) * 6, 0), P((x / l) * (RADII[0] + 3), (y / l) * (RADII[0] + 3), 0)); }).join(""), class: "nf dash" }, g);

  // flags behind the brain, the brain, flags in front: painted back to front by x + y
  const flags = FLAGS.map(([x, y], i) => ({ i, x, y, key: x + y, t: tween(0), drawn: NaN }));
  const mkFlag = (f) => {
    const grp = mk("g", {}, g);
    f.base = solid(grp); f.pole = solid(grp); f.cloth = mk("path", { class: "sil" }, grp);
  };
  flags.filter((f) => f.key < 0).sort((a, b) => a.key - b.key).forEach(mkFlag);
  const layers = RADII.map((R) => ({ R, rings: disc(0, 0, R, 1.4), el: solid(g), t: tween(LAYER), drawn: NaN }));
  const markG = mk("g", {}, g);
  let markHi = [], markZ = NaN;
  flags.filter((f) => f.key >= 0).sort((a, b) => a.key - b.key).forEach(mkFlag);

  /** Flag f at k (0 at rest, 1 against the brain). */
  function drawFlag(f, k) {
    const l = Math.hypot(f.x, f.y), ux = f.x / l, uy = f.y / l, d = l - (RADII[0] + 6);
    const x = f.x - ux * d * k, y = f.y - uy * d * k;
    const [br, bi] = disc(x, y, 3.6, 0.7), [sr, si] = disc(x, y, 0.9, 0.3);
    put(f.base, prism(P, front, br, bi, 0, 1.6));
    put(f.pole, prism(P, front, sr, si, 1.6, POLE));
    f.cloth.setAttribute("d", poly(CLOTH.map(([u, v]) => P(x, y - 0.9 - u, POLE - v))));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const f of flags) {
      const k = tval(f.t, now);
      if (k !== f.drawn) { f.drawn = k; drawFlag(f, k); }
      if (!tdone(f.t, now)) moving = true;
    }
    let z = 0;
    for (const L of layers) {
      const h = tval(L.t, now);
      if (h !== L.drawn || z !== L.z0) { L.drawn = h; L.z0 = z; put(L.el, prism(P, front, L.rings[0], L.rings[1], z, z + h)); }
      if (!tdone(L.t, now)) moving = true;
      z += h;
    }
    if (z !== markZ) {
      markZ = z;
      markG.replaceChildren();
      markHi = drawMark(markG, P, infinity(0, 0, 13.5, 2.7), z, z + 1.4);
      markHi.forEach((el) => el.classList.toggle("hi", act < 0));
    }
    return moving;
  });
  bag.add(B.unregister);

  // hit: the nearest flag by its RESTING screen centre; the brain itself chooses nothing
  const centres = FLAGS.map(([x, y]) => P(x, y, POLE / 2));
  function hit([sx, sy]) {
    let best = -1, bd = 24;
    centres.forEach(([cx, cy], i) => { const d = Math.hypot(sx - cx, sy - cy); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  function setActive(a) {
    if (a === act) return;
    const now = performance.now();
    act = a;
    flags.forEach((f) => { tset(f.t, f.i === a ? 1 : 0, now, 0); f.cloth.classList.toggle("hi", f.i === a); });
    // the lesson lands: layers thicken from the bottom up, each a little later
    layers.forEach((L, i) => tset(L.t, a < 0 ? LAYER : LAYER + clamp(GROW * (1 - i * 0.18), 0, 12), now, 260 + i * 70));
    markHi.forEach((el) => el.classList.toggle("hi", a < 0));
    read.textContent = a < 0 ? "rest" : "outcome " + (a + 1);
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  setActive(-1);
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { GROW = v; const a = act; act = -2; setActive(a); }, destroy: bag.dispose };
}

hairline({
  name: "learn",
  means: "The System on its company brain, ringed by the outcomes it has carried: feed one in and the brain grows.",
  rules: [1, 2, 5, 9],
  range: [2, 4, 6],
  tour: [[132, 105], [268, 188], [178, 186], null],
  mount,
});
