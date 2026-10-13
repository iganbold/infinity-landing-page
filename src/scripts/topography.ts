/**
 * Animated topographic contour lines on a canvas, after React Bits'
 * Topography: a smoothly morphing field drawn as contour bands, coloured by
 * elevation, with a soft swell under the pointer. Plain WebGL2, no library.
 * Pauses offscreen and in hidden tabs; renders one still frame under reduced
 * motion. Usage: mountTopography(canvas, { pointerTarget, colors... }).
 */

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1];
};

const VERT = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uMorphAmount, uBands, uThickness, uGlow, uContrast, uOpacity, uGrain;
uniform vec3 uLow, uMid, uHigh;
uniform vec2 uMouse;
uniform float uMouseRadius, uMouseStrength, uMouseActive;
uniform vec4 uCtrlA, uCtrlB, uCtrlC, uCtrlD;
out vec4 fragColor;

float bez(float t, vec4 c) {
  float w = 6.2831853 * t;
  return 0.5 * (c.x * sin(w) + c.y * cos(w) + c.z * sin(2.0 * w) + c.w * cos(2.0 * w));
}
float field(vec2 uv) {
  vec2 a = vec2(bez(uv.x, uCtrlA), bez(uv.x, uCtrlB));
  vec2 b = vec2(bez(uv.y, uCtrlC), bez(uv.y, uCtrlD));
  return distance(a, b);
}
vec3 elevationColor(float e) {
  vec3 c = mix(uLow, uMid, smoothstep(0.0, 0.5, e));
  return mix(c, uHigh, smoothstep(0.5, 1.0, e));
}
void main() {
  vec2 res = iResolution.xy;
  vec2 uv = gl_FragCoord.xy / res;
  float fv = field(uv);

  vec2 d = uv - uMouse;
  d.x *= res.x / max(res.y, 1.0);
  float r = max(uMouseRadius, 0.001);
  fv += exp(-dot(d, d) / (r * r)) * uMouseStrength * uMouseActive;

  float f = fv * uBands;
  float fr = fract(f);
  float lineDist = min(fr, 1.0 - fr);
  float aa = fwidth(f) + 0.0001;
  float mask = 1.0 - smoothstep(uThickness - aa, uThickness + aa, lineDist);
  float glowR = uThickness + uGlow * 0.5 + aa;
  float glow = 1.0 - smoothstep(uThickness, glowR, lineDist);

  float elev = clamp(fv / (uMorphAmount * 2.5 + 0.001), 0.0, 1.0);
  vec3 col = elevationColor(elev);
  float a = pow(clamp(mask + glow * 0.55, 0.0, 1.0), uContrast);

  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + iTime) * 43758.5453);
  a = clamp(a + (g - 0.5) * uGrain, 0.0, 1.0) * uOpacity;
  fragColor = vec4(col * a, a);
}`;

const CTRL = [
  [1, -2, 3, -4],
  [9, -8, 7, -6],
  [5, 2, 5, -5],
  [-1, -3, 8, 9],
];

export interface TopographyOptions {
  pointerTarget?: HTMLElement;
  low?: string;
  mid?: string;
  high?: string;
  speed?: number;
  morphAmount?: number;
  morphSpeed?: number;
  bands?: number;
  thickness?: number;
  glow?: number;
  contrast?: number;
  opacity?: number;
  grain?: number;
  mouseRadius?: number;
  mouseStrength?: number;
  /** Only animate while setActive(true); for canvases hidden behind other content. */
  manual?: boolean;
}

export interface Topography {
  (): void;
  setActive(on: boolean): void;
}

export function mountTopography(canvas: HTMLCanvasElement, o: TopographyOptions = {}): Topography {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return Object.assign(() => {}, { setActive() {} });
  const opt = {
    low: "#2f7a55", mid: "#a3c2a8", high: "#eaf6cc",
    speed: 0.35, morphAmount: 3, morphSpeed: 0.05, bands: 2, thickness: 0.01, glow: 0.5,
    contrast: 3, opacity: 0.85, grain: 0.04, mouseRadius: 0.3, mouseStrength: 0.4, ...o,
  };

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  // one oversized triangle covering the viewport
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "position");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = {
    res: U("iResolution"), time: U("iTime"), mouse: U("uMouse"), active: U("uMouseActive"),
    ctrl: ["uCtrlA", "uCtrlB", "uCtrlC", "uCtrlD"].map(U),
  };
  gl.uniform1f(U("uMorphAmount"), opt.morphAmount);
  gl.uniform1f(U("uBands"), opt.bands);
  gl.uniform1f(U("uThickness"), opt.thickness);
  gl.uniform1f(U("uGlow"), opt.glow);
  gl.uniform1f(U("uContrast"), opt.contrast);
  gl.uniform1f(U("uOpacity"), opt.opacity);
  gl.uniform1f(U("uGrain"), opt.grain);
  gl.uniform1f(U("uMouseRadius"), opt.mouseRadius);
  gl.uniform1f(U("uMouseStrength"), opt.mouseStrength);
  gl.uniform3fv(U("uLow"), hex(opt.low));
  gl.uniform3fv(U("uMid"), hex(opt.mid));
  gl.uniform3fv(U("uHigh"), hex(opt.high));
  gl.clearColor(0, 0, 0, 0);

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.res, w, h);
  };

  const mouse = [0.5, 0.5], target = [0.5, 0.5];
  let active = 0, activeTarget = 0;
  const host = opt.pointerTarget ?? canvas;
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    target[0] = (e.clientX - r.left) / r.width;
    target[1] = 1 - (e.clientY - r.top) / r.height;
    activeTarget = 1;
  };
  const onLeave = () => (activeTarget = 0);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);

  const ctrl = CTRL.map(() => new Float32Array(4));
  const t0 = performance.now();
  const draw = (now: number) => {
    const time = (now - t0) / 1000;
    for (let g = 0; g < 4; g++) {
      for (let j = 0; j < 4; j++) {
        const i = CTRL[g][j];
        ctrl[g][j] = opt.morphAmount * Math.sin(time * opt.speed * Math.sin(i * opt.morphSpeed) + i);
      }
      gl.uniform4fv(u.ctrl[g], ctrl[g]);
    }
    mouse[0] += 0.05 * (target[0] - mouse[0]);
    mouse[1] += 0.05 * (target[1] - mouse[1]);
    active += 0.05 * (activeTarget - active);
    gl.uniform2f(u.mouse, mouse[0], mouse[1]);
    gl.uniform1f(u.active, active);
    gl.uniform1f(u.time, time);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0, visible = false, enabled = !o.manual;
  const loop = (now: number) => {
    draw(now);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (reduced) { size(); draw(t0 + 4000); return; }
    if (!raf && enabled && visible && !document.hidden) raf = requestAnimationFrame(loop);
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  const ro = new ResizeObserver(() => { size(); if (!raf) draw(performance.now()); });
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); });
  io.observe(canvas);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVis);
  size();

  const dispose = () => {
    stop();
    ro.disconnect();
    io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerleave", onLeave);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
  return Object.assign(dispose, {
    setActive(on: boolean) {
      enabled = on;
      on ? start() : stop();
    },
  });
}
