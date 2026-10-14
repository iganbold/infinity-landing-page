/**
 * Dock: the System (the infinity mark, a thin plate on a round base) at the
 * middle of a plinth, wired by dashed lines to the four things its work
 * depends on: a stack of documents, a database drum, a tool case, and the team
 * (two people). The source under the pointer glides in along its line and
 * docks against the System; its neighbours lean in a little, staggered round
 * the plinth. At rest the System is lit. The slider is how far a source travels.
 */
const {
  Cam, fit, prism, proj, rings, rrect, facing, clamp, seg, poly, open, hull, ringAt, run,
  tween, tset, tval, tdone, mk, pointer, put, register, disposer, solid,
} = HL;

const EXT = 156, MID = EXT / 2, PB = 5, HUB = 26, HUBH = 7, SRC = 13;
// sources, back to front: far two (by x + y), then the hub, then the near two
const SPOTS = [[MID, 18], [18, MID], [EXT - 18, MID], [MID, EXT - 18]];
const KIND = ["docs", "team", "data", "tools"];

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

const disc = (cx, cy, R, b) => [rrect(cx - R, cy - R, cx + R, cy + R, R, 12), rrect(cx - R + b, cy - R + b, cx + R - b, cy + R - b, R - b, 12)];
const box = (cx, cy, hw, hd, r, b) => rings(cx - hw, cy - hd, cx + hw, cy + hd, r, b);

/** A source of kind k standing at (cx, cy), as a list of [ring, inner, z0, z1], or a tapered body for people. */
function shapes(kind, cx, cy) {
  if (kind === "docs") return [0, 1, 2, 3].map((n) => [...box(cx + n * 0.8, cy - n * 0.8, SRC, SRC * 0.78, 2, 0.8), n * 4.2, n * 4.2 + 2.6]);
  if (kind === "data") return [0, 1, 2].map((n) => [...disc(cx, cy, SRC, 1.4), n * 8, n * 8 + 6.5]);
  if (kind === "team") return [[-6, 4], [6, -4]].flatMap(([dx, dy]) => [[...disc(cx + dx, cy + dy, 5, 1), 0, 13, "body"], [...disc(cx + dx, cy + dy, 3.4, 0.8), 14.4, 20]]);
  return [[...box(cx, cy, SRC, SRC * 0.7, 3, 1), 0, 12], [...box(cx, cy, SRC * 0.45, 1.2, 1, 0.4), 12, 16]];
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let REACH = value, act = -2;
  const C = Cam(45, 0.5, 1.72);
  fit(C, [[-4, -4, -PB], [EXT + 4, EXT + 4, -PB], [EXT + 4, -4, -PB], [-4, EXT + 4, -PB], [MID, 18, 26]], 200, 168);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg), [pr, pi] = rings(-4, -4, EXT + 4, EXT + 4, 12, 2.2);
  put(solid(g), prism(P, front, pr, pi, -PB, 0));
  // the connections, on the ground, painted before everything that stands on them
  mk("path", { d: SPOTS.map(([x, y]) => { const ux = MID - x, uy = MID - y, l = Math.hypot(ux, uy);
    return seg(P(x + (ux / l) * SRC, y + (uy / l) * SRC, 0), P(MID - (ux / l) * HUB, MID - (uy / l) * HUB, 0)); }).join(""), class: "nf dash" }, g);

  const mkSource = (i) => {
    const [x, y] = SPOTS[i], grp = mk("g", {}, g), l = Math.hypot(MID - x, MID - y);
    return { i, x, y, ux: (MID - x) / l, uy: (MID - y) / l, els: shapes(KIND[i], x, y).map(() => solid(grp)), t: tween(0), drawn: NaN };
  };
  const srcs = [mkSource(0), mkSource(1)];
  const [hr, hin] = disc(MID, MID, HUB, 1.6);
  put(solid(g), prism(P, front, hr, hin, 0, HUBH));
  const markHi = drawMark(g, P, infinity(MID, MID, 19, 3.6), HUBH, HUBH + 1.6);
  srcs.push(mkSource(2), mkSource(3));

  const room = (s) => Math.hypot(MID - s.x, MID - s.y) - HUB - SRC - 4;
  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const s of srcs) {
      const d = tval(s.t, now);
      if (d !== s.drawn) {
        s.drawn = d;
        shapes(KIND[s.i], s.x + s.ux * d, s.y + s.uy * d).forEach(([ring, inner, z0, z1, body], k) => {
          // people taper from base to shoulders: two rings, hulled
          if (body) put(s.els[k], { sil: poly(hull(ringAt(P, ring, z0).concat(ringAt(P, inner, z1)))), crease: open(ringAt(P, run(inner, front), z1)) });
          else put(s.els[k], prism(P, front, ring, inner, z0, z1));
        });
      }
      if (!tdone(s.t, now)) moving = true;
    }
    return moving;
  });
  bag.add(B.unregister);

  // hit: the nearest source by its RESTING screen centre; the hub and the corners choose nothing
  const centres = SPOTS.map(([x, y]) => P(x, y, 8));
  function hit([sx, sy]) {
    let best = -1, bd = 46;
    centres.forEach(([cx, cy], i) => { const d = Math.hypot(sx - cx, (sy - cy) * 1.4); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // round the plinth the order is docs, data, tools, team
  const ROUND = [0, 3, 1, 2];
  const steps = (i, a) => { const k = Math.abs(ROUND[i] - ROUND[a]) % 4; return Math.min(k, 4 - k); };
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, 0);
    act = a;
    srcs.forEach((s) => {
      const k = a < 0 ? 0 : steps(s.i, a);
      tset(s.t, a < 0 ? 0 : clamp(room(s) * REACH * [1, 0.18, 0.06][k], 0, room(s)), now, steps(s.i, from) * 50);
      s.els.forEach((el) => el.sil.classList.toggle("hi", s.i === a));
    });
    markHi.forEach((el) => el.classList.toggle("hi", a < 0));
    read.textContent = a < 0 ? "rest" : KIND[a];
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  setActive(-1);
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { REACH = v; const a = act; act = -2; setActive(a); }, destroy: bag.dispose };
}

hairline({
  name: "dock",
  means: "The System, wired to its docs, data, tools and team: the source under the pointer glides in and docks.",
  rules: [1, 2, 4, 9],
  range: [0.4, 0.75, 1],
  tour: [[150, 112], [250, 112], [250, 214], null],
  mount,
});
