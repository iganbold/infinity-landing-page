/**
 * How-it-works figures: minimal line diagrams in SVG, one per step, each
 * drawing what its step says. Each figure has a handful of states (a part of
 * the outcome, an input, a move, a project); the pointer or the rail under the
 * figure picks one, and otherwise the figure tours them on its own. Everything
 * eases toward the chosen state, and the first time a figure comes on screen
 * it draws itself in, once.
 *
 * Outlines only: thin moss-ink strokes for the people and the world around
 * the System, the mark's green for the System and the work it carries. The
 * System's badge and a few small dots are the only solid shapes.
 *
 * mountFigure(stage, name, { readout, rail }) draws into `stage`, writes a
 * short status line into `readout` and puts one button per state into `rail`;
 * it returns a cleanup function.
 */

export type FigureName = "outcome" | "dock" | "table" | "learn";

interface Figure {
  /** One name per state, for the rail's buttons. */
  states: string[];
  /** The state shown first, and the one held under reduced motion. */
  rest: number;
  /** State under a point, in viewBox units. */
  pick(x: number, y: number): number;
  /**
   * Ease toward state `i` (dt in seconds; 0 snaps) and return the readout.
   * `born` runs 0 → 1 over the build-in and stays at 1 after.
   */
  frame(i: number, dt: number, now: number, born: number): string;
}

type Build = (svg: SVGSVGElement, id: string) => Figure;
type Attrs = Record<string, string | number>;
type Point = [number, number];

/** The drawing's window: the figures live between y 46 and 316. */
const VB = { x: 0, y: 46, w: 400, h: 270 };
const TOUR = 2400; // ms per state when nobody is pointing
const INTRO = 1500; // ms for the build-in

/** The moss ink (#17201a) and its tints toward white, darkest first. */
const C = {
  ink: "#17201a",
  ink2: "#4b5a4f",
  ink3: "#8a978d",
  ink4: "#c2cbc3",
  ghost: "#e3e8e2",
  line: "#e9ede8",
  wash: "#f3f6f2",
  paper: "#ffffff",
};
/** The System's greens, deep to faint. */
const G = {
  deep: "#2f7a55",
  mid: "#5fa37a",
  leaf: "#8fc773",
  pale: "#cfe3c6",
  mist: "#e7f1e2",
};

/** Shared by every stroke: open shapes with soft ends. */
const LINE = { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };

/* ------------------------------------------------------------ helpers */

const NS = "http://www.w3.org/2000/svg";

const set = (node: Element, attrs: Attrs) => {
  for (const k in attrs) node.setAttribute(k, String(attrs[k]));
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  set(node, attrs);
  parent.append(node);
  return node;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (cur: number, target: number, dt: number, rate = 8) =>
  dt <= 0 ? target : cur + (target - cur) * (1 - Math.exp(-dt * rate));
/** Where `born` sits between `from` and `to`, eased out: one item's slice of the build-in. */
const part = (born: number, from: number, to: number) => 1 - (1 - clamp((born - from) / (to - from), 0, 1)) ** 3;

const rgb = new Map<string, number[]>();
const parse = (hex: string) => {
  let v = rgb.get(hex);
  if (!v) rgb.set(hex, (v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))));
  return v;
};
/** Blend two #rrggbb colours. */
const mix = (a: string, b: string, t: number) => {
  const A = parse(a);
  const B = parse(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp(t, 0, 1)))).join(",")})`;
};

const f = (p: Point) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
/** A point at `deg` degrees (counter-clockwise from +x, as on paper) and radius r. */
const polar = (cx: number, cy: number, r: number, deg: number): Point => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
};
/** An arc running clockwise on screen from angle a0 down to a1. */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number) =>
  a0 - a1 < 0.05 ? "" : `M${f(polar(cx, cy, r, a0))}A${r} ${r} 0 ${a0 - a1 > 180 ? 1 : 0} 1 ${f(polar(cx, cy, r, a1))}`;
/** A point on a cubic Bézier. */
const bez = (p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point => {
  const m = 1 - t;
  return [0, 1].map((j) => m * m * m * p0[j] + 3 * m * m * t * c1[j] + 3 * m * t * t * c2[j] + t * t * t * p3[j]) as Point;
};

/**
 * Ready a stroked shape to draw itself on, from its start (or its end, with
 * `backward`); the setter takes 0 (hidden) to 1 (drawn).
 */
function drawable(path: SVGGeometryElement, backward = false) {
  const len = path.getTotalLength() + 1;
  set(path, { "stroke-dasharray": `${len.toFixed(1)} ${len.toFixed(1)}` });
  const dir = backward ? -1 : 1;
  return (t: number) => set(path, { "stroke-dashoffset": (dir * len * (1 - clamp(t, 0, 1))).toFixed(1) });
}

/** Scale a node about a point. */
const scaleAt = (x: number, y: number, s: number) => `translate(${x} ${y}) scale(${s.toFixed(3)}) translate(${-x} ${-y})`;

/** The System's mark: a white lemniscate, for the ink ground. */
function mark(parent: Element, cx: number, cy: number, w: number) {
  const a = w / 2;
  let d = "";
  for (let k = 0; k <= 72; k++) {
    const t = (k / 72) * Math.PI * 2;
    const s = Math.sin(t);
    const c = Math.cos(t);
    const q = 1 + s * s;
    d += `${k ? "L" : "M"}${(cx + (a * c) / q).toFixed(2)} ${(cy + (a * s * c) / q).toFixed(2)}`;
  }
  return el("path", { d: d + "Z", fill: "none", stroke: C.paper, "stroke-width": w * 0.17, "stroke-linejoin": "round" }, parent);
}

/** The System as a round badge: an ink disc with the mark. */
function badge(parent: Element, cx: number, cy: number, r: number) {
  const g = el("g", { transform: `translate(${cx} ${cy})` }, parent);
  el("circle", { r, fill: C.ink }, g);
  mark(g, 0, 0, r * 1.25);
  return g;
}

/** A small text label. */
function label(parent: Element, x: number, y: number, text: string, anchor = "start") {
  const t = el("text", { x, y, "font-size": 10.5, "font-weight": 500, "text-anchor": anchor, fill: C.ink3 }, parent);
  t.textContent = text;
  return t;
}

/* ------------------------------------------------------------ 1. outcome */

/**
 * Setting the outcome as three rings around one centre. The target is what to
 * achieve; the gauge around it is how success is measured, filling toward a
 * goal mark; the dashed ring is the boundary of the System's role, with the
 * work that falls inside it and the work that stays outside. Once all three
 * are set, the System takes the centre.
 */
const outcome: Build = (svg) => {
  const X = 150;
  const Y = 182;
  const GAUGE = 58;
  const BOUND = 100;
  const GOAL = 0.8;
  /** Gauge angle for a value: 270° from the lower left, over the top, to the lower right. */
  const at = (v: number) => 225 - 270 * v;

  // the boundary, and the work inside and outside it
  const bound = el("circle", { cx: X, cy: Y, r: BOUND, ...LINE, "stroke-width": 1.6, "stroke-dasharray": "3 7" }, svg);
  const inside = [
    [135, 84],
    [190, 86],
    [280, 85],
    [330, 84],
  ].map(([a, r]) => {
    const [x, y] = polar(X, Y, r, a);
    return el("circle", { cx: x, cy: y, r: 4.5, ...LINE, "stroke-width": 1.5 }, svg);
  });
  const outside = [
    [160, 120],
    [212, 122],
    [248, 120],
  ].map(([a, r]) => {
    const [x, y] = polar(X, Y, r, a);
    return el("circle", { cx: x, cy: y, r: 4.5, ...LINE, stroke: C.ink4, "stroke-width": 1.4, "stroke-dasharray": "2 3" }, svg);
  });

  // the gauge: a thin track with ticks, a goal mark, and the measure filling it
  const track = el("path", { d: arc(X, Y, GAUGE, at(0), at(1)), ...LINE, "stroke-width": 1.4 }, svg);
  const drawTrack = drawable(track);
  const ticks = el("g", {}, svg);
  for (let k = 0; k <= 10; k++) {
    const a = at(k / 10);
    const [x1, y1] = polar(X, Y, GAUGE + 5, a);
    const [x2, y2] = polar(X, Y, GAUGE + (k % 5 ? 9 : 12), a);
    el("line", { x1, y1, x2, y2, stroke: C.ink4, "stroke-width": 1.2, "stroke-linecap": "round" }, ticks);
  }
  const [gx1, gy1] = polar(X, Y, GAUGE - 5, at(GOAL));
  const [gx2, gy2] = polar(X, Y, GAUGE + 12, at(GOAL));
  const goal = el("line", { x1: gx1, y1: gy1, x2: gx2, y2: gy2, stroke: C.ink2, "stroke-width": 1.4, "stroke-linecap": "round" }, svg);
  const measure = el("path", { ...LINE, stroke: G.deep, "stroke-width": 3 }, svg);
  const needle = el("circle", { r: 3.6, fill: C.paper, stroke: G.deep, "stroke-width": 1.8 }, svg);

  // the target, which the System takes over at the end
  const ring = el("circle", { cx: X, cy: Y, r: 22, ...LINE, "stroke-width": 1.6 }, svg);
  const drawRing = drawable(ring);
  const dot = el("circle", { cx: X, cy: Y, r: 4 }, svg);
  const owner = badge(svg, X, Y, 15);

  // labels on the right, each led to its ring by a thin line
  const PARTS = [
    { text: "Outcome", at: polar(X, Y, 22, 0) },
    { text: "Measure", at: polar(X, Y, GAUGE, 40) },
    { text: "Boundary", at: polar(X, Y, BOUND, 62) },
  ];
  const leaders = PARTS.map((p) => {
    const line = el("path", { d: `M${f(p.at)}H288`, ...LINE, "stroke-width": 1.2 }, svg);
    const end = el("circle", { cx: p.at[0], cy: p.at[1], r: 2.6 }, svg);
    return { line, draw: drawable(line), end, text: label(svg, 296, p.at[1] + 3.8, p.text) };
  });

  const act = [0, 0, 0];
  let value = 0;
  let march = 0;
  let held = 0;

  return {
    states: ["the outcome", "the measure", "the boundaries", "the handover"],
    rest: 0,
    pick: (x, y) => {
      if (x > 280) {
        let best = 0;
        PARTS.forEach((p, k) => {
          if (Math.abs(p.at[1] - y) < Math.abs(PARTS[best].at[1] - y)) best = k;
        });
        return best;
      }
      const d = Math.hypot(x - X, y - Y);
      return d < 38 ? 0 : d < 78 ? 1 : d < 112 ? 2 : 3;
    },
    frame(i, dt, _now, born) {
      PARTS.forEach((_, k) => (act[k] = ease(act[k], i === k || i === 3 ? 1 : 0, dt, 8)));
      value = ease(value, i >= 1 ? GOAL : 0, dt, 2.6);
      march += dt * 12 * act[2];
      held = ease(held, i === 3 ? 1 : 0, dt, 7);

      // the build-in: the target, then the gauge, then the boundary and the labels
      drawRing(part(born, 0, 0.35));
      drawTrack(part(born, 0.15, 0.6));
      const outer = part(born, 0.4, 0.8);
      const late = part(born, 0.6, 1);

      const tone = (a: number) => mix(C.ink4, G.deep, a);
      set(ring, { stroke: mix(C.ink3, G.deep, act[0]) });
      set(dot, { fill: mix(C.ink3, G.deep, act[0]), opacity: (part(born, 0.2, 0.4) * (1 - held)).toFixed(3) });
      set(owner, { transform: `translate(${X} ${Y}) scale(${(0.5 + 0.5 * held).toFixed(3)})`, opacity: held.toFixed(3) });

      set(track, { stroke: mix(C.ink4, C.ink3, act[1]) });
      set(ticks, { opacity: part(born, 0.3, 0.7).toFixed(3) });
      set(goal, { opacity: part(born, 0.45, 0.7).toFixed(3) });
      set(measure, { d: arc(X, Y, GAUGE, at(0), at(value)), opacity: (0.35 + 0.65 * act[1]).toFixed(3) });
      const [nx, ny] = polar(X, Y, GAUGE, at(value));
      set(needle, { cx: nx.toFixed(1), cy: ny.toFixed(1), opacity: (value > 0.01 ? 0.35 + 0.65 * act[1] : 0).toFixed(3) });

      set(bound, { stroke: tone(act[2]), "stroke-dashoffset": (-march).toFixed(1), opacity: outer.toFixed(3) });
      inside.forEach((n, k) =>
        set(n, { stroke: tone(act[2]), fill: mix(C.paper, G.mist, act[2]), opacity: part(born, 0.55 + k * 0.05, 0.8 + k * 0.05).toFixed(3) }),
      );
      outside.forEach((n) => set(n, { opacity: outer.toFixed(3) }));

      leaders.forEach((l, k) => {
        l.draw(late);
        const c = mix(C.ink4, G.deep, act[k]);
        set(l.line, { stroke: c });
        set(l.end, { fill: c, opacity: late.toFixed(3) });
        set(l.text, { fill: mix(C.ink3, C.ink, act[k]), opacity: late.toFixed(3) });
      });

      return ["Defining what to achieve", "Choosing how success is measured", "Setting the edges of its role", "Handed to the System"][i];
    },
  };
};

/* ------------------------------------------------------------ 2. dock */

/** Outline icons on a 20-unit grid centred on 0. */
const ICONS: Record<string, string> = {
  // a page with a folded corner: what the team knows
  knowledge: "M-6 -9H2.5L7 -4.5V9H-6Z M2.5 -9V-4.5H7 M-3 0H4 M-3 4H4",
  // a checklist: how the team likes to work
  work: "M-8 -5l2.2 2.2L-2 -7 M1 -4.5H8 M-8 4l2.2 2.2L-2 2 M1 4.5H8",
  // a plug: the tools it's wired into
  tools: "M-3 -10V-5 M3 -10V-5 M-6.5 -5H6.5V-1A6.5 6.5 0 0 1 -6.5 -1Z M0 5.5V10",
};

/**
 * Bringing the System into the company. It learns from three inputs on the
 * left (what the team knows, how it works, the tools it uses), and with each
 * one its reach spreads further across the organization on the right, until
 * it gets to every corner, the far ones included.
 */
const dock: Build = (svg, id) => {
  const HX = 150;
  const HY = 182;
  const IX = 52;
  const INPUTS = [
    { name: "knowledge", text: "Knowledge", y: 100, read: "Learning what your team knows" },
    { name: "work", text: "How you work", y: 182, read: "Learning how your team works" },
    { name: "tools", text: "Tools", y: 264, read: "Plugged into the tools you use" },
  ];
  const COLS = [236, 276, 316, 356];
  const ROWS = [100, 155, 210, 265];
  const SPINE = 214;
  /** How far the System reaches after each state. */
  const REACH = [100, 135, 175, 240];

  // links from the inputs to the hub, each with a stream that runs when it's in focus
  const links = INPUTS.map((s) => {
    const d = `M${IX + 23} ${s.y}C${IX + 62} ${s.y} ${HX - 64} ${HY} ${HX - 30} ${HY}`;
    const base = el("path", { d, ...LINE, "stroke-width": 1.4 }, svg);
    const stream = el("path", { d, ...LINE, stroke: G.deep, "stroke-width": 2, "stroke-dasharray": "4 10" }, svg);
    return { base, draw: drawable(base), stream };
  });

  // the organization: a trunk from the hub, a spine, and a grid of teams
  const org = el("g", {}, svg);
  el("path", { d: `M${HX + 30} ${HY}H${SPINE}M${SPINE} ${ROWS[0]}V${ROWS[3]}`, ...LINE, stroke: C.ink4, "stroke-width": 1.4 }, org);
  const edges: { node: SVGLineElement; a: number; b: number }[] = [];
  const nodes: { node: SVGCircleElement; core: SVGCircleElement; d: number; r: number }[] = [];
  const idx = (c: number, r: number) => r * COLS.length + c;
  ROWS.forEach((y, r) => {
    el("line", { x1: SPINE, x2: COLS[0] - 6, y1: y, y2: y, stroke: C.ink4, "stroke-width": 1.4, "stroke-linecap": "round" }, org);
    COLS.forEach((x, c) => {
      if (c) edges.push({ node: el("line", { x1: COLS[c - 1] + 6, x2: x - 6, y1: y, y2: y, "stroke-width": 1.4, "stroke-linecap": "round" }, org), a: idx(c - 1, r), b: idx(c, r) });
      if (r) edges.push({ node: el("line", { x1: x, x2: x, y1: ROWS[r - 1] + 6, y2: y - 6, "stroke-width": 1.4, "stroke-linecap": "round" }, org), a: idx(c, r - 1), b: idx(c, r) });
    });
  });
  ROWS.forEach((y) =>
    COLS.forEach((x) => {
      const node = el("circle", { cx: x, cy: y, r: 6, "stroke-width": 1.5 }, org);
      const core = el("circle", { cx: x, cy: y, r: 2.2, fill: G.deep }, org);
      nodes.push({ node, core, d: Math.hypot(x - HX, y - HY), r: 0 });
    }),
  );
  const orgText = label(svg, (COLS[0] + COLS[3]) / 2, 78, "Your organization", "middle");

  // the reach: a dashed ring centred on the hub, seen only over the organization
  const clip = el("clipPath", { id: `${id}-reach` }, el("defs", {}, svg));
  el("rect", { x: HX + 34, y: ROWS[0] - 16, width: VB.w - HX - 34, height: ROWS[3] - ROWS[0] + 32 }, clip);
  const reach = el("circle", { cx: HX, cy: HY, ...LINE, stroke: G.mid, "stroke-width": 1.3, "stroke-dasharray": "2 6", "clip-path": `url(#${id}-reach)` }, svg);

  const hubRing = el("circle", { cx: HX, cy: HY, r: 28, ...LINE, stroke: C.ink, "stroke-width": 1.5 }, svg);
  const drawHub = drawable(hubRing);
  const hub = badge(svg, HX, HY, 17);

  const chips = INPUTS.map((s) => {
    const g = el("g", { transform: `translate(${IX} ${s.y})` }, svg);
    const box = el("rect", { x: -21, y: -21, width: 42, height: 42, rx: 12, fill: C.paper, "stroke-width": 1.5 }, g);
    const icon = el("path", { d: ICONS[s.name], ...LINE, "stroke-width": 1.6 }, g);
    const text = label(svg, IX, s.y + 36, s.text, "middle");
    return { g, box, icon, text };
  });

  const act = INPUTS.map(() => 0);
  let radius = 0;
  let flow = 0;

  return {
    states: ["knowledge", "how you work", "tools", "every corner"],
    rest: 0,
    pick: (x, y) => {
      if (x > 110) return 3;
      let best = 0;
      INPUTS.forEach((s, k) => {
        if (Math.abs(s.y - y) < Math.abs(INPUTS[best].y - y)) best = k;
      });
      return best;
    },
    frame(i, dt, _now, born) {
      drawHub(part(born, 0, 0.3));
      set(hub, { opacity: part(born, 0.1, 0.35).toFixed(3) });
      const orgIn = part(born, 0.35, 0.75);
      set(org, { opacity: orgIn.toFixed(3) });
      set(orgText, { opacity: orgIn.toFixed(3) });
      flow += dt * 26;

      INPUTS.forEach((_, k) => {
        act[k] = ease(act[k], i === k || i === 3 ? 1 : 0, dt, 8);
        const chipIn = part(born, 0.1 + k * 0.08, 0.45 + k * 0.08);
        const c = chips[k];
        set(c.g, { transform: `translate(${IX} ${INPUTS[k].y}) scale(${(0.85 + 0.15 * chipIn).toFixed(3)})`, opacity: chipIn.toFixed(3) });
        set(c.box, { stroke: mix(C.ink4, G.deep, act[k]), fill: mix(C.paper, G.mist, act[k]) });
        set(c.icon, { stroke: mix(C.ink3, G.deep, act[k]) });
        set(c.text, { fill: mix(C.ink3, C.ink, act[k]), opacity: chipIn.toFixed(3) });
        const l = links[k];
        l.draw(part(born, 0.2 + k * 0.08, 0.55 + k * 0.08));
        set(l.base, { stroke: mix(C.ink4, G.pale, act[k]) });
        set(l.stream, { "stroke-dashoffset": (-flow).toFixed(1), opacity: (act[k] * part(born, 0.7, 1)).toFixed(3) });
      });

      // reach grows with each input and covers everything at the end
      radius = ease(radius, REACH[i] * part(born, 0.6, 1), dt, 3);
      set(reach, { r: Math.max(0, radius).toFixed(1), opacity: (0.8 * part(born, 0.6, 0.8)).toFixed(3) });
      nodes.forEach((n) => {
        n.r = clamp((radius - n.d) / 14, 0, 1);
        set(n.node, {
          stroke: mix(C.ink4, G.deep, n.r),
          fill: mix(C.paper, G.mist, n.r),
          "stroke-dasharray": n.r > 0.5 ? "none" : "2 2.7",
        });
        set(n.core, { opacity: n.r.toFixed(3) });
      });
      edges.forEach((e) => set(e.node, { stroke: mix(C.line, G.pale, Math.min(nodes[e.a].r, nodes[e.b].r)) }));

      return i === 3 ? "Reaching every corner of the org" : INPUTS[i].read;
    },
  };
};

/* ------------------------------------------------------------ 3. table */

/**
 * Working alongside: the team's track and the System's track side by side,
 * each with its own work, joined by the four moves the step names. The team
 * hands work over, checks in on progress, the System asks when it's unsure,
 * and the team gives direction. The System's progress runs along its track and
 * each move draws itself as the progress reaches it.
 */
const table: Build = (svg) => {
  const TEAM = 132;
  const ME = 224;
  const X0 = 84;
  const X1 = 368;
  const MOVES = [
    { x: 124, text: "Hand off", read: "Handing it the work" },
    { x: 192, text: "Check in", read: "Checking in on progress" },
    { x: 260, text: "It asks", read: "It asks when it’s unsure" },
    { x: 328, text: "Direction", read: "Giving direction when it matters" },
  ];
  const mid = (TEAM + ME) / 2;

  // the two tracks, with who's on each
  const teamTrack = el("path", { d: `M${X0} ${TEAM}H${X1}`, ...LINE, stroke: C.ink4, "stroke-width": 1.4 }, svg);
  const meTrack = el("path", { d: `M${X0} ${ME}H${X1}`, ...LINE, stroke: G.pale, "stroke-width": 1.4 }, svg);
  const drawTracks = [drawable(teamTrack), drawable(meTrack)];
  const who = el("g", {}, svg);
  const person = el("g", { transform: `translate(42 ${TEAM})`, ...LINE, stroke: C.ink2, "stroke-width": 1.6 }, who);
  el("circle", { cy: -6, r: 6 }, person);
  el("path", { d: "M-10 11A10 9 0 0 1 10 11" }, person);
  badge(who, 42, ME, 14);
  label(who, 42, TEAM + 30, "Team", "middle");
  label(who, 42, ME + 30, "System", "middle");

  // the team keeps its own work going on its track
  const work = [
    [92, 150],
    [164, 236],
    [248, 304],
    [318, 362],
  ].map(([a, b]) => el("rect", { x: a, y: TEAM - 7, width: b - a, height: 14, rx: 7, fill: C.paper, stroke: C.ink3, "stroke-width": 1.4 }, svg));

  // the System's progress along its own track
  const progress = el("line", { y1: ME, y2: ME, stroke: G.deep, "stroke-width": 2.6, "stroke-linecap": "round" }, svg);

  /** A move between the tracks: a curve with a chevron at its end. */
  const move = (x: number, down: boolean, stroke: string, dash = "") => {
    const [y0, y1, x1] = down ? [TEAM + 9, ME - 7, x + 12] : [ME - 7, TEAM + 9, x - 12];
    const path = el("path", { d: `M${x} ${y0}C${x} ${mid} ${x1} ${mid} ${x1} ${y1}`, ...LINE, stroke, "stroke-width": 1.6 }, svg);
    const s = down ? -1 : 1;
    const head = el("path", { d: `M${x1 - 4} ${y1 + 4.5 * s}L${x1} ${y1}L${x1 + 4} ${y1 + 4.5 * s}`, ...LINE, stroke, "stroke-width": 1.6 }, svg);
    const draw = drawable(path);
    if (dash) set(path, { "stroke-dasharray": dash });
    return { path, head, draw: dash ? (t: number) => set(path, { opacity: clamp(t, 0, 1).toFixed(3) }) : draw };
  };
  const hand = move(MOVES[0].x, true, C.ink);
  // the work itself, travelling down with the handoff
  const parcel = el("rect", { x: -4, y: -4, width: 8, height: 8, rx: 2, fill: C.paper, stroke: C.ink, "stroke-width": 1.4 }, svg);
  // a check-in: a dotted look down at where the System has got to
  const checkLine = el("line", { x1: MOVES[1].x, x2: MOVES[1].x, y1: TEAM + 9, y2: ME - 8, stroke: C.ink2, "stroke-width": 1.4, "stroke-dasharray": "1 4", "stroke-linecap": "round" }, svg);
  const checkRing = el("circle", { cx: MOVES[1].x, cy: ME, r: 7, ...LINE, stroke: C.ink, "stroke-width": 1.4 }, svg);
  const ask = move(MOVES[2].x, false, G.deep, "3 4");
  const bubble = el("g", {}, svg);
  el("circle", { r: 8, fill: C.paper, stroke: G.deep, "stroke-width": 1.5 }, bubble);
  el("text", { y: 3.6, "text-anchor": "middle", "font-size": 10, "font-weight": 700, fill: G.deep }, bubble).textContent = "?";
  const direct = move(MOVES[3].x, true, C.ink);

  const texts = MOVES.map((m) => label(svg, m.x + 6, ME + 44, m.text, "middle"));
  const head = el("circle", { cy: ME, r: 4.5, fill: G.deep }, svg);

  let play = X0;
  const seen = (k: number) => clamp((play - MOVES[k].x) / 16, 0, 1);

  return {
    states: MOVES.map((m) => m.text.toLowerCase()),
    rest: 0,
    pick: (x) => {
      let best = 0;
      MOVES.forEach((m, k) => {
        if (Math.abs(m.x - x) < Math.abs(MOVES[best].x - x)) best = k;
      });
      return best;
    },
    frame(i, dt, _now, born) {
      drawTracks.forEach((d) => d(part(born, 0, 0.45)));
      set(who, { opacity: part(born, 0.1, 0.4).toFixed(3) });
      work.forEach((w, k) => set(w, { opacity: part(born, 0.25 + k * 0.07, 0.55 + k * 0.07).toFixed(3) }));
      const go = part(born, 0.5, 0.8);

      play = ease(play, lerp(X0, MOVES[i].x + 24, go), dt, 4);
      const start = MOVES[0].x + 12;
      set(progress, { x1: start, x2: Math.max(start, play).toFixed(1), opacity: play > start ? 1 : 0 });
      set(head, { cx: play.toFixed(1), opacity: go.toFixed(3) });

      const h = seen(0);
      hand.draw(h);
      set(hand.head, { opacity: clamp(h * 3 - 2, 0, 1).toFixed(3) });
      const [px, py] = bez([MOVES[0].x, TEAM + 9], [MOVES[0].x, mid], [MOVES[0].x + 12, mid], [MOVES[0].x + 12, ME - 7], clamp(h, 0, 1));
      set(parcel, { transform: `translate(${px.toFixed(1)} ${py.toFixed(1)})`, opacity: (h > 0 && h < 1 ? 1 : 0).toFixed(3) });

      const c = seen(1);
      set(checkLine, { opacity: c.toFixed(3) });
      set(checkRing, { opacity: c.toFixed(3), transform: scaleAt(MOVES[1].x, ME, 0.6 + 0.4 * c) });

      const q = seen(2);
      ask.draw(q);
      set(ask.head, { opacity: q.toFixed(3) });
      set(bubble, { transform: `translate(${MOVES[2].x + 10} ${mid}) scale(${(0.6 + 0.4 * q).toFixed(3)})`, opacity: q.toFixed(3) });

      const d = seen(3);
      direct.draw(d);
      set(direct.head, { opacity: clamp(d * 3 - 2, 0, 1).toFixed(3) });

      texts.forEach((t, k) => set(t, { fill: k === i ? C.ink : C.ink3, "font-weight": k === i ? 600 : 500, opacity: go.toFixed(3) }));
      return MOVES[i].read;
    },
  };
};

/* ------------------------------------------------------------ 4. learn */

/**
 * Learning as a chain of projects. Each project is an arc, and each one
 * starts a little higher than the last: it begins from everything the earlier
 * ones taught. Along the way the System notes what worked (a tick) and what
 * didn't (a cross), and every lesson drops into the company brain below.
 */
const learn: Build = (svg) => {
  const XS = [70, 140, 210, 280, 350];
  const LEVELS = [238, 214, 190, 166, 142]; // where each project starts: higher every time
  const N = 4;
  const AT = [0.3, 0.55, 0.8]; // where on an arc its lessons are noted
  const KINDS = [
    [1, 0, 1],
    [1, 1, 0],
    [0, 1, 1],
    [1, 1, 1],
  ]; // 1 worked, 0 didn't
  const BRAIN = 292;

  const arcs = Array.from({ length: N }, (_, k) => {
    const p0: Point = [XS[k], LEVELS[k]];
    const p3: Point = [XS[k + 1], LEVELS[k + 1]];
    const w = XS[k + 1] - XS[k];
    return [p0, [p0[0] + w * 0.12, p0[1] - 62], [p3[0] - w * 0.12, p3[1] - 62], p3] as [Point, Point, Point, Point];
  });
  const pathOf = ([p0, c1, c2, p3]: Point[]) => `M${f(p0)}C${f(c1)} ${f(c2)} ${f(p3)}`;

  // the axis: what it knows, rising
  const axis = el("path", { d: `M40 ${LEVELS[0] + 14}V${LEVELS[4] - 22}M36 ${LEVELS[4] - 17}L40 ${LEVELS[4] - 22}L44 ${LEVELS[4] - 17}`, ...LINE, stroke: C.ink4, "stroke-width": 1.4 }, svg);
  const drawAxis = drawable(axis);
  const axisText = el("text", { "font-size": 10, "font-weight": 500, fill: C.ink3, "text-anchor": "middle", transform: `translate(28 ${(LEVELS[0] + LEVELS[4]) / 2}) rotate(-90)` }, svg);
  axisText.textContent = "What it knows";

  // where each project starts, read off the axis
  const guides = XS.map((x, k) => el("line", { x1: 44, x2: x - 7, y1: LEVELS[k], y2: LEVELS[k], stroke: C.ink4, "stroke-width": 1.2, "stroke-dasharray": "2 4", "stroke-linecap": "round" }, svg));
  const plans = arcs.map((a) => el("path", { d: pathOf(a), ...LINE, stroke: C.ink4, "stroke-width": 1.4, "stroke-dasharray": "3 5" }, svg));
  const runs = arcs.map((a) => {
    const p = el("path", { d: pathOf(a), ...LINE, stroke: G.deep, "stroke-width": 2 }, svg);
    return drawable(p);
  });
  const starts = XS.map((x, k) => el("circle", { cx: x, cy: LEVELS[k], r: 4.5, fill: C.paper, "stroke-width": 1.6 }, svg));

  // lessons: a tick or a cross on the arc, and a dot in the brain
  const brainText = label(svg, 40, BRAIN + 4, "Company brain");
  const lessons = arcs.flatMap((a, k) =>
    AT.map((t, j) => {
      const [x, y] = bez(...a, t);
      const worked = KINDS[k][j] === 1;
      const glyph = el(
        "path",
        { d: worked ? "M-4 0l3 3l5 -6" : "M-3.5 -3.5l7 7M3.5 -3.5l-7 7", ...LINE, stroke: worked ? G.deep : C.ink3, "stroke-width": 1.7 },
        svg,
      );
      const n = k * AT.length + j;
      const dot = el("circle", { cx: 140 + n * 18, cy: BRAIN, r: 4, "stroke-width": 1.5 }, svg);
      return { at: k + t, x, y: y - 14, worked, glyph, dot };
    }),
  );
  const rider = badge(svg, 0, 0, 10);

  let u = 0;

  return {
    states: arcs.map((_, k) => `project ${k + 1}`),
    rest: 0,
    pick: (x) => clamp(Math.floor((x - XS[0]) / (XS[1] - XS[0])), 0, N - 1),
    frame(i, dt, _now, born) {
      drawAxis(part(born, 0, 0.4));
      set(axisText, { opacity: part(born, 0.2, 0.5).toFixed(3) });
      set(brainText, { opacity: part(born, 0.3, 0.6).toFixed(3) });
      guides.forEach((g, k) => set(g, { opacity: part(born, 0.2 + k * 0.06, 0.5 + k * 0.06).toFixed(3) }));
      plans.forEach((p, k) => set(p, { opacity: part(born, 0.3 + k * 0.06, 0.6 + k * 0.06).toFixed(3) }));

      u = ease(u, (i + 1) * part(born, 0.55, 0.8), dt, 2.4);
      runs.forEach((r, k) => r(u - k));
      starts.forEach((s, k) => {
        const on = clamp((u - k) * 6 + 1, 0, 1);
        set(s, { stroke: mix(C.ink4, G.deep, on), opacity: part(born, 0.3 + k * 0.06, 0.6 + k * 0.06).toFixed(3) });
        // only the level the current project starts from stands out
        set(guides[k], { stroke: k === i ? G.mid : C.line });
      });
      lessons.forEach((l) => {
        const t = clamp((u - l.at) * 8, 0, 1);
        set(l.glyph, { transform: `translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) scale(${(0.5 + 0.5 * t).toFixed(3)})`, opacity: t.toFixed(3) });
        set(l.dot, {
          stroke: t > 0 ? (l.worked ? G.deep : C.ink2) : C.ink4,
          fill: l.worked ? mix(C.paper, G.deep, t) : C.paper,
          opacity: part(born, 0.35, 0.65).toFixed(3),
        });
      });

      const k = clamp(Math.ceil(u) - 1, 0, N - 1);
      const [rx, ry] = bez(...arcs[k], clamp(u - k, 0, 1));
      set(rider, { transform: `translate(${rx.toFixed(1)} ${ry.toFixed(1)})`, opacity: part(born, 0.5, 0.7).toFixed(3) });
      return i ? `Project ${i + 1}: starts with ${i * AT.length} lessons` : "Project 1: starting fresh";
    },
  };
};

/* ------------------------------------------------------------ host */

const FIGURES: Record<FigureName, Build> = { outcome, dock, table, learn };

export function mountFigure(
  stage: HTMLElement,
  name: FigureName,
  { readout, rail }: { readout?: HTMLElement | null; rail?: HTMLElement | null } = {},
) {
  const id = `fig-${name}`;
  const svg = el("svg", { viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, "aria-hidden": "true" }, stage);
  const fig = FIGURES[name](svg, id);
  const count = fig.states.length;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let pointed: number | null = null;
  let chosen = fig.rest; // under reduced motion: the state the rail last picked
  let tourFrom = performance.now();
  let bornAt = 0; // when the figure first came on screen; 0 until then
  let raf = 0;
  let last = 0;
  let visible = false;
  let text = "";

  // The rail: one button per state. The one on show fills while the tour
  // holds it, so the rail doubles as the tour's clock.
  const segs = (rail ? fig.states : []).map((state, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", `Show ${state}`);
    b.append(document.createElement("i"));
    b.addEventListener("click", () => jump(k));
    rail!.append(b);
    return { b, fill: -1, on: false };
  });

  const draw = (now: number, dt: number) => {
    const t = (now - tourFrom) / TOUR;
    const i = pointed ?? (reduce ? chosen : (fig.rest + Math.max(0, Math.floor(t))) % count);
    const born = reduce ? 1 : bornAt ? clamp((now - bornAt) / INTRO, 0, 1) : 0;
    const read = fig.frame(i, dt, reduce ? 0 : now, born);
    if (readout && read !== text) {
      readout.textContent = text = read;
      if (!reduce && dt > 0) {
        readout.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], {
          duration: 360,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      }
    }
    const held = pointed !== null || reduce ? 1 : clamp(t - Math.floor(t), 0, 1);
    segs.forEach((s, k) => {
      const fill = k < i ? 1 : k === i ? (born < 1 ? 0 : held) : 0;
      if (Math.abs(fill - s.fill) > 0.002) s.b.style.setProperty("--p", (s.fill = fill).toFixed(3));
      if (s.on !== (k === i)) {
        s.on = k === i;
        s.b.classList.toggle("on", s.on);
        s.b.setAttribute("aria-pressed", String(s.on));
      }
    });
  };

  const frame = (now: number) => {
    raf = 0;
    if (!visible) return;
    draw(now, last ? Math.min(0.05, (now - last) / 1000) : 1 / 60);
    last = now;
    // Reduced motion: one snapped frame per change, no running loop.
    if (!reduce) raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    if (reduce) draw(performance.now(), 0);
    else if (!raf && visible) raf = requestAnimationFrame(frame);
  };

  /** Show state `k` now, and carry the tour on from there. */
  function jump(k: number) {
    if (reduce) chosen = k;
    else tourFrom = performance.now() - ((k - fig.rest + count) % count) * TOUR;
    wake();
  }

  const onMove = (event: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    pointed = fig.pick(VB.x + ((event.clientX - r.left) / r.width) * VB.w, VB.y + ((event.clientY - r.top) / r.height) * VB.h);
    wake();
  };
  const onLeave = () => {
    // pick the tour up from where the pointer left it
    if (pointed !== null) jump(pointed);
    pointed = null;
    wake();
  };

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    last = 0;
    if (visible && !bornAt) {
      // Build in once, just after the card itself has faded up, and hold the
      // resting state a beat longer before the tour sets off.
      bornAt = performance.now() + 250;
      tourFrom = bornAt + INTRO * 0.6;
    }
    if (visible) wake();
  });
  io.observe(stage);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);
  draw(performance.now(), 0);

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("pointerleave", onLeave);
    svg.remove();
    segs.forEach((s) => s.b.remove());
  };
}
