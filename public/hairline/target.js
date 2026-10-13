/**
 * Target: a stepped target of four thin nested discs on a plinth, a pin in its
 * centre marking the outcome. The ring under the pointer lifts off what is
 * below it and the rings near it follow, less the farther they are, staggered
 * outwards: the target opens up around the choice. At rest the target rises
 * gently to its centre and the pin's head is the bright mark. The slider is
 * the gap.
 */
const {
  Cam, fit, prism, proj, rings, rrect, unproj, facing, clamp,
  tween, tset, tval, tdone, mk, pointer, put, register, disposer, solid,
} = HL;

const RADII = [64, 49, 34, 19], H = 4.5, PR = 71, PB = 5, PIN = 26, HEAD = 5;
const REST = [0, 1.5, 3, 5];
const NAMES = ["ring 1", "ring 2", "ring 3", "centre"];

/** A round footprint and its crease, with enough steps that the curve stays smooth. */
const disc = (R, b) => [rrect(-R, -R, R, R, R, 14), rrect(-R + b, -R + b, R - b, R - b, R - b, 14)];

/** The share of the full gap at k rings from the one chosen. */
const share = (k) => [1, 0.5, 0.2, 0.08][Math.min(k, 3)];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let GAP = value;

  // fitted to the plinth and the target at its most opened, so nothing leaves the frame
  const C = Cam(45, 0.5, 1.85);
  fit(C, [[-PR, -PR, -PB], [PR, PR, -PB], [PR, -PR, -PB], [-PR, PR, -PB], [0, 0, 4 * H + 4 * 22 + PIN + HEAD]], 200, 170);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [pr, pi] = disc(PR, 2.2);
  put(solid(g), prism(P, front, pr, pi, -PB, 0));

  const parts = RADII.map((R, i) => {
    const [ring, inner] = disc(R, Math.min(2, R * 0.12));
    return { R, ring, inner, el: solid(g), gap: tween(REST[i]), drawn: NaN };
  });
  // the outcome: a pin in the centre, a shaft and a round head, riding the top disc
  const [sr, si] = rings(-1.3, -1.3, 1.3, 1.3, 1.3, 0.4);
  const [hr, hi] = disc(HEAD, 1);
  const shaft = solid(g), head = solid(g);
  let pinDrawn = NaN;

  /** The heights of each disc's base, from the gaps as they are now. */
  function bases(now) {
    const out = [];
    let z = 0;
    parts.forEach((p, i) => { z += tval(p.gap, now); out.push(z); z += H; });
    return out;
  }

  const B = register(stage, (_dt, now) => {
    const zs = bases(now);
    let moving = false;
    parts.forEach((p, i) => {
      if (zs[i] !== p.drawn) { p.drawn = zs[i]; put(p.el, prism(P, front, p.ring, p.inner, zs[i], zs[i] + H)); }
      if (!tdone(p.gap, now)) moving = true;
    });
    const top = zs[3] + H;
    if (top !== pinDrawn) {
      pinDrawn = top;
      put(shaft, prism(P, front, sr, si, top, top + PIN));
      put(head, prism(P, front, hr, hi, top + PIN, top + PIN + HEAD));
    }
    return moving;
  });
  bag.add(B.unregister);

  // hit: each disc's REST top, from the smallest up; the pointer is unprojected
  // onto that disc's own resting height, so a raised top never picks the one behind it
  const restTop = [];
  { let z = 0; RADII.forEach((_, i) => { z += REST[i]; restTop.push(z + H); z += H; }); }
  function hit([sx, sy]) {
    for (let i = RADII.length - 1; i >= 0; i--) {
      const [x, y] = unproj(C, sx, sy, restTop[i]);
      if (Math.hypot(x, y) <= RADII[i]) return i;
    }
    return -1;
  }

  let act = -2;
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, 0);
    act = a;
    parts.forEach((p, i) => {
      const to = a < 0 ? REST[i] : clamp(GAP * share(Math.abs(i - a)), 0, 40);
      tset(p.gap, to, now, Math.abs(i - from) * 45);
      p.el.sil.classList.toggle("hi", i === a);
    });
    // the rest mark gives the bright up to what the pointer chose
    head.sil.classList.toggle("hi", a < 0);
    read.textContent = a < 0 ? "rest" : NAMES[a];
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  setActive(-1);
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { GAP = v; const a = act; act = -2; setActive(a); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "target",
  means: "A target with a pin at its centre: the ring under the pointer lifts, and the target opens up around it.",
  rules: [1, 2, 5, 9],
  range: [8, 16, 22],
  tour: [[110, 214], [168, 168], [200, 120], null],
  mount,
});
