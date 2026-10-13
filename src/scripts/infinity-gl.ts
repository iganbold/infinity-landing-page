/**
 * WebGL2 renderer for the infinity mark. Two layers per canvas:
 *
 *  1. Liquid: a full-screen pass over a baked distance field of the lemniscate.
 *     Draws a glassy water tube (caustics, fresnel rim, specular) plus a soft
 *     colored glow. In "lights" mode only the glow band is drawn.
 *  2. Lights: point sprites streaming along the curve, swirling around it and
 *     scattering away from the cursor.
 *
 * Canvases opt in with [data-infinity-gl]; see components/InfinityGL.astro.
 * The curve math matches lib/infinity.ts so overlays (SVG labels) line up.
 */

type Mode = "liquid" | "lights" | "both";

interface Inst {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  mode: Mode;
  pad: [number, number];
  thickFrac: number;
  particleCount: number;
  liquid: { prog: WebGLProgram; vao: WebGLVertexArrayObject; u: Record<string, WebGLUniformLocation | null> };
  lights: { prog: WebGLProgram; vao: WebGLVertexArrayObject; u: Record<string, WebGLUniformLocation | null>; count: number };
  tex: WebGLTexture;
  w: number;
  h: number;
  dpr: number;
  box: [number, number, number, number];
  thick: number;
  texel: [number, number];
  sizeScale: number;
  mouse: [number, number];
  visible: boolean;
  drops: Drops;
  /** The curve sampled at SAMPLES points (x, y pairs), for cheap hit tests. */
  samples: Float32Array;
  lastT: number;
}

/**
 * Splash drops: a fixed pool simulated on the CPU (trivial at this size) and
 * drawn as point sprites in one call, only while any are alive.
 * Per drop in `gpu`: x, y, alpha, size (packed live drops only).
 */
interface Drops {
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  u: Record<string, WebGLUniformLocation | null>;
  gpu: Float32Array;
  sim: Float32Array;
  alive: number;
  next: number;
}

const DROPS = 160;
/** Floats per drop in `sim`: x, y, vx, vy, life, maxLife, size. */
const SIM = 7;
const SAMPLES = 360;

const PALETTE = /* glsl */ `
vec3 pal(float x) {
  x = clamp(x, 0.0, 1.0);
  // Sunrise: warm gold, pale gold, a hint of green, cream.
  vec3 a = vec3(1.00, 0.72, 0.36);
  vec3 b = vec3(1.00, 0.86, 0.58);
  vec3 c = vec3(0.86, 0.93, 0.72);
  vec3 d = vec3(1.00, 0.95, 0.84);
  if (x < 0.4) return mix(a, b, x / 0.4);
  if (x < 0.75) return mix(b, c, (x - 0.4) / 0.35);
  return mix(c, d, (x - 0.75) / 0.25);
}`;

const QUAD_VS = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const LIQUID_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uDF;
uniform vec2 uRes;
uniform vec2 uTexel;
uniform vec2 uMouse;
uniform float uTime;
uniform float uThick;
uniform float uTube;
uniform float uGlow;
in vec2 vUv;
out vec4 o;
${PALETTE}

// Water caustics (after Dave Hoskins' tileable caustic).
float caustic(vec2 uv) {
  vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = uTime * 0.55 * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

// Deep teal (dark blue + green) for the water body; a brighter teal of the
// same hue for the light travelling through it (pulses, streaks).
const vec3 WATER = vec3(0.05, 0.15, 0.12);
// Pale glassy green toward the tube's edges.
const vec3 EDGE = vec3(0.78, 0.89, 0.74);
const vec3 GLINT = vec3(0.26, 0.82, 0.62);
// Comet streaks lean a little bluer than the rest of the light.
const vec3 COMET = vec3(0.2, 0.68, 0.86);

// Value noise that tiles every \`per\` cells in x, so a texture laid along the
// loop (x = curve parameter * cells) meets itself without a seam.
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tnoise(vec2 p, float per) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, per);
  float x1 = mod(i.x + 1.0, per);
  return mix(
    mix(hash2(vec2(x0, i.y)), hash2(vec2(x1, i.y)), f.x),
    mix(hash2(vec2(x0, i.y + 1.0)), hash2(vec2(x1, i.y + 1.0)), f.x),
    f.y);
}
float tfbm(vec2 p, float per) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * tnoise(p, per);
    p *= 2.0;
    per *= 2.0;
    amp *= 0.5;
  }
  return v;
}

// Screen position of the current fragment (0..1, y down), set in main().
vec2 gSt;

// Bright pulses riding the current around the loop. tt: curve parameter.
float pulseAt(float tt) {
  float p = 0.0;
  for (int k = 0; k < 3; k++) {
    float ph = fract(tt - uTime * 0.15 - float(k) / 3.0);
    float dd = min(ph, 1.0 - ph);
    p += exp(-dd * dd / 0.0011);
  }
  return p;
}

// One strand of glass tube. d: distance to the strand, tt: curve parameter of
// the nearest point, g: outward direction. Returns premultiplied color.
vec4 tube(float d, float tt, vec2 g, vec3 base, float bulge) {
  // Ripples travel along the tube; the cursor swells it. Integer frequencies keep
  // every term periodic in tt, so the two strand layers agree where they meet.
  float pulse = pulseAt(tt);
  // Wider through the outer lobes (t = 0, 0.5), back to base width at the
  // crossing (t = 0.25, 0.75); drifts slightly over time so it feels alive.
  float swell = 0.5 + 0.5 * cos(tt * 6.2831853 * 2.0 + 0.35 * sin(uTime * 0.4));
  float r = uThick * (1.0
    + 0.36 * swell
    + 0.06 * sin(tt * 6.2831853 * 7.0 - uTime * 5.2)
    + 0.04 * sin(tt * 6.2831853 * 3.0 - uTime * 3.0)
    + 0.22 * pulse
    + 0.45 * bulge);
  d += (sin(tt * 6.2831853 * 23.0 - uTime * 4.0) + sin(tt * 6.2831853 * 37.0 - uTime * 2.8)) * uThick * 0.015;

  float q = d / r;
  float aa = 1.5 / r;
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, q);
  if (inside <= 0.0) return vec4(0.0);
  float qc = min(q, 1.0);
  float h = sqrt(max(1.0 - qc * qc, 0.0));
  vec3 N = normalize(vec3(g * qc, h));
  float fres = pow(1.0 - h, 2.0);
  vec3 L1 = normalize(vec3(-0.5, -0.7, 0.6));
  vec3 L2 = normalize(vec3(0.6, 0.4, 0.7));
  float spec = pow(max(dot(reflect(-L1, N), vec3(0, 0, 1)), 0.0), 48.0);
  spec += 0.45 * pow(max(dot(reflect(-L2, N), vec3(0, 0, 1)), 0.0), 20.0);
  float ca = caustic(vec2(tt * 16.0 - uTime * 1.1, qc * 0.9 + tt * 2.0));

  // Glass water: pale, glassy green at the edges deepening to a dark green core,
  // with a thin golden rim.
  float rim = smoothstep(0.78, 0.98, qc);
  vec3 c = mix(vec3(1.0), base, 0.35 + 0.55 * fres);
  float core = pow(h, 1.4);
  vec3 body = mix(EDGE, WATER, core);
  c = mix(c, body, 1.0 - rim);

  // Ocean texture: domain-warped noise flowing along the tube gives soft deep
  // and shallow patches (swells); a caustic net adds sunlit ripples; a few foam
  // flecks catch the light near the edges. All tiles once per loop.
  const float CELLS = 56.0;
  vec2 np = vec2(tt * CELLS, qc * 2.2);
  vec2 warp = vec2(
    tfbm(np + vec2(0.0, uTime * 0.25), CELLS),
    tfbm(np + vec2(0.0, 5.2 - uTime * 0.2), CELLS));
  float swellN = tfbm(np + 1.8 * warp - vec2(uTime * 1.6, 0.0), CELLS);
  c = mix(c, mix(EDGE, WATER, clamp(core * (0.25 + 1.5 * swellN), 0.0, 1.0)), 1.0 - rim);
  c += (swellN - 0.45) * 0.22 * EDGE * (1.0 - rim);
  float ca2 = caustic(vec2(tt * 22.0 - uTime * 0.9, qc * 1.3 + 0.4 * warp.x));
  c += ca2 * 1.1 * mix(EDGE, vec3(1.0), 0.3) * (0.4 + 0.6 * swellN);
  float foam = smoothstep(0.68, 0.82, tfbm(np * 2.0 + vec2(-uTime * 3.0, 3.1), CELLS * 2.0)) * (1.0 - core * 0.8);
  c += foam * 0.5 * EDGE;
  float fil = ca2 * 0.6 + foam * 0.4;

  c += ca * 0.25 * mix(vec3(1.0), EDGE, 0.5);
  c = mix(c, base * 1.15, rim * 0.55);
  c += pulse * mix(vec3(1.0), GLINT, 0.85) * (0.35 + 0.5 * h);

  // Light streaks: short bright dashes in three lanes across the tube, each
  // shooting along with the current at its own speed. Integer frequencies keep them seamless.
  float streaks = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float lane = 0.18 + fk * 0.26 + 0.03 * sin(tt * 6.2831853 * (3.0 + fk) + uTime * (0.8 + fk * 0.35));
    float line = exp(-pow((qc - lane) / 0.028, 2.0));
    float ph = fract(tt * (5.0 + fk * 2.0) - uTime * (1.6 + fk * 0.5) + fk * 0.41);
    // Comet-shaped dash: sharp bright head, fading tail behind it.
    float dash = smoothstep(0.0, 0.015, 0.16 - ph) * pow(clamp(ph / 0.16, 0.0, 1.0), 1.6);
    streaks += line * dash * (0.7 + 0.3 * h);
  }
  streaks *= 0.55;
  c += streaks * mix(WATER, COMET, 0.8);
  c = min(c + vec3(spec), vec3(1.0));
  // Sunlight: a warm reflection on the side of the tube facing the upper
  // left (where the sun is in the photo), strongest on the upper-left lobe.
  // Tints toward gold, not white.
  vec3 SUN_L = normalize(vec3(-0.7, -0.6, 0.5));
  float sunSide = pow(max(dot(N, SUN_L), 0.0), 2.5);
  float sunX = smoothstep(0.58, 0.08, gSt.x) * smoothstep(0.8, 0.25, gSt.y);
  float sun = sunSide * sunX;
  c = mix(c, vec3(1.0, 0.8, 0.42), sun * 0.6);
  c += vec3(0.35, 0.24, 0.06) * pow(sunSide, 6.0) * sunX;

  float a = clamp(0.48 + 0.12 * core + sun * 0.15 + 0.5 * fres + rim * 0.45 + ca * 0.25 + fil * 0.2 + spec + pulse * 0.35 + streaks * 0.35, 0.0, 1.0) * inside;
  return vec4(c * a, a);
}

void main() {
  vec2 st = vec2(vUv.x, 1.0 - vUv.y);
  vec2 px = st * uRes;
  gSt = st;

  // Two strand layers: A is the strand through the crossing (t in 0.10..0.40),
  // B is the rest of the loop (t in 0.35..1.15). r,g = A dist/t; b,a = B dist/t.
  vec4 df = texture(uDF, st);
  vec4 xp = texture(uDF, st + vec2(uTexel.x, 0.0));
  vec4 xm = texture(uDF, st - vec2(uTexel.x, 0.0));
  vec4 yp = texture(uDF, st + vec2(0.0, uTexel.y));
  vec4 ym = texture(uDF, st - vec2(0.0, uTexel.y));
  vec2 gA = normalize(vec2(xp.r - xm.r, yp.r - ym.r) + 1e-5);
  vec2 gB = normalize(vec2(xp.b - xm.b, yp.b - ym.b) + 1e-5);

  float md = length(px - uMouse);
  float bulge = exp(-md * md / (2.0 * 90.0 * 90.0));
  vec3 base = pal(st.x * 0.9 + 0.05 + 0.03 * sin(uTime * 0.3));

  // Glow depends only on the distance to the whole curve, so it has no seams.
  float dmin = min(df.r, df.b);
  float gd = max(dmin - uThick * (1.0 + 0.45 * bulge) * 0.5, 0.0);
  float glow = exp(-gd / (uThick * 1.6)) * uGlow * 0.62;
  // Pulse glow: a soft blend of both strands' pulses, fading fast away from the tube.
  // The nearest-point t jumps across medial axes, so it must not reach far or it draws seams.
  float wA = exp(-df.r / (uThick * 0.6));
  float wB = exp(-df.b / (uThick * 0.6));
  float pg = (pulseAt(df.g) * wA + pulseAt(df.a) * wB) / (wA + wB + 1e-5);
  float pglow = pg * exp(-gd / (uThick * 1.1)) * uGlow * 0.55;
  vec4 col = vec4(base * glow + GLINT * pglow, (glow + pglow) * 0.55);

  if (uTube > 0.5) {
    vec4 A = tube(df.r, df.g, gA, base, bulge);
    vec4 B = tube(df.b, df.a, gB, base, bulge);
    // A fades out at its ends, where B carries the same stretch of tube.
    float wA = smoothstep(0.11, 0.14, df.g) * (1.0 - smoothstep(0.36, 0.39, df.g));
    // Same stretch of tube (handoff zone) when both layers point at the same t:
    // crossfade there. Different t (the crossing): A passes over B.
    float dt = abs(fract(df.g - df.a + 0.5) - 0.5);
    float same = 1.0 - smoothstep(0.03, 0.08, dt);
    // The front strand reads as thicker glass: it hides more of the back one.
    vec4 over = A * wA + B * (1.0 - min(1.0, A.a * wA * 1.6));
    vec4 handoff = mix(B, A, wA);
    vec4 t = mix(over, handoff, same);
    col = t + col * (1.0 - t.a);
  }
  float edge = smoothstep(0.0, 0.1, min(st.x, 1.0 - st.x)) * smoothstep(0.0, 0.18, min(st.y, 1.0 - st.y));
  o = col * edge;
}`;

const LIGHTS_VS = /* glsl */ `#version 300 es
precision highp float;
in vec4 aA; // t0, speed, offset (-1..1), size
in vec4 aB; // phase, twinkle speed, far layer (0|1), hue jitter
uniform vec2 uRes;
uniform vec4 uBox; // cx, cy, half width, half height
uniform vec2 uMouse;
uniform float uTime;
uniform float uThick;
uniform float uDpr;
uniform float uSize;
uniform float uBoost;
out vec3 vCol;
out float vA;
out float vCore;
out float vStar;
${PALETTE}

vec2 curve(float t) {
  float r = t * 6.2831853;
  float s = sin(r), c = cos(r);
  float den = 1.0 + s * s;
  return vec2(uBox.x + c / den * uBox.z, uBox.y + s * c / den * 2.8284271 * uBox.w);
}

void main() {
  float t = fract(aA.x + uTime * aA.y);
  vec2 p = curve(t);
  vec2 tn = normalize(curve(t + 0.002) - p);
  vec2 nm = vec2(-tn.y, tn.x);
  // aB.z: 0 = in the tube, 1 = far halo, 2 = spray (sparks breaking off the surface).
  float far = step(0.5, aB.z) * (1.0 - step(1.5, aB.z));
  float spray = step(1.5, aB.z);
  float spread = uThick * mix(0.9, 3.6, far);
  float off = aA.z * spread * (1.0 + 0.25 * sin(uTime * 0.8 + aB.x * 6.2831853));
  float life = fract(uTime * (0.22 + aB.y * 0.07) + aB.x * 7.0);
  if (spray > 0.5) {
    float side = aA.z >= 0.0 ? 1.0 : -1.0;
    off = side * uThick * (0.8 + life * (4.0 + 7.0 * aB.x));
  }
  p += nm * off + vec2(sin(uTime * 0.7 + aB.x * 12.0), cos(uTime * 0.9 + aB.x * 9.0)) * uThick * 0.15;
  // Sparks rise as they drift away, like embers.
  p.y -= spray * life * life * uThick * 5.0;

  vec2 m = p - uMouse;
  float md = length(m);
  p += m / (md + 1e-3) * 70.0 * exp(-md * md / (2.0 * 85.0 * 85.0));

  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
  float tw = 0.5 + 0.5 * sin(uTime * aB.y + aB.x * 40.0);
  // A few tube particles flash into small four-point stars at their twinkle peak.
  float pick = step(0.94, fract(aB.x * 13.7));
  vStar = mix(pick * smoothstep(0.8, 1.0, tw) * (1.0 - far), 0.0, spray);
  gl_PointSize = aA.w * uSize * uDpr * (0.7 + 0.6 * tw) * mix(1.0, 2.4, far) * mix(1.0, 0.75, spray) * (1.0 + 1.2 * vStar);
  vCol = pal(p.x / uRes.x + aB.w);
  vec2 q = p / uRes;
  float edge = smoothstep(0.0, 0.08, min(q.x, 1.0 - q.x)) * smoothstep(0.0, 0.14, min(q.y, 1.0 - q.y));
  float sprayA = pow(1.0 - life, 1.5) * smoothstep(0.0, 0.06, life);
  vA = mix(mix(0.9, 0.3, far) * (0.35 + 0.65 * tw) * (1.0 - 0.4 * abs(aA.z)), sprayA, spray) * edge * uBoost;
  vCore = 1.0 - far;
}`;

const LIGHTS_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vCol;
in float vA;
in float vCore;
in float vStar;
out vec4 o;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  // Soft bokeh with a bright center, plus a four-point flare on star particles.
  float halo = exp(-r * r * 5.0) * smoothstep(1.0, 0.6, r);
  float core = exp(-r * r * 36.0) * vCore;
  float flare = (exp(-abs(d.x) * 44.0) * exp(-abs(d.y) * 5.5) + exp(-abs(d.y) * 44.0) * exp(-abs(d.x) * 5.5)) * vStar;
  vec3 c = mix(vCol, mix(vCol, vec3(1.0), 0.25), core);
  c = mix(c, vec3(1.0, 0.97, 0.88), clamp(flare, 0.0, 1.0) * 0.8);
  float a = clamp(halo * 0.62 + core * 0.5 + flare * 0.5, 0.0, 1.0) * vA;
  if (a < 0.003) discard;
  // Slightly additive so sparks brighten what's behind them.
  o = vec4(c * a, a * 0.7);
}`;

const DROPS_VS = /* glsl */ `#version 300 es
precision highp float;
in vec4 aD; // x, y (css px), alpha, size (css px)
uniform vec2 uRes;
uniform float uDpr;
out float vA;
void main() {
  vA = aD.z;
  gl_Position = vec4(aD.x / uRes.x * 2.0 - 1.0, 1.0 - aD.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = aD.w * uDpr;
}`;

// A water droplet: teal body, bright rim, a small offset highlight.
const DROPS_FS = /* glsl */ `#version 300 es
precision highp float;
in float vA;
out vec4 o;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float body = smoothstep(1.0, 0.8, r);
  float rim = smoothstep(0.55, 0.95, r) * body;
  float spec = exp(-dot(d - vec2(-0.16, -0.16), d - vec2(-0.16, -0.16)) * 90.0);
  vec3 c = mix(vec3(0.25, 0.65, 0.55), vec3(0.85, 1.0, 0.92), rim) + spec;
  float a = clamp(body * 0.6 + rim * 0.6 + spec, 0.0, 1.0) * vA;
  o = vec4(c * a, a);
}`;

/* ------------------------------------------------------------ helpers */

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  return prog;
}

function uniforms(gl: WebGL2RenderingContext, prog: WebGLProgram, names: string[]) {
  return Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));
}

function curvePoint(box: Inst["box"], t: number): [number, number] {
  const r = t * Math.PI * 2;
  const s = Math.sin(r);
  const c = Math.cos(r);
  const den = 1 + s * s;
  return [box[0] + (c / den) * box[2], box[1] + ((s * c) / den) * 2 * Math.SQRT2 * box[3]];
}

/** Polyline for curve parameter t0..t1 (may run past 1; the curve is periodic). */
function strand(box: Inst["box"], t0: number, t1: number, n: number) {
  const P = new Float32Array((n + 1) * 2);
  const T = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const [x, y] = curvePoint(box, t);
    P[i * 2] = x;
    P[i * 2 + 1] = y;
    T[i] = t;
  }
  return { P, T, n };
}

/** Nearest point on an open polyline: [distance, t]. Coarse scan, then refine. */
function nearest(px: number, py: number, s: ReturnType<typeof strand>): [number, number] {
  const { P, T, n } = s;
  const C = 6;
  let best = Infinity;
  let bk = 0;
  for (let k = 0; k <= n; k += C) {
    const dx = px - P[k * 2];
    const dy = py - P[k * 2 + 1];
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      bk = k;
    }
  }
  let bd = Infinity;
  let bt = 0;
  for (let a = Math.max(0, bk - C); a < Math.min(n, bk + C); a++) {
    const ax = P[a * 2];
    const ay = P[a * 2 + 1];
    const ex = P[a * 2 + 2] - ax;
    const ey = P[a * 2 + 3] - ay;
    const len2 = ex * ex + ey * ey || 1;
    const u = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2));
    const dx = px - (ax + ex * u);
    const dy = py - (ay + ey * u);
    const d2 = dx * dx + dy * dy;
    if (d2 < bd) {
      bd = d2;
      bt = T[a] + (T[a + 1] - T[a]) * u;
    }
  }
  return [Math.sqrt(bd), bt];
}

/**
 * Two-layer distance field so the crossing renders as one strand passing over
 * the other instead of a seamed union. RGBA = (dist A, t A, dist B, t B), where
 * A is the strand through the crossing and B is the rest of the loop. They
 * overlap a little at both ends so the shader can crossfade between them.
 */
function buildDF(cw: number, ch: number, box: Inst["box"], tw: number, th: number): Float32Array {
  const A = strand(box, 0.1, 0.4, 216);
  const B = strand(box, 0.35, 1.15, 576);
  const out = new Float32Array(tw * th * 4);
  for (let j = 0; j < th; j++) {
    const py = ((j + 0.5) / th) * ch;
    for (let i = 0; i < tw; i++) {
      const px = ((i + 0.5) / tw) * cw;
      const o = (j * tw + i) * 4;
      const [da, ta] = nearest(px, py, A);
      const [db, tb] = nearest(px, py, B);
      out[o] = da;
      out[o + 1] = ta;
      out[o + 2] = db;
      out[o + 3] = tb;
    }
  }
  return out;
}

function gauss(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-1, Math.min(1, g / 2.5));
}

/* ------------------------------------------------------------ setup */

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = window.matchMedia("(max-width: 760px)").matches;
const instances: Inst[] = [];

function create(canvas: HTMLCanvasElement): Inst | null {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;

  const mode = (canvas.dataset.mode as Mode) || "both";
  const pad = (canvas.dataset.pad ?? "0,0").split(",").map(Number) as [number, number];
  const thickFrac = Number(canvas.dataset.thickness ?? 0.022);
  let particleCount = Number(canvas.dataset.particles ?? 1200);
  if (mode === "liquid") particleCount = Math.round(particleCount * 0.3);
  if (small) particleCount = Math.round(particleCount * 0.55);

  // Liquid pass.
  const lp = compile(gl, QUAD_VS, LIQUID_FS);
  const lvao = gl.createVertexArray()!;
  gl.bindVertexArray(lvao);
  const qb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(lp, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // Lights pass.
  const pp = compile(gl, LIGHTS_VS, LIGHTS_FS);
  const pvao = gl.createVertexArray()!;
  gl.bindVertexArray(pvao);
  const data = new Float32Array(particleCount * 8);
  for (let i = 0; i < particleCount; i++) {
    // 0 = in the tube, 1 = far halo, 2 = spray.
    const roll = Math.random();
    const far = roll < 0.12 ? 1 : roll < 0.2 ? 2 : 0;
    const o = i * 8;
    data[o] = Math.random();
    data[o + 1] = (far === 1 ? 0.022 : 0.045) + Math.random() * 0.06;
    data[o + 2] = gauss();
    data[o + 3] = 3 + Math.random() * 6;
    data[o + 4] = Math.random();
    data[o + 5] = 0.6 + Math.random() * 2.4;
    data[o + 6] = far;
    data[o + 7] = (Math.random() - 0.5) * 0.16;
  }
  const pb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pb);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const aA = gl.getAttribLocation(pp, "aA");
  const aB = gl.getAttribLocation(pp, "aB");
  gl.enableVertexAttribArray(aA);
  gl.vertexAttribPointer(aA, 4, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(aB);
  gl.vertexAttribPointer(aB, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(null);

  // Drops pass.
  const dp = compile(gl, DROPS_VS, DROPS_FS);
  const dvao = gl.createVertexArray()!;
  gl.bindVertexArray(dvao);
  const dbuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, dbuf);
  gl.bufferData(gl.ARRAY_BUFFER, DROPS * 16, gl.DYNAMIC_DRAW);
  const aD = gl.getAttribLocation(dp, "aD");
  gl.enableVertexAttribArray(aD);
  gl.vertexAttribPointer(aD, 4, gl.FLOAT, false, 16, 0);
  gl.bindVertexArray(null);

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return {
    canvas,
    gl,
    mode,
    pad,
    thickFrac,
    particleCount,
    liquid: {
      prog: lp,
      vao: lvao,
      u: uniforms(gl, lp, ["uDF", "uRes", "uTexel", "uMouse", "uTime", "uThick", "uTube", "uGlow"]),
    },
    lights: {
      prog: pp,
      vao: pvao,
      count: particleCount,
      u: uniforms(gl, pp, ["uRes", "uBox", "uMouse", "uTime", "uThick", "uDpr", "uSize", "uBoost"]),
    },
    tex,
    w: 0,
    h: 0,
    dpr: 1,
    box: [0, 0, 0, 0],
    thick: 0,
    texel: [0, 0],
    sizeScale: 1,
    mouse: [-1e4, -1e4],
    visible: false,
    drops: {
      prog: dp,
      vao: dvao,
      buf: dbuf,
      u: uniforms(gl, dp, ["uRes", "uDpr"]),
      gpu: new Float32Array(DROPS * 4),
      sim: new Float32Array(DROPS * SIM),
      alive: 0,
      next: 0,
    },
    samples: new Float32Array(SAMPLES * 2),
    lastT: 0,
  };
}

function resize(it: Inst) {
  const r = it.canvas.getBoundingClientRect();
  const w = r.width;
  const h = r.height;
  if (w < 2 || h < 2) return;
  it.w = w;
  it.h = h;
  // Capped: the shader is per-pixel heavy, and above 1.5x the soft tube looks the same.
  it.dpr = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5);
  it.canvas.width = Math.round(w * it.dpr);
  it.canvas.height = Math.round(h * it.dpr);
  const hw = (w * (1 - 2 * it.pad[0])) / 2;
  const hh = (h * (1 - 2 * it.pad[1])) / 2;
  it.box = [w / 2, h / 2, hw, hh];
  it.thick = it.thickFrac * hw * 2;
  for (let i = 0; i < SAMPLES; i++) {
    const [x, y] = curvePoint(it.box, i / SAMPLES);
    it.samples[i * 2] = x;
    it.samples[i * 2 + 1] = y;
  }
  it.sizeScale = Math.max(0.55, Math.min(1.25, (hw * 2) / 1000));

  const tw = Math.max(128, Math.min(512, Math.round(w / 2.5)));
  const th = Math.max(48, Math.round((tw * h) / w));
  it.texel = [1 / tw, 1 / th];
  const gl = it.gl;
  gl.bindTexture(gl.TEXTURE_2D, it.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, tw, th, 0, gl.RGBA, gl.FLOAT, buildDF(w, h, it.box, tw, th));
}

function draw(it: Inst, time: number) {
  const { gl } = it;
  if (!it.w) return;
  gl.viewport(0, 0, it.canvas.width, it.canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const L = it.liquid;
  gl.useProgram(L.prog);
  gl.bindVertexArray(L.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, it.tex);
  gl.uniform1i(L.u.uDF, 0);
  gl.uniform2f(L.u.uRes, it.w, it.h);
  gl.uniform2f(L.u.uTexel, it.texel[0], it.texel[1]);
  gl.uniform2f(L.u.uMouse, it.mouse[0], it.mouse[1]);
  gl.uniform1f(L.u.uTime, time);
  gl.uniform1f(L.u.uThick, it.thick);
  gl.uniform1f(L.u.uTube, it.mode === "lights" ? 0 : 1);
  gl.uniform1f(L.u.uGlow, it.mode === "lights" ? 0.7 : 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const P = it.lights;
  gl.useProgram(P.prog);
  gl.bindVertexArray(P.vao);
  gl.uniform2f(P.u.uRes, it.w, it.h);
  gl.uniform4f(P.u.uBox, ...it.box);
  gl.uniform2f(P.u.uMouse, it.mouse[0], it.mouse[1]);
  gl.uniform1f(P.u.uTime, time);
  gl.uniform1f(P.u.uThick, it.thick);
  gl.uniform1f(P.u.uDpr, it.dpr);
  gl.uniform1f(P.u.uSize, it.sizeScale * (it.mode === "lights" ? 1.35 : 1.15));
  gl.uniform1f(P.u.uBoost, it.mode === "lights" ? 1.15 : 0.95);
  gl.drawArrays(gl.POINTS, 0, P.count);

  const dt = Math.min(0.05, Math.max(0, time - it.lastT));
  it.lastT = time;
  const n = stepDrops(it.drops, dt, it.h);
  if (n) {
    const D = it.drops;
    gl.useProgram(D.prog);
    gl.bindVertexArray(D.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, D.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, D.gpu, 0, n * 4);
    gl.uniform2f(D.u.uRes, it.w, it.h);
    gl.uniform1f(D.u.uDpr, it.dpr);
    gl.drawArrays(gl.POINTS, 0, n);
  }
}

/** Advance live drops and pack them at the front of `gpu`. Returns the live count. */
function stepDrops(D: Drops, dt: number, floor: number): number {
  if (!D.alive) return 0;
  const G = 1400; // gravity, px/s²
  let n = 0;
  for (let i = 0; i < DROPS; i++) {
    const s = i * SIM;
    if (D.sim[s + 4] <= 0) continue;
    const life = (D.sim[s + 4] -= dt);
    D.sim[s + 3] += G * dt;
    const x = (D.sim[s] += D.sim[s + 2] * dt);
    const y = (D.sim[s + 1] += D.sim[s + 3] * dt);
    if (life <= 0 || y > floor) {
      D.sim[s + 4] = 0;
      continue;
    }
    const o = n++ * 4;
    D.gpu[o] = x;
    D.gpu[o + 1] = y;
    D.gpu[o + 2] = Math.min(1, (life / D.sim[s + 5]) * 1.6);
    D.gpu[o + 3] = D.sim[s + 6];
  }
  D.alive = n;
  return n;
}

/** Launch `count` drops from (x, y), thrown along normal (nx, ny) on both sides, carried by (mvx, mvy). */
function splash(D: Drops, x: number, y: number, nx: number, ny: number, mvx: number, mvy: number, count: number, thick: number) {
  for (let k = 0; k < count; k++) {
    const s = D.next * SIM;
    D.next = (D.next + 1) % DROPS;
    const side = Math.random() < 0.5 ? -1 : 1;
    const speed = 180 + Math.random() * 380;
    const spread = (Math.random() - 0.5) * 0.9;
    D.sim[s] = x + nx * side * thick * 0.6;
    D.sim[s + 1] = y + ny * side * thick * 0.6;
    D.sim[s + 2] = (nx * side + -ny * spread) * speed + mvx * 0.35;
    D.sim[s + 3] = (ny * side + nx * spread) * speed + mvy * 0.35 - 220 - Math.random() * 260;
    const life = 0.55 + Math.random() * 0.6;
    D.sim[s + 4] = life;
    D.sim[s + 5] = life;
    D.sim[s + 6] = 4 + Math.random() * 8;
  }
  D.alive = Math.max(D.alive, 1);
}

/* ------------------------------------------------------------ boot */

const start = performance.now();
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const it = instances.find((i) => i.canvas === e.target);
      if (it) it.visible = e.isIntersecting;
    }
    if (!reduced) ensureLoop();
  },
  { rootMargin: "100px" },
);

let raf = 0;
function frame() {
  raf = 0;
  const t = (performance.now() - start) / 1000;
  let any = false;
  for (const it of instances) {
    if (!it.visible) continue;
    any = true;
    draw(it, t);
  }
  if (any) raf = requestAnimationFrame(frame);
}
function ensureLoop() {
  if (!raf) raf = requestAnimationFrame(frame);
}

document.querySelectorAll<HTMLCanvasElement>("canvas[data-infinity-gl]").forEach((canvas) => {
  let it: Inst | null = null;
  try {
    it = create(canvas);
  } catch (err) {
    console.warn("[infinity-gl]", err);
  }
  if (!it) return;
  const inst = it;
  instances.push(inst);
  resize(inst);
  if (reduced) draw(inst, 6);
  canvas.dataset.ready = "1";
  io.observe(canvas);

  let t = 0;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      resize(inst);
      if (reduced) draw(inst, 6);
    }, 120);
  }).observe(canvas);
});

/**
 * Splash when the pointer crosses the tube. Nearest-point search over the
 * pre-sampled curve (only on pointer moves), rate-limited, scaled by speed.
 */
const lastSplash = new WeakMap<Inst, number>();
function maybeSplash(it: Inst, mx: number, my: number, dx: number, dy: number, now: number) {
  const moved = Math.hypot(dx, dy);
  if (moved < 2 || now - (lastSplash.get(it) ?? 0) < 28) return;
  const S = it.samples;
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const ex = S[i * 2] - mx;
    const ey = S[i * 2 + 1] - my;
    const d2 = ex * ex + ey * ey;
    if (d2 < best) {
      best = d2;
      bi = i;
    }
  }
  const reach = it.thick * 1.6;
  if (best > reach * reach) return;
  lastSplash.set(it, now);
  // Curve normal from neighbouring samples.
  const a = ((bi + SAMPLES - 1) % SAMPLES) * 2;
  const b = ((bi + 1) % SAMPLES) * 2;
  let tx = S[b] - S[a];
  let ty = S[b + 1] - S[a + 1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const count = Math.min(14, 4 + Math.round(moved / 4));
  splash(it.drops, S[bi * 2], S[bi * 2 + 1], -ty, tx, dx * 60, dy * 60, count, it.thick);
  ensureLoop();
}

if (instances.length && window.matchMedia("(pointer: fine)").matches && !reduced) {
  window.addEventListener(
    "pointermove",
    (e) => {
      for (const it of instances) {
        if (!it.visible) continue;
        const r = it.canvas.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const [px, py] = it.mouse;
        it.mouse = [mx, my];
        if (px < -1e3) continue;
        maybeSplash(it, mx, my, mx - px, my - py, e.timeStamp);
      }
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    for (const it of instances) it.mouse = [-1e4, -1e4];
  });
}

export {};
