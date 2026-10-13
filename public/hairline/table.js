/**
 * Table: a round table with the System at its middle, a block with a dot code
 * on its lid, and six people seated round it, each a rounded body with a round
 * head. The person under the pointer rises to lean in, and the others rise
 * after them, less and later the farther round the table they sit. At rest
 * the heads sit at a gentle wave and the System is the bright mark. The slider
 * is how high a person rises.
 */
const {
  Cam, fit, prism, proj, rings, rrect, facing, clamp, hull, open, poly, ringAt, run,
  tween, tset, tval, tdone, flatDot, place, mk, pointer, put, register, disposer, solid,
} = HL;

const TR = 50, TH = 5, SEATR = 64, N = 6, HUB = 13, HUBH = 22, PB = 4;
const BODY = 8.5, SHOULDER = 5, BODYH = 15, HEAD = 4, HEADH = 7.5, NECK = 2.2;
const REST = [2, 5, 1, 3, 0, 4];

const disc = (cx, cy, R, b, z = 12) => [rrect(cx - R, cy - R, cx + R, cy + R, R, z), rrect(cx - R + b, cy - R + b, cx + R - b, cy + R - b, R - b, z)];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let RISE = value;

  const C = Cam(45, 0.5, 2.0);
  const far = SEATR + BODY + 2;
  fit(C, [[-far, -far, -PB], [far, far, -PB], [far, -far, -PB], [-far, far, -PB], [-SEATR, -SEATR * 0.2, BODYH + HEADH + 24]], 200, 168);
  const P = proj(C), front = facing(C);

  // people at even angles round the table; paint order is by x + y, back to front
  const people = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI * 0.75;
    const x = Math.cos(a) * SEATR, y = Math.sin(a) * SEATR;
    return { i, x, y, foot: disc(x, y, BODY, 1)[0], top: disc(x, y, SHOULDER, 1), head: disc(x, y, HEAD, 0.9), t: tween(REST[i]), drawn: NaN };
  });
  const order = people.slice().sort((p, q) => p.x + p.y - (q.x + q.y));

  const g = mk("g", {}, svg);
  const [tr, ti] = disc(0, 0, TR, 2, 16);
  // the far people, then the table and the System, then the near people
  const back = order.filter((p) => p.x + p.y < 0), near = order.filter((p) => p.x + p.y >= 0);
  const draw = (p) => { p.grp = mk("g", {}, g); p.b = solid(p.grp); p.h = solid(p.grp); };
  back.forEach(draw);
  put(solid(g), prism(P, front, tr, ti, -PB, TH));
  const hub = solid(g);
  const [hr, hin] = rings(-HUB, -HUB, HUB, HUB, 5, 1.4);
  put(hub, prism(P, front, hr, hin, TH, TH + HUBH));
  const code = [0, 1, 2].map((k) => {
    const d = flatDot(g, C, 1.4, "dot off");
    place(d, P((k - 1) * 5.5, (k - 1) * -5.5, TH + HUBH));
    return d;
  });
  near.forEach(draw);

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const p of people) {
      const z = tval(p.t, now);
      if (z !== p.drawn) {
        p.drawn = z;
        // a body that tapers from its base to its shoulders: two rings, hulled
        const [top, inner] = p.top;
        put(p.b, {
          sil: poly(hull(ringAt(P, p.foot, z).concat(ringAt(P, top, z + BODYH)))),
          crease: open(ringAt(P, run(inner, front), z + BODYH)),
        });
        put(p.h, prism(P, front, p.head[0], p.head[1], z + BODYH + NECK, z + BODYH + NECK + HEADH));
      }
      if (!tdone(p.t, now)) moving = true;
    }
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
  let act = -2;
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, 0);
    act = a;
    people.forEach((p) => {
      const k = round(p.i, from);
      const to = a < 0 ? REST[p.i] : clamp(RISE * [1, 0.45, 0.2, 0.08][k], 0, 30);
      tset(p.t, to, now, k * 50);
      p.b.sil.classList.toggle("hi", p.i === a);
      p.h.sil.classList.toggle("hi", p.i === a);
    });
    hub.sil.classList.toggle("hi", a < 0);
    // the System's lid answers: its middle dot says someone has its attention
    code.forEach((d, k) => d.setAttribute("class", a >= 0 && k === 1 ? "dot m" : "dot off"));
    read.textContent = a < 0 ? "rest" : "seat " + (a + 1);
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  setActive(-1);
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { RISE = v; const a = act; act = -2; setActive(a); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "table",
  means: "People and a System round one table: the person under the pointer rises to lean in, and the others follow.",
  rules: [1, 2, 5, 9],
  range: [8, 16, 24],
  tour: [[89, 131], [200, 99], [311, 195], null],
  mount,
});
