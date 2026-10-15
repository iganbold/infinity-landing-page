/**
 * Sandbox: a perforated board holding four identical per-task units. Each is
 * a compute plate above a storage base, inside its own dotted fence and walled
 * off from the others (class `fence`, for the page to dress). The unit under
 * the pointer lifts its compute plate clear of storage; its neighbours stir a little,
 * staggered by how far they stand from it. At rest the nearest unit is
 * lifted part way and lit. The slider controls compute/storage separation.
 */
const {
  Cam, fit, proj, unproj, facing, rings, rrect, prism, ringAt, poly, seg, clamp,
  tween, tset, tval, tdone, mk, solid, put, flatDot, place, pointer, register, disposer,
} = HL;

const EXT = 156, PB = 6, HW = 23, FM = 6, BH = 4, GAP = 2.5, TH = 4;
// compute/storage units back to front (by x + y)
const SPOTS = [[44, 44], [44, 112], [112, 44], [112, 112]];
// each compute plate's rest lift, as a share of the full separation
const REST = [0.08, 0.16, 0.3, 0.55];
const LIT = 3;

const box = (cx, cy, hw, r, b) => rings(cx - hw, cy - hw, cx + hw, cy + hw, r, b);
const flat = (P, cx, cy, hw, r, z) => poly(ringAt(P, rrect(cx - hw, cy - hw, cx + hw, cy + hw, r, 4), z));

/** The pins along a chip's two x sides, at height z. */
function pins(P, cx, cy, z) {
  let d = "";
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) d += seg(P(cx + s * 19, cy + k * 4.5, z), P(cx + s * 12.5, cy + k * 4.5, z));
  return d;
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let LIFT = value, act = -2;
  const C = Cam(45, 0.5, 1.3);
  const top = (lift) => BH + GAP + lift + TH;
  fit(C, [[-4, -4, -PB], [EXT + 4, EXT + 4, -PB], [EXT + 4, -4, -PB], [-4, EXT + 4, -PB],
    ...SPOTS.map(([x, y]) => [x - HW, y - HW, top(20)])], 200, 166);
  const P = proj(C), front = facing(C);

  // the board, and its perforation, painted before everything that stands on it
  const g = mk("g", {}, svg), [br, bi] = rings(-4, -4, EXT + 4, EXT + 4, 10, 2);
  put(solid(g), prism(P, front, br, bi, -PB, 0));
  for (let x = 10; x <= EXT - 10; x += 17) for (let y = 10; y <= EXT - 10; y += 17) {
    const near = SPOTS.some(([cx, cy]) => Math.max(Math.abs(x - cx), Math.abs(y - cy)) < HW + FM + 3);
    if (!near) place(flatDot(g, C, 0.9, "dot off"), P(x, y, 0));
  }

  // the fences, on the ground, painted before the units that stand in them
  const fences = SPOTS.map(([cx, cy]) =>
    mk("path", { d: flat(P, cx, cy, HW + FM, 9, 0), class: "nf dash fence" }, g));

  const [ring, inner] = box(0, 0, HW, 4, 1.2);
  const chips = SPOTS.map(([cx, cy], i) => {
    const grp = mk("g", {}, g), at = (r) => r.map((q) => ({ ...q, u: q.u + cx, v: q.v + cy }));
    put(solid(grp), prism(P, front, at(ring), at(inner), 0, BH));
    const plate = solid(grp);
    const feat = mk("path", { class: "nf" }, grp), fine = mk("path", { class: "nf lo" }, grp);
    const lights = [0, 1].map(() => flatDot(grp, C, 1.3, "dot m"));
    return { cx, cy, ring: at(ring), inner: at(inner), plate, feat, fine, lights, t: tween(REST[i] * LIFT), drawn: NaN };
  });

  function draw(c, i, lift) {
    if (lift === c.drawn) return;
    c.drawn = lift;
    const z0 = BH + GAP + lift, z1 = z0 + TH, { cx, cy } = c;
    put(c.plate, prism(P, front, c.ring, c.inner, z0, z1));
    c.feat.setAttribute("d", flat(P, cx, cy, 8.5, 2, z1));
    c.fine.setAttribute("d", flat(P, cx, cy, 5.5, 1.2, z1) + pins(P, cx, cy, z1));
    place(c.lights[0], P(cx + 12, cy + 18, z1));
    place(c.lights[1], P(cx + 17, cy + 18, z1));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    chips.forEach((c, i) => { draw(c, i, tval(c.t, now)); if (!tdone(c.t, now)) moving = true; });
    return moving;
  });
  bag.add(B.unregister);

  /** The unit under the point: each is tested on its resting compute plate, and the nearest middle wins. */
  function hit([x, y]) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i], w = unproj(C, x, y, top(REST[i] * LIFT));
      const d = Math.max(Math.abs(w[0] - c.cx), Math.abs(w[1] - c.cy));
      if (d < HW + 3 && d < bd) { best = i; bd = d; }
    }
    return best;
  }

  const dist = (i, j) => Math.hypot(chips[i].cx - chips[j].cx, chips[i].cy - chips[j].cy) / 68;
  /** Detaches compute from storage (-1 puts every unit back to rest); the stagger spreads out from it. */
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, LIT);
    act = a;
    chips.forEach((c, i) => {
      const near = clamp(1.2 - dist(i, a < 0 ? LIT : a), 0, 1) * 0.18;
      const lift = a < 0 ? REST[i] * LIFT : i === a ? LIFT : near * LIFT;
      tset(c.t, lift, now, i === from ? 0 : dist(i, from) * 45);
      const lit = a < 0 ? i === LIT : i === a;
      c.plate.sil.classList.toggle("hi", lit);
      fences[i].classList.toggle("hi", lit);
      c.lights.forEach((el) => el.setAttribute("class", "dot" + (lit ? "" : " m")));
    });
    read.textContent = a < 0 ? "rest" : "compute " + (a + 1);
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  setActive(-1);
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { LIFT = v; const a = act; act = -2; setActive(a); }, destroy: bag.dispose };
}

hairline({
  name: "sandbox",
  means: "Four fenced per-task units on a board: the one under the pointer detaches its compute plate from its persistent storage base.",
  rules: [1, 2, 3, 4, 9],
  range: [8, 14, 20],
  tour: [[120, 170], [280, 170], [200, 215], null],
  mount,
});
