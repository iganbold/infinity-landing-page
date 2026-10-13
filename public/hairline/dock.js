/**
 * Dock: a System block on a rounded plinth, and four sources set round it,
 * the things work depends on: a stack of documents, a database drum, a tool
 * case with a handle, and a deck of cards. The source under the pointer glides
 * in along its own axis and docks against the System, a dashed guide left on
 * the ground behind it; its neighbours lean in a little, staggered by distance
 * round the plinth. At rest the System is the bright mark. The slider is how
 * far a source travels in.
 */
const {
  Cam, fit, prism, proj, rings, rrect, facing, clamp, seg,
  tween, tset, tval, tdone, flatDot, place, mk, pointer, put, register, disposer, solid,
} = HL;

const EXT = 156, MID = EXT / 2, PB = 5, HUB = 17, HUBH = 30, SRC = 13;
// sources, painted back to front: the two far ones (by x + y), then the hub, then the two near ones
const SPOTS = [[MID, 20], [20, MID], [EXT - 20, MID], [MID, EXT - 20]];
const KIND = ["docs", "cards", "data", "tool"];

/** A round footprint at (cx, cy). */
const disc = (cx, cy, R, b) => [rrect(cx - R, cy - R, cx + R, cy + R, R, 12), rrect(cx - R + b, cy - R + b, cx + R - b, cy + R - b, R - b, 12)];
const box = (cx, cy, hw, hd, r, b) => rings(cx - hw, cy - hd, cx + hw, cy + hd, r, b);

/** The paths of a source of kind k standing at (cx, cy): a list of [ring, inner, z0, z1]. */
function shapes(kind, cx, cy) {
  if (kind === "docs") return [0, 1, 2, 3].map((n) => [...box(cx + n * 0.8, cy - n * 0.8, SRC, SRC * 0.78, 2, 0.8), n * 4.2, n * 4.2 + 2.6]);
  if (kind === "cards") return [0, 1, 2].map((n) => [...box(cx - 6 + n * 6, cy, 2, SRC * 0.9, 1, 0.5), 0, 20 - n * 3]);
  if (kind === "data") return [0, 1, 2].map((n) => [...disc(cx, cy, SRC, 1.4), n * 8, n * 8 + 6.5]);
  return [[...box(cx, cy, SRC, SRC * 0.7, 3, 1), 0, 12], [...box(cx, cy, SRC * 0.45, 1.2, 1, 0.4), 12, 16]];
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let REACH = value;

  const C = Cam(45, 0.5, 1.72);
  fit(C, [[-4, -4, -PB], [EXT + 4, EXT + 4, -PB], [EXT + 4, -4, -PB], [-4, EXT + 4, -PB], [MID, MID, HUBH + 4], [MID, 20, 26]], 200, 168);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-4, -4, EXT + 4, EXT + 4, 12, 2.2);
  put(solid(g), prism(P, front, pr, pi, -PB, 0));

  const guides = mk("path", { class: "nf dash" }, g);
  const mkSource = (i) => {
    const [x, y] = SPOTS[i], grp = mk("g", {}, g);
    const dir = [MID - x, MID - y], len = Math.hypot(dir[0], dir[1]);
    return { i, x, y, ux: dir[0] / len, uy: dir[1] / len, grp, els: shapes(KIND[i], x, y).map(() => solid(grp)), t: tween(0), drawn: NaN };
  };
  const srcs = [mkSource(0), mkSource(1)];
  // the System: a rounded block with a 2 × 2 dot code on its lid, one dot per source
  const hub = solid(g);
  const [hr, hin] = box(MID, MID, HUB, HUB, 6, 1.6);
  put(hub, prism(P, front, hr, hin, 0, HUBH));
  const code = [0, 1, 2, 3].map((k) => {
    const d = flatDot(g, C, 1.5, "dot off");
    place(d, P(MID + (k % 2 ? 5 : -5), MID + (k < 2 ? -5 : 5), HUBH));
    return d;
  });
  srcs.push(mkSource(2), mkSource(3));
  srcs.sort((a, b) => a.i - b.i);

  // how far a source can come in: up to the hub's side, less a small gap
  const room = (s) => Math.hypot(MID - s.x, MID - s.y) - HUB - SRC - 4;

  const B = register(stage, (_dt, now) => {
    let moving = false, gd = "";
    for (const s of srcs) {
      const d = tval(s.t, now);
      if (d > 0.5) gd += seg(P(s.x, s.y, 0), P(s.x + s.ux * d, s.y + s.uy * d, 0));
      if (d !== s.drawn) {
        s.drawn = d;
        shapes(KIND[s.i], s.x + s.ux * d, s.y + s.uy * d).forEach(([ring, inner, z0, z1], k) => put(s.els[k], prism(P, front, ring, inner, z0, z1)));
      }
      if (!tdone(s.t, now)) moving = true;
    }
    guides.setAttribute("d", gd);
    return moving;
  });
  bag.add(B.unregister);

  // hit: the nearest source by its RESTING footprint's screen centre; the hub and the corners choose nothing
  const centres = SPOTS.map(([x, y]) => P(x, y, 8));
  function hit([sx, sy]) {
    let best = -1, bd = 46;
    centres.forEach(([cx, cy], i) => { const d = Math.hypot(sx - cx, (sy - cy) * 1.4); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  let act = -2;
  // round the plinth the order is docs, data, tool, cards; distance is steps round that ring
  const ROUND = [0, 3, 1, 2];
  const steps = (i, a) => { const k = Math.abs(ROUND[i] - ROUND[a]) % 4; return Math.min(k, 4 - k); };
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, 0);
    act = a;
    srcs.forEach((s) => {
      const k = a < 0 ? 0 : steps(s.i, a);
      const to = a < 0 ? 0 : clamp(room(s) * REACH * [1, 0.18, 0.06][k], 0, room(s));
      tset(s.t, to, now, steps(s.i, from) * 50);
      s.els.forEach((el) => el.sil.classList.toggle("hi", s.i === a));
    });
    hub.sil.classList.toggle("hi", a < 0);
    code.forEach((d, k) => d.setAttribute("class", k === a ? "dot m" : "dot off"));
    read.textContent = a < 0 ? "rest" : KIND[a];
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  setActive(-1);
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { REACH = v; const a = act; act = -2; setActive(a); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "dock",
  means: "A System and the things work depends on: the source under the pointer glides in and docks against it.",
  rules: [1, 2, 4, 9],
  range: [0.4, 0.75, 1],
  tour: [[150, 112], [250, 112], [250, 214], null],
  mount,
});
