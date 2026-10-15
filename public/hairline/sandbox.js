/**
 * Sandbox: a perforated board, the platform's own control plane standing at
 * its far corner, and three sandboxes: chips of two plates, a die and pins on
 * the top one, each inside its own dotted fence on the board, walled off from
 * the control plane and from each other (class `fence`, for the page to dress). The sandbox under the pointer lifts its top plate clear of its
 * base, walled off from the board and the rest; its neighbours stir a little,
 * staggered by how far they stand from it. At rest the nearest sandbox is
 * lifted part way and lit. The slider is how far a top plate lifts.
 */
const {
  Cam, fit, proj, unproj, facing, rings, rrect, prism, ringAt, poly, seg, clamp,
  tween, tset, tval, tdone, mk, solid, put, flatDot, place, pointer, register, disposer,
} = HL;

const EXT = 156, PB = 6, HW = 23, FM = 6, BH = 4, GAP = 2.5, TH = 4, BLOCK = 6;
// chips back to front (by x + y): the control plane, then the sandboxes left, right and near
const SPOTS = [[44, 44], [44, 112], [112, 44], [112, 112]];
// each sandbox's rest lift, as a share of the lift; the control plane never lifts
const REST = [0, 0.12, 0.3, 0.55];
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
  fit(C, [[-4, -4, -PB], [EXT + 4, EXT + 4, -PB], [EXT + 4, -4, -PB], [-4, EXT + 4, -PB], [44, 44, top(0) + BLOCK],
    ...SPOTS.slice(1).map(([x, y]) => [x - HW, y - HW, top(20)])], 200, 166);
  const P = proj(C), front = facing(C);

  // the board, and its perforation, painted before everything that stands on it
  const g = mk("g", {}, svg), [br, bi] = rings(-4, -4, EXT + 4, EXT + 4, 10, 2);
  put(solid(g), prism(P, front, br, bi, -PB, 0));
  for (let x = 10; x <= EXT - 10; x += 17) for (let y = 10; y <= EXT - 10; y += 17) {
    const near = SPOTS.some(([cx, cy]) => Math.max(Math.abs(x - cx), Math.abs(y - cy)) < HW + FM + 3);
    if (!near) place(flatDot(g, C, 0.9, "dot off"), P(x, y, 0));
  }

  // the fences, on the ground, painted before the chips that stand in them
  const fences = SPOTS.map(([cx, cy], i) => (i === 0 ? null
    : mk("path", { d: flat(P, cx, cy, HW + FM, 9, 0), class: "nf dash fence" }, g)));

  const [ring, inner] = box(0, 0, HW, 4, 1.2);
  const chips = SPOTS.map(([cx, cy], i) => {
    const grp = mk("g", {}, g), at = (r) => r.map((q) => ({ ...q, u: q.u + cx, v: q.v + cy }));
    put(solid(grp), prism(P, front, at(ring), at(inner), 0, BH));
    const plate = solid(grp);
    const feat = mk("path", { class: "nf" }, grp), fine = mk("path", { class: "nf lo" }, grp);
    // the control plane carries a raised block; a sandbox, a flat die
    const block = i === 0 ? solid(grp) : null;
    const lights = [0, 1].map(() => flatDot(grp, C, 1.3, i === 0 ? "dot off" : "dot m"));
    return { cx, cy, ring: at(ring), inner: at(inner), plate, feat, fine, block, lights, t: tween(REST[i] * LIFT), drawn: NaN };
  });

  function draw(c, i, lift) {
    if (lift === c.drawn) return;
    c.drawn = lift;
    const z0 = BH + GAP + lift, z1 = z0 + TH, { cx, cy } = c;
    put(c.plate, prism(P, front, c.ring, c.inner, z0, z1));
    if (c.block) {
      const [r, n] = box(cx, cy, 9, 2.5, 1);
      put(c.block, prism(P, front, r, n, z1, z1 + BLOCK));
      c.feat.setAttribute("d", "");
    } else c.feat.setAttribute("d", flat(P, cx, cy, 8.5, 2, z1));
    c.fine.setAttribute("d", (c.block ? "" : flat(P, cx, cy, 5.5, 1.2, z1)) + pins(P, cx, cy, z1));
    place(c.lights[0], P(cx + 12, cy + 18, z1));
    place(c.lights[1], P(cx + 17, cy + 18, z1));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    chips.forEach((c, i) => { draw(c, i, tval(c.t, now)); if (!tdone(c.t, now)) moving = true; });
    return moving;
  });
  bag.add(B.unregister);

  /** The sandbox under the point: each is tested on its own resting top, and the nearest middle wins. */
  function hit([x, y]) {
    let best = -1, bd = Infinity;
    for (let i = 1; i < chips.length; i++) {
      const c = chips[i], w = unproj(C, x, y, top(REST[i] * LIFT));
      const d = Math.max(Math.abs(w[0] - c.cx), Math.abs(w[1] - c.cy));
      if (d < HW + 3 && d < bd) { best = i; bd = d; }
    }
    return best;
  }

  const dist = (i, j) => Math.hypot(chips[i].cx - chips[j].cx, chips[i].cy - chips[j].cy) / 68;
  /** Lifts sandbox a clear of its base (-1 puts every one back to rest); the stagger spreads out from it. */
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, LIT);
    act = a;
    chips.forEach((c, i) => {
      if (i === 0) return;
      const near = clamp(1.2 - dist(i, a < 0 ? LIT : a), 0, 1) * 0.18;
      const lift = a < 0 ? REST[i] * LIFT : i === a ? LIFT : near * LIFT;
      tset(c.t, lift, now, i === from ? 0 : dist(i, from) * 45);
      const lit = a < 0 ? i === LIT : i === a;
      c.plate.sil.classList.toggle("hi", lit);
      fences[i].classList.toggle("hi", lit);
      c.lights.forEach((el) => el.setAttribute("class", "dot" + (lit ? "" : " m")));
    });
    read.textContent = a < 0 ? "rest" : "sandbox " + a;
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  setActive(-1);
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { LIFT = v; const a = act; act = -2; setActive(a); }, destroy: bag.dispose };
}

hairline({
  name: "sandbox",
  means: "Three fenced sandboxes on a board: the one under the pointer lifts its top clear of its base, walled off from the rest.",
  rules: [1, 2, 3, 4, 9],
  range: [8, 14, 20],
  tour: [[120, 170], [280, 170], [200, 215], null],
  mount,
});
