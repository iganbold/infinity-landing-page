/**
 * Table: a round table with the System at its middle (the infinity mark, a
 * thin plate on a round base) and six people seated round it. The person under
 * the pointer rises to lean in and slides a task card across the table to the
 * System, delegating; the others rise after them, less and later the farther
 * round the table they sit. At rest the System is lit. The slider is how high
 * a person rises.
 */
const {
  Cam, fit, prism, proj, rings, rrect, facing, clamp, hull, open, poly, ringAt, run, seg, lerp,
  tween, tset, tval, tdone, mk, pointer, put, register, disposer, solid,
} = HL;

const TR = 50, TH = 5, SEATR = 64, N = 6, HUB = 17, HUBH = 6, PB = 4;
const BODY = 8.5, SHOULDER = 5, BODYH = 15, HEAD = 4, HEADH = 7.5, NECK = 2.2, CARD = 7;
const REST = [2, 5, 1, 3, 0, 4];

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

const disc = (cx, cy, R, b, z = 12) => [rrect(cx - R, cy - R, cx + R, cy + R, R, z), rrect(cx - R + b, cy - R + b, cx + R - b, cy + R - b, R - b, z)];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let RISE = value, act = -2;
  const C = Cam(45, 0.5, 2.0), far = SEATR + BODY + 2;
  fit(C, [[-far, -far, -PB], [far, far, -PB], [far, -far, -PB], [-far, far, -PB], [-SEATR, -SEATR * 0.2, BODYH + HEADH + 24]], 200, 168);
  const P = proj(C), front = facing(C);

  // people at even angles round the table; paint order is by x + y, back to front
  const people = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI * 0.75, x = Math.cos(a) * SEATR, y = Math.sin(a) * SEATR;
    return { i, x, y, foot: disc(x, y, BODY, 1)[0], top: disc(x, y, SHOULDER, 1), head: disc(x, y, HEAD, 0.9), t: tween(REST[i]), drawn: NaN };
  });
  const order = people.slice().sort((p, q) => p.x + p.y - (q.x + q.y));
  const g = mk("g", {}, svg), [tr, ti] = disc(0, 0, TR, 2, 16);
  const back = order.filter((p) => p.x + p.y < 0), near = order.filter((p) => p.x + p.y >= 0);
  const draw = (p) => { p.grp = mk("g", {}, g); p.b = solid(p.grp); p.h = solid(p.grp); };
  back.forEach(draw);
  put(solid(g), prism(P, front, tr, ti, -PB, TH));
  // the task card's track to the System, and the card itself (a thin plate with two rules)
  const lane = mk("path", { class: "nf dash" }, g);
  const cardG = mk("g", {}, g), card = { body: mk("path", { class: "sil" }, cardG), rules: mk("path", { class: "nf lo" }, cardG), t: tween(0), seat: -1, drawn: NaN };
  const hubG = mk("g", {}, g), [hr, hin] = disc(0, 0, HUB, 1.6, 14);
  put(solid(hubG), prism(P, front, hr, hin, TH, TH + HUBH));
  const markHi = drawMark(hubG, P, infinity(0, 0, 13, 2.6), TH + HUBH, TH + HUBH + 1.4);
  near.forEach(draw);

  /** The card at k (0 at the person's edge of the table, 1 against the System), from seat s. */
  function drawCard(s, k) {
    const p = people[s], l = Math.hypot(p.x, p.y), ux = p.x / l, uy = p.y / l;
    const d = lerp(TR - CARD - 3, HUB + CARD + 2, k), cx = ux * d, cy = uy * d, z = TH + 0.3;
    const sq = rrect(cx - CARD, cy - CARD * 0.75, cx + CARD, cy + CARD * 0.75, 1.6, 4).map((q) => P(q.u, q.v, z));
    card.body.setAttribute("d", poly(sq));
    card.rules.setAttribute("d", [-0.25, 0.2].map((v) => seg(P(cx - CARD * 0.6, cy + v * CARD, z), P(cx + CARD * 0.4, cy + v * CARD, z))).join(""));
    lane.setAttribute("d", seg(P(ux * (TR - 4), uy * (TR - 4), TH), P(ux * (HUB + 2), uy * (HUB + 2), TH)));
    // nearer than the System's middle: paint after it, so it isn't hidden under the base
    if (cx + cy > 0) hubG.after(cardG); else hubG.before(cardG);
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const p of people) {
      const z = tval(p.t, now);
      if (z !== p.drawn) {
        p.drawn = z;
        const [top, inner] = p.top; // a body that tapers from base to shoulders: two rings, hulled
        put(p.b, { sil: poly(hull(ringAt(P, p.foot, z).concat(ringAt(P, top, z + BODYH)))), crease: open(ringAt(P, run(inner, front), z + BODYH)) });
        put(p.h, prism(P, front, p.head[0], p.head[1], z + BODYH + NECK, z + BODYH + NECK + HEADH));
      }
      if (!tdone(p.t, now)) moving = true;
    }
    const k = tval(card.t, now);
    if (card.seat >= 0 && k !== card.drawn) { card.drawn = k; drawCard(card.seat, k); }
    if (!tdone(card.t, now)) moving = true;
    return moving;
  });
  bag.add(B.unregister);

  // hit: the nearest person by their RESTING screen centre; the table itself chooses nothing
  const centres = people.map((p) => P(p.x, p.y, REST[p.i] + BODYH / 2));
  function hit([sx, sy]) {
    let best = -1, bd = 30;
    centres.forEach(([cx, cy], i) => { const d = Math.hypot(sx - cx, sy - cy); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  const round = (i, a) => { const k = Math.abs(i - a) % N; return Math.min(k, N - k); };
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, 0);
    act = a;
    people.forEach((p) => {
      const k = round(p.i, from);
      tset(p.t, a < 0 ? REST[p.i] : clamp(RISE * [1, 0.45, 0.2, 0.08][k], 0, 30), now, k * 50);
      p.b.sil.classList.toggle("hi", p.i === a);
      p.h.sil.classList.toggle("hi", p.i === a);
    });
    // the card: a new delegation starts from the person's edge of the table
    if (a >= 0) { card.seat = a; card.t = tween(0); card.drawn = NaN; tset(card.t, 1, now, 180); }
    else { card.seat = -1; [card.body, card.rules, lane].forEach((el) => el.setAttribute("d", "")); }
    card.body.classList.toggle("hi", false);
    markHi.forEach((el) => el.classList.toggle("hi", a < 0));
    read.textContent = a < 0 ? "rest" : "seat " + (a + 1);
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  setActive(-1);
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { RISE = v; const a = act; act = -2; setActive(a); }, destroy: bag.dispose };
}

hairline({
  name: "table",
  means: "People and a System round one table: the person under the pointer leans in and hands it a task.",
  rules: [1, 2, 6, 9],
  range: [8, 16, 24],
  tour: [[89, 131], [200, 99], [311, 195], null],
  mount,
});
