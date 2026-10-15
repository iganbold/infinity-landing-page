/**
 * Liquid warp over a block of text, after React Bits' WarpText: the element's
 * own content is rasterized into a texture, then drawn through a shader that
 * drifts it with noise and bulges, ripples and splits it (a little chromatic
 * fringe) around the pointer. Plain WebGL2, no library. The DOM content stays
 * in place (hidden) for layout and accessibility; without WebGL nothing changes.
 *
 * `paint(ctx, box)` draws the content as a mask (any opaque colour) in CSS pixels, with
 * `box` the host's bounding rect, so it can place things from their own rects.
 */

const VERT = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() { vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uText;
uniform vec2 uResolution, uPointer;
uniform float uPointerActive, uTime, uWarpStrength, uWarpScale, uSpeed;
uniform float uPointerInfluence, uPointerStrength, uRefraction, uRipple, uMotion;
uniform vec3 uInk, uBg, uFringeA, uFringeB;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
vec4 sampleText(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(uText, vec2(uv.x, 1.0 - uv.y));
}
void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float time = uTime * uSpeed, scale = max(uWarpScale, 0.001);
  vec2 drift = vec2(time * 0.055, -time * 0.045);
  float n1 = fbm(uv * scale * 3.1 + drift), n2 = fbm((uv + 19.17) * scale * 3.4 - drift.yx);
  vec2 ambient = (vec2(n1, n2) - 0.5) * uWarpStrength * 0.045 * uMotion;

  vec2 pd = uv - uPointer, ad = vec2(pd.x * aspect, pd.y);
  float dist = length(ad), radius = max(uPointerInfluence, 0.001), t = clamp(dist / radius, 0.0, 1.0);
  float lens = smoothstep(radius, 0.0, dist) * uPointerActive;
  float bulge = t * (1.0 - t) * (1.0 - t) * 6.75 * uPointerActive;
  vec2 dir = dist > 0.0001 ? vec2(ad.x / aspect, ad.y) / dist : vec2(0.0);
  float ring = (sin(dist * 28.0 - time * 4.2) * 0.5) * uRipple;
  vec2 pw = -dir * bulge * uPointerStrength * 0.045 + dir * ring * bulge * uPointerStrength * 0.016;

  vec2 d = uv + ambient + pw, sd = ambient + pw;
  float sl = length(sd);
  sd = sl > 0.00001 ? sd / sl : vec2(0.7071);
  vec2 split = sd * uRefraction * 0.16 * (0.35 + lens * 1.65);
  // The texture is a coverage mask, read as two copies split either way. Where
  // both cover, it's ink; where only one does, that copy's tint; where neither,
  // the background. The weights always sum to one, so it's mixed over the known
  // background (clean on light grounds, where dark ink with alpha would muddy),
  // and with no split it's plain ink.
  float a = sampleText(d + split).a, b = sampleText(d - split).a, both = min(a, b);
  vec3 col = uBg * (1.0 - max(a, b)) + uFringeA * (a - both) + uFringeB * (b - both) + uInk * both;
  fragColor = vec4(col + lens * both * 0.04, 1.0);
}`;

const rgb = (css: string): [number, number, number] => {
  const c = document.createElement("canvas").getContext("2d")!;
  c.fillStyle = css;
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
};

export interface WarpOptions {
  /** Ink and the ground it sits on; the canvas is opaque and paints both. */
  ink: string;
  background: string;
  /** The two tints of the split fringe, one per side. */
  fringe?: [string, string];
  warpStrength?: number;
  warpScale?: number;
  speed?: number;
  pointerInfluence?: number;
  pointerStrength?: number;
  refraction?: number;
  ripple?: boolean;
}

export function mountWarpText(host: HTMLElement, paint: (ctx: CanvasRenderingContext2D, box: DOMRect) => void, o: WarpOptions) {
  const opt = { fringe: ["#9fd35a", "#f0b445"] as [string, string], warpStrength: 0.08, warpScale: 1.7, speed: 0.55, pointerInfluence: 0.42, pointerStrength: 0.38, refraction: 0.018, ripple: true, ...o };
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: true });
  if (!gl) return () => {};
  host.appendChild(canvas);

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
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "position");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0, 0, 0, 0);

  const U = (n: string) => gl.getUniformLocation(prog, n);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  gl.uniform1f(U("uWarpStrength"), opt.warpStrength);
  gl.uniform1f(U("uWarpScale"), opt.warpScale);
  gl.uniform1f(U("uSpeed"), opt.speed);
  gl.uniform1f(U("uPointerInfluence"), opt.pointerInfluence);
  gl.uniform1f(U("uPointerStrength"), opt.pointerStrength);
  gl.uniform1f(U("uRefraction"), opt.refraction);
  gl.uniform1f(U("uRipple"), opt.ripple ? 1 : 0);
  gl.uniform1f(U("uMotion"), reduced ? 0 : 1);
  gl.uniform3fv(U("uInk"), rgb(opt.ink));
  gl.uniform3fv(U("uBg"), rgb(opt.background));
  gl.uniform3fv(U("uFringeA"), rgb(opt.fringe[0]));
  gl.uniform3fv(U("uFringeB"), rgb(opt.fringe[1]));
  const uRes = U("uResolution"), uPtr = U("uPointer"), uAct = U("uPointerActive"), uTime = U("uTime");

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.uniform1i(U("uText"), 0);

  let ready = false;
  const draw = () => { gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3); };

  /** Re-rasterize the host's content into the texture at the current size. */
  const rasterize = async () => {
    await document.fonts?.ready;
    const box = host.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    const src = document.createElement("canvas");
    src.width = canvas.width;
    src.height = canvas.height;
    const ctx = src.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(ctx, box);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    draw();
    if (!ready) { ready = true; host.classList.add("warp-ready"); }
  };

  const p = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, a: 0, on: 0 };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const r = canvas.getBoundingClientRect();
    p.tx = (e.clientX - r.left) / r.width;
    p.ty = 1 - (e.clientY - r.top) / r.height;
    p.on = 1;
  };
  const onLeave = () => (p.on = 0);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);

  const t0 = performance.now();
  let raf = 0, visible = false;
  const loop = (now: number) => {
    const t = (now - t0) / 1000;
    // With no pointer, the lens wanders slowly so the text is never still.
    const tx = p.on ? p.tx : 0.5 + Math.sin(t * 0.33) * 0.12, ty = p.on ? p.ty : 0.5 + Math.cos(t * 0.27) * 0.1;
    const k = p.on ? 0.12 : 0.035;
    p.x += (tx - p.x) * k;
    p.y += (ty - p.y) * k;
    p.a += ((p.on ? 1 : 0.18) - p.a) * 0.06;
    gl.uniform2f(uPtr, p.x, p.y);
    gl.uniform1f(uAct, reduced ? p.a * 0.35 : p.a);
    gl.uniform1f(uTime, reduced ? 0 : t);
    draw();
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (!raf && visible && !document.hidden && ready) raf = requestAnimationFrame(loop); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  let rt = 0;
  const ro = new ResizeObserver(() => { clearTimeout(rt); rt = window.setTimeout(() => rasterize().then(start), 80); });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); });
  io.observe(host);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVis);

  return () => {
    stop();
    ro.disconnect();
    io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerleave", onLeave);
    host.classList.remove("warp-ready");
    canvas.remove();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}
