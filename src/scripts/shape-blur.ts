/**
 * Shape blur over an image, after React Bits' ShapeBlur: the image is drawn
 * into a blur pyramid and composited with a per-pixel blur shaped by a rounded
 * rect (the "core"). Sharp at the core's edge, the blur grows outward to the
 * host's edge, strongest under a pointer lens, with a slight chromatic split
 * pointing away from the core.
 *
 * The canvas redraws the image exactly as CSS `background: <position> / cover`
 * lays it over `box`, following the box's transforms (a parallax layer, say),
 * so it can sit over the CSS backdrop and fade in without a seam.
 *
 * The blur lives only while the pointer is over the host, and GL is set up on
 * the first hover, so hosts nobody touches never take a WebGL context.
 * mountShapeBlur(host, options) appends a canvas that fills the (positioned)
 * host and returns a cleanup function.
 */

export interface ShapeBlurOptions {
  /** Image URL. */
  src: string;
  /** Element the image covers; defaults to the host. */
  box?: HTMLElement;
  /** background-position as 0–1 fractions. */
  position?: [number, number];
  /** The rect the blur grows away from. */
  core: HTMLElement;
  /** Corner radius of the core in px. */
  radius?: number;
  /** Blur radius in px at full strength. */
  blur?: number;
  /** Lens radius as a share of the host's short side. */
  lensSize?: number;
  lensSoftness?: number;
  /** Blur away from the lens, as a share of the full blur. */
  rest?: number;
  chroma?: number;
}

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/** Lays the image out like CSS cover, in host px with y down, plus the margin. */
const IMAGE = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform vec4 uRect;
uniform float uHeight;
uniform float uDpr;
uniform float uPad;
out vec4 outColor;

void main() {
  vec2 p = (vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y) - uPad) / uDpr;
  outColor = texture(uImage, clamp((p - uRect.xy) / uRect.zw, 0.0, 1.0));
}`;

const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform float uLod;
uniform vec2 uStep;
uniform vec2 uScale;
out vec4 outColor;

void main() {
  vec2 size = vec2(textureSize(uSource, int(uLod)));
  vec2 center = gl_FragCoord.xy * uScale;
  vec4 sum = textureLod(uSource, center / size, uLod) * 6.0;
  sum += textureLod(uSource, (center - uStep) / size, uLod) * 4.0;
  sum += textureLod(uSource, (center + uStep) / size, uLod) * 4.0;
  sum += textureLod(uSource, (center - 2.0 * uStep) / size, uLod);
  sum += textureLod(uSource, (center + 2.0 * uStep) / size, uLod);
  outColor = sum / 16.0;
}`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uPyramid;
uniform float uMaxLod;
uniform float uDpr;
uniform float uBlur;
uniform vec3 uLens;
uniform vec2 uLensShape;
uniform float uRest;
uniform float uChroma;
uniform vec4 uCore;
uniform float uRadius;
uniform float uReach;
uniform float uPad;
out vec4 outColor;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec4 bspline(vec2 uv, float lod) {
  vec2 size = vec2(textureSize(uPyramid, int(lod)));
  vec2 st = uv * size - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 p0 = (i - 0.5 + w1 / g0) / size;
  vec2 p1 = (i + 1.5 + w3 / g1) / size;
  vec4 a = textureLod(uPyramid, p0, lod);
  vec4 b = textureLod(uPyramid, vec2(p1.x, p0.y), lod);
  vec4 c = textureLod(uPyramid, vec2(p0.x, p1.y), lod);
  vec4 d = textureLod(uPyramid, p1, lod);
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}

vec4 blurred(vec2 uv, float sigma) {
  if (sigma <= 0.6) return textureLod(uPyramid, uv, 0.0);
  float lod = sigma < 1.7 ? (sigma - 0.6) / 1.1 : log2(sigma / 0.866);
  lod = clamp(lod, 0.0, uMaxLod);
  float base = floor(lod);
  float t = lod - base;
  vec4 a = base < 0.5 ? textureLod(uPyramid, uv, 0.0) : bspline(uv, base);
  if (t < 0.001) return a;
  return mix(a, bspline(uv, min(base + 1.0, uMaxLod)), t);
}

void main() {
  vec2 size = vec2(textureSize(uPyramid, 0));
  vec2 texel = 1.0 / size;
  vec2 uv = (gl_FragCoord.xy + uPad) * texel;
  // host px, y down
  vec2 p = vec2(gl_FragCoord.x, size.y - 2.0 * uPad - gl_FragCoord.y) / uDpr;

  // 0 at the core's edge, 1 at the host's edge
  vec2 q = p - uCore.xy;
  float d = sdRoundBox(q, uCore.zw, uRadius);
  float edge = smoothstep(0.0, 1.0, clamp(d / uReach, 0.0, 1.0));

  float lens = 1.0 - smoothstep(uLensShape.x * (1.0 - uLensShape.y), uLensShape.x, length(p - uLens.xy));
  float sigma = uBlur * uLens.z * edge * mix(uRest, 1.0, lens) * uDpr;

  // outward normal of the core, flipped into texture space (y up)
  vec2 e = vec2(0.5, 0.0);
  vec2 n = vec2(sdRoundBox(q + e.xy, uCore.zw, uRadius) - sdRoundBox(q - e.xy, uCore.zw, uRadius),
                sdRoundBox(q + e.yx, uCore.zw, uRadius) - sdRoundBox(q - e.yx, uCore.zw, uRadius));
  n = length(n) > 0.0001 ? normalize(n) : vec2(0.0);
  vec2 split = vec2(n.x, -n.y) * uChroma * 0.3 * sigma * texel;

  outColor = vec4(
    blurred(uv - split, sigma * (1.0 + uChroma * 0.25)).r,
    blurred(uv, sigma).g,
    blurred(uv + split, sigma * (1.0 - uChroma * 0.2)).b,
    1.0
  );
}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type Uniforms = Record<string, WebGLUniformLocation | null>;
type Lens = { x: number; y: number; power: number };
/** Where things sit, in host px (y down). */
type Layout = {
  /** Drawn image: x, y, width, height. */
  image: [number, number, number, number];
  /** Core: centre x, centre y, half width, half height. */
  core: [number, number, number, number];
  /** Shortest gap between the core's edge and the host's. */
  reach: number;
};

interface Look {
  radius: number;
  blur: number;
  lensSize: number;
  lensSoftness: number;
  rest: number;
  chroma: number;
}

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
};

const link = (gl: WebGL2RenderingContext, vertex: WebGLShader, source: string) => {
  const fragment = compile(gl, gl.FRAGMENT_SHADER, source);
  const program = gl.createProgram();
  if (!fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
};

const locate = (gl: WebGL2RenderingContext, program: WebGLProgram, names: string[]) => {
  const map: Uniforms = {};
  for (const name of names) map[name] = gl.getUniformLocation(program, name);
  return map;
};

function createRenderer(canvas: HTMLCanvasElement, image: TexImageSource, look: Look) {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  if (!vertex) return null;
  const imageProgram = link(gl, vertex, IMAGE);
  const blurProgram = link(gl, vertex, BLUR);
  const compositeProgram = link(gl, vertex, COMPOSITE);
  if (!imageProgram || !blurProgram || !compositeProgram) return null;

  const iu = locate(gl, imageProgram, ["uImage", "uRect", "uHeight", "uDpr", "uPad"]);
  const bu = locate(gl, blurProgram, ["uSource", "uLod", "uStep", "uScale"]);
  const cu = locate(gl, compositeProgram, [
    "uPyramid", "uMaxLod", "uDpr", "uBlur", "uLens", "uLensShape", "uRest", "uChroma",
    "uCore", "uRadius", "uReach", "uPad",
  ]);

  // One oversized triangle covers the viewport.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const framebuffer = gl.createFramebuffer();

  // Mipmapped, since the photo is usually drawn smaller than it is.
  const imageTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  /**
   * Mip chain of the drawn image, each level a separable blur of the one above.
   * temps[k] holds level k blurred horizontally only (k's width, k-1's height).
   * It reaches `pad` device px past the canvas on every side, so the blur at the
   * host's edge pulls in more photo rather than smearing the edge pixels.
   */
  const pyramid = {
    texture: null as WebGLTexture | null,
    temps: [] as (WebGLTexture | null)[],
    sizes: [] as [number, number][],
    levels: 0,
    key: "",
  };
  let dpr = 1;
  let pad = 0;

  const allocate = () => {
    if (pyramid.texture) gl.deleteTexture(pyramid.texture);
    pyramid.temps.forEach((t) => t && gl.deleteTexture(t));
    pad = Math.ceil(look.blur * 2.5 * dpr);
    const width = canvas.width + 2 * pad;
    const height = canvas.height + 2 * pad;
    pyramid.levels = Math.min(10, Math.floor(Math.log2(Math.max(width, height))) + 1);
    pyramid.sizes = [];
    for (let k = 0; k < pyramid.levels; k++) {
      pyramid.sizes.push([Math.max(1, width >> k), Math.max(1, height >> k)]);
    }
    const configure = () => {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    pyramid.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pyramid.texture);
    gl.texStorage2D(gl.TEXTURE_2D, pyramid.levels, gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    configure();
    pyramid.temps = [null];
    for (let k = 1; k < pyramid.levels; k++) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, pyramid.sizes[k][0], pyramid.sizes[k - 1][1]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      configure();
      pyramid.temps.push(texture);
    }
    pyramid.key = "";
  };

  /** Draw the image and build the blur pyramid; only when it has moved. */
  const drawImage = (rect: Layout["image"]) => {
    const key = rect.map((v) => v.toFixed(2)).join("|");
    if (key === pyramid.key) return;
    pyramid.key = key;

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pyramid.texture, 0);
    gl.viewport(0, 0, pyramid.sizes[0][0], pyramid.sizes[0][1]);
    gl.useProgram(imageProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.uniform1i(iu.uImage, 0);
    gl.uniform4f(iu.uRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform1f(iu.uHeight, pyramid.sizes[0][1]);
    gl.uniform1f(iu.uDpr, dpr);
    gl.uniform1f(iu.uPad, pad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(blurProgram);
    gl.uniform1i(bu.uSource, 0);
    for (let k = 1; k < pyramid.levels; k++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pyramid.temps[k], 0);
      gl.viewport(0, 0, pyramid.sizes[k][0], pyramid.sizes[k - 1][1]);
      gl.bindTexture(gl.TEXTURE_2D, pyramid.texture);
      gl.uniform1f(bu.uLod, k - 1);
      gl.uniform2f(bu.uStep, 1, 0);
      gl.uniform2f(bu.uScale, 2, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pyramid.texture, k);
      gl.viewport(0, 0, pyramid.sizes[k][0], pyramid.sizes[k][1]);
      gl.bindTexture(gl.TEXTURE_2D, pyramid.temps[k]);
      gl.uniform1f(bu.uLod, 0);
      gl.uniform2f(bu.uStep, 0, 1);
      gl.uniform2f(bu.uScale, 1, 2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  return {
    resize(width: number, height: number, d: number) {
      dpr = d;
      canvas.width = Math.round(width * d);
      canvas.height = Math.round(height * d);
      allocate();
    },

    render(lens: Lens, layout: Layout, width: number, height: number) {
      if (!pyramid.texture) return;
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      drawImage(layout.image);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(compositeProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pyramid.texture);
      gl.uniform1i(cu.uPyramid, 0);
      gl.uniform1f(cu.uMaxLod, pyramid.levels - 1);
      gl.uniform1f(cu.uDpr, dpr);
      gl.uniform1f(cu.uBlur, look.blur);
      gl.uniform3f(cu.uLens, lens.x, lens.y, lens.power);
      gl.uniform2f(cu.uLensShape, look.lensSize * Math.min(width, height), look.lensSoftness);
      gl.uniform1f(cu.uRest, look.rest);
      gl.uniform1f(cu.uChroma, look.chroma);
      gl.uniform4f(cu.uCore, layout.core[0], layout.core[1], layout.core[2], layout.core[3]);
      gl.uniform1f(cu.uRadius, Math.min(look.radius, layout.core[2], layout.core[3]));
      gl.uniform1f(cu.uReach, Math.max(1, layout.reach));
      gl.uniform1f(cu.uPad, pad);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    destroy() {
      if (pyramid.texture) gl.deleteTexture(pyramid.texture);
      pyramid.temps.forEach((t) => t && gl.deleteTexture(t));
      gl.deleteTexture(imageTexture);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(imageProgram);
      gl.deleteProgram(blurProgram);
      gl.deleteProgram(compositeProgram);
      gl.deleteShader(vertex);
      // Hand the context back now rather than at GC; the page runs several.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

type Renderer = NonNullable<ReturnType<typeof createRenderer>>;

export function mountShapeBlur(host: HTMLElement, options: ShapeBlurOptions) {
  const look: Look = {
    radius: Math.max(0, options.radius ?? 0),
    blur: Math.max(0, options.blur ?? 16),
    lensSize: clamp(options.lensSize ?? 0.3, 0.02, 2),
    lensSoftness: clamp(options.lensSoftness ?? 0.7, 0, 1),
    rest: clamp(options.rest ?? 0.5, 0, 1),
    chroma: clamp(options.chroma ?? 0.3, 0, 1),
  };
  const box = options.box ?? host;
  const [posX, posY] = options.position ?? [0.5, 0.5];

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none";
  host.append(canvas);

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = { x: 0, y: 0, active: false };
  const lens: Lens = { x: 0, y: 0, power: 0 };
  /** undefined until the image has loaded; null if WebGL2 isn't available. */
  let renderer: Renderer | null | undefined;
  let image: HTMLImageElement | null = null;
  let raf = 0;
  let last = 0;
  let width = 1;
  let height = 1;

  const size = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer?.resize(width, height, Math.min(devicePixelRatio || 1, 2));
  };

  /** Measured every frame: the box drifts with the parallax. */
  const measure = (): Layout => {
    const h = host.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const c = options.core.getBoundingClientRect();
    // getBoundingClientRect includes any scale on an ancestor; undo it.
    const s = h.width / width || 1;
    const bw = b.width / s;
    const bh = b.height / s;
    const fit = Math.max(bw / image!.naturalWidth, bh / image!.naturalHeight);
    const iw = image!.naturalWidth * fit;
    const ih = image!.naturalHeight * fit;
    const cx = (c.left - h.left) / s;
    const cy = (c.top - h.top) / s;
    const cw = c.width / s;
    const ch = c.height / s;
    return {
      image: [(b.left - h.left) / s + (bw - iw) * posX, (b.top - h.top) / s + (bh - ih) * posY, iw, ih],
      core: [cx + cw / 2, cy + ch / 2, cw / 2, ch / 2],
      reach: Math.min(cx, cy, width - cx - cw, height - cy - ch),
    };
  };

  const frame = (now: number) => {
    raf = 0;
    if (!renderer) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const target = pointer.active ? 1 : 0;
    const follow = reduce ? 1 : 1 - Math.exp(-dt * 10);
    lens.x += (pointer.x - lens.x) * follow;
    lens.y += (pointer.y - lens.y) * follow;
    lens.power += (target - lens.power) * (reduce ? 1 : 1 - Math.exp(-dt * 4));
    renderer.render(lens, measure(), width, height);

    const settled =
      Math.abs(pointer.x - lens.x) < 0.1 && Math.abs(pointer.y - lens.y) < 0.1 && Math.abs(target - lens.power) < 0.002;
    if (settled) last = 0;
    else raf = requestAnimationFrame(frame);
  };

  const wake = () => {
    if (!raf && renderer) raf = requestAnimationFrame(frame);
  };

  const start = () => {
    image = new Image();
    image.decoding = "async";
    image.onload = async () => {
      if (!image) return;
      // Decode off the main thread first: uploading the <img> itself decodes it
      // synchronously (~25ms), a hitch whenever the cursor lands on a photo mid-scroll.
      const bitmap = await createImageBitmap(image).catch(() => null);
      if (!image) return bitmap?.close();
      renderer = createRenderer(canvas, bitmap ?? image, look);
      bitmap?.close();
      size();
      wake();
    };
    image.src = options.src;
  };

  const onMove = (event: PointerEvent) => {
    if (!image) start();
    const rect = host.getBoundingClientRect();
    const s = rect.width / width || 1;
    pointer.x = (event.clientX - rect.left) / s;
    pointer.y = (event.clientY - rect.top) / s;
    if (!pointer.active) {
      pointer.active = true;
      // Arriving fresh: start the lens under the pointer instead of sliding in.
      if (lens.power < 0.01) {
        lens.x = pointer.x;
        lens.y = pointer.y;
      }
    }
    wake();
  };

  const onLeave = () => {
    pointer.active = false;
    wake();
  };

  // Keep the image in step with the parallax while the blur is showing.
  const onScroll = () => {
    if (pointer.active || lens.power > 0.002) wake();
  };

  // A resize clears the canvas, so redraw straight away.
  const resizeObserver = new ResizeObserver(() => {
    if (!renderer) return;
    size();
    renderer.render(lens, measure(), width, height);
  });
  resizeObserver.observe(host);
  host.addEventListener("pointerenter", onMove);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  addEventListener("scroll", onScroll, { passive: true });

  return () => {
    cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    host.removeEventListener("pointerenter", onMove);
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerleave", onLeave);
    removeEventListener("scroll", onScroll);
    if (image) image.onload = null;
    image = null;
    renderer?.destroy();
    canvas.remove();
  };
}
