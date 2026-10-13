/**
 * Particle brain under a liquid glass lens, after React Bits' FluidGlass
 * (https://reactbits.dev/components/fluid-glass).
 *
 * The scene (green light-shaft backdrop, a point-cloud brain shedding dust,
 * floating motes) renders into an FBO each frame. A full-viewport plane shows
 * that texture and a glass puck refracts the same texture with
 * MeshTransmissionMaterial, so the glass bends what's behind it without a
 * second render pass. Lens and brain both react to the pointer over the host;
 * without one (touch, idle) the lens drifts around the brain.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, createPortal, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshTransmissionMaterial, useFBO } from "@react-three/drei";
import { easing } from "maath";

type Pointer = { x: number; y: number; active: boolean };
type PointerRef = MutableRefObject<Pointer>;

const BG = "#020904";

/* ------------------------------------------------------------ helpers */

/** Seeded PRNG so the brain looks the same on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Smooth 3D value noise in [0, 1]. */
function makeNoise(seed: number) {
  const rand = rng(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rand();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const v = (x: number, y: number, z: number) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const s = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = s(x - xi), w = s(y - yi), q = s(z - zi);
    return lerp(
      lerp(lerp(v(xi, yi, zi), v(xi + 1, yi, zi), u), lerp(v(xi, yi + 1, zi), v(xi + 1, yi + 1, zi), u), w),
      lerp(lerp(v(xi, yi, zi + 1), v(xi + 1, yi, zi + 1), u), lerp(v(xi, yi + 1, zi + 1), v(xi + 1, yi + 1, zi + 1), u), w),
      q,
    );
  };
}

/** A puck-shaped lens: superellipse profile spun around Y, soft rounded rim. */
function lensGeometry(h = 0.36, n = 3, seg = 64) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI - (i / seg) * Math.PI;
    const s = Math.sin(a);
    const c = Math.cos(a);
    pts.push(new THREE.Vector2(Math.pow(Math.abs(s), 2 / n), h * Math.sign(c) * Math.pow(Math.abs(c), 2 / n)));
  }
  const g = new THREE.LatheGeometry(pts, 128);
  g.computeVertexNormals();
  return g;
}

/**
 * Samples a brain surface: two hemispheres with a flat medial face and a
 * fissure between them, folded with ridged noise (the gyri), plus a striated
 * cerebellum. Returns positions, normals, and a fold value (0 = deep sulcus).
 */
function sampleBrain(count: number) {
  const rand = rng(11);
  const noise = makeNoise(3);
  const ridged = (x: number, y: number, z: number) => {
    let f = 0;
    let amp = 0.6;
    let fr = 4.6;
    for (let o = 0; o < 3; o++) {
      f += amp * (1 - Math.abs(noise(x * fr, y * fr, z * fr) * 2 - 1));
      amp *= 0.45;
      fr *= 2.1;
    }
    return f / 0.99;
  };

  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const fold = new Float32Array(count);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const R = new THREE.Vector3(0.56, 0.68, 1);

  for (let i = 0; i < count; i++) {
    // Uniform direction on the sphere.
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const d = new THREE.Vector3(r * Math.cos(th), u, r * Math.sin(th));
    let f: number;

    if (rand() < 0.86) {
      const hemi = rand() < 0.5 ? -1 : 1;
      if (d.x * hemi < 0) d.x *= 0.22; // flatten the medial face
      p.set(d.x * R.x, d.y * R.y, d.z * R.z);
      if (p.y < -0.25) p.y = -0.25 + (p.y + 0.25) * 0.45; // flatter underside
      p.z *= 1 - Math.max(0, -p.y) * 0.25;
      n.set(p.x / (R.x * R.x), p.y / (R.y * R.y), p.z / (R.z * R.z)).normalize();
      p.x += hemi * 0.115;
      f = ridged(p.x + hemi * 4, p.y, p.z);
      p.addScaledVector(n, (f - 0.55) * 0.17);
    } else {
      p.set(d.x * 0.62, d.y * 0.3, d.z * 0.42);
      n.set(p.x / 0.38, p.y / 0.09, p.z / 0.18).normalize();
      p.add(new THREE.Vector3(0, -0.5, -0.62));
      f = 0.5 + 0.5 * Math.sin(p.y * 70 + noise(p.x * 4, p.y * 4, p.z * 4) * 3);
      p.addScaledVector(n, (f - 0.5) * 0.03);
    }
    // A little depth so the surface reads as a crust of particles, not a skin.
    p.addScaledVector(n, -Math.pow(rand(), 3) * 0.06);

    pos.set([p.x, p.y, p.z], i * 3);
    nor.set([n.x, n.y, n.z], i * 3);
    fold[i] = f;
  }
  return { pos, nor, fold };
}

/* ------------------------------------------------------------ backdrop */

/** Deep green room lit by a soft shaft from above. */
function Backdrop({ w, h }: { w: number; h: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: { uAspect: { value: w / h } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uAspect;
          varying vec2 vUv;
          void main() {
            vec2 uv = vUv;
            vec2 c = (uv - vec2(0.54, 0.5)) * vec2(uAspect, 1.0);
            float room = exp(-dot(c, c) * 1.6);
            float beam = exp(-pow((uv.x - 0.5) * uAspect / 0.38, 2.0)) * pow(uv.y, 3.0);
            float vig = pow(smoothstep(1.0, 0.15, length((uv - 0.5) * vec2(1.15, 1.0))), 1.6);
            vec3 col = vec3(0.001, 0.006, 0.002);
            col += vec3(0.004, 0.045, 0.011) * room;
            col += vec3(0.014, 0.08, 0.024) * beam;
            gl_FragColor = vec4(col * vig, 1.0);
          }
        `,
      }),
    [w, h],
  );
  return (
    <mesh position={[0, 0, -3]} scale={[w * 1.4, h * 1.4, 1]} material={material}>
      <planeGeometry />
    </mesh>
  );
}

/* ------------------------------------------------------------ brain */

function Brain({ pointer, motion, count }: { pointer: PointerRef; motion: boolean; count: number }) {
  const group = useRef<THREE.Group>(null!);
  const { viewport } = useThree();
  const { width: w, height: h, dpr } = viewport;
  const portrait = w / h < 0.9;
  const scale = portrait ? w * 0.36 : Math.min(w * 0.22, h * 0.33);
  const center: [number, number, number] = portrait ? [0, h * 0.06, 0] : [w * 0.04, h * 0.02, 0];

  const brain = useMemo(() => sampleBrain(count), [count]);
  const dust = useMemo(() => {
    const rand = rng(5);
    const N = Math.round(count * 0.07);
    const pos = new Float32Array(N * 3);
    const dir = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const k = Math.floor(rand() * count);
      pos.set(brain.pos.subarray(k * 3, k * 3 + 3), i * 3);
      dir.set(brain.nor.subarray(k * 3, k * 3 + 3), i * 3);
      seed[i] = rand();
    }
    return { pos, dir, seed };
  }, [brain, count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPx: { value: dpr },
      uPointer: { value: new THREE.Vector2(99, 99) },
      uPointerOn: { value: 0 },
    }),
    [dpr],
  );

  const brainMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          attribute vec3 aNormal;
          attribute float aFold;
          attribute float aRand;
          uniform float uTime;
          uniform float uPx;
          uniform vec2 uPointer;
          uniform float uPointerOn;
          varying vec3 vColor;
          void main() {
            vec3 p = position + aNormal * sin(uTime * 0.9 + aRand * 6.2831) * 0.004;
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vec3 n = normalize(mat3(modelMatrix) * aNormal);

            // Particles part around the pointer.
            vec2 d = wp.xy - uPointer;
            float f = smoothstep(0.6, 0.0, length(d)) * uPointerOn;
            wp.xy += normalize(d + 1e-4) * f * 0.16;
            wp.z += f * 0.2;

            vec3 L = normalize(vec3(-0.35, 0.85, 0.55));
            float lam = max(dot(n, L), 0.0);
            float rim = pow(1.0 - abs(n.z), 3.0);
            float ridge = smoothstep(0.35, 0.85, aFold);
            vec3 deep = vec3(0.001, 0.012, 0.004);
            vec3 mid = vec3(0.016, 0.15, 0.04);
            vec3 hi = vec3(0.3, 1.0, 0.4);
            vec3 c = mix(deep, mid, lam * (0.15 + 0.85 * ridge));
            c += hi * pow(lam, 5.0) * ridge * 0.55;
            c += vec3(0.05, 0.45, 0.12) * rim * 0.4;
            c *= 0.65 + aRand * 0.6;
            vColor = c + hi * f * 0.5;

            gl_Position = projectionMatrix * viewMatrix * wp;
            gl_PointSize = (1.6 + aRand * 1.6) * uPx;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          void main() {
            if (length(gl_PointCoord - 0.5) > 0.5) discard;
            gl_FragColor = vec4(vColor, 1.0);
          }
        `,
      }),
    [uniforms],
  );

  const dustMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute vec3 aDir;
          attribute float aSeed;
          uniform float uTime;
          uniform float uPx;
          varying float vA;
          void main() {
            float t = fract(uTime * (0.03 + aSeed * 0.05) + aSeed * 7.0);
            vec3 p = position + aDir * t * (0.15 + aSeed * 0.35);
            vec4 wp = modelMatrix * vec4(p, 1.0);
            // Wind carries shed particles off to the right and up.
            wp.xyz += vec3(1.0, 0.45, 0.2) * t * t * (0.6 + aSeed * 1.4);
            wp.xyz += sin(vec3(t * 9.0 + aSeed * 40.0, t * 7.0 + aSeed * 23.0, t * 5.0)) * 0.04 * t;
            vA = smoothstep(0.0, 0.08, t) * (1.0 - t);
            gl_Position = projectionMatrix * viewMatrix * wp;
            gl_PointSize = (1.4 + aSeed * 2.6) * uPx;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * vA;
            gl_FragColor = vec4(vec3(0.25, 1.0, 0.42) * a, a);
          }
        `,
      }),
    [uniforms],
  );

  const brainGeo = useMemo(() => {
    const rand = rng(9);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(brain.pos, 3));
    g.setAttribute("aNormal", new THREE.BufferAttribute(brain.nor, 3));
    g.setAttribute("aFold", new THREE.BufferAttribute(brain.fold, 1));
    g.setAttribute("aRand", new THREE.BufferAttribute(Float32Array.from({ length: count }, rand), 1));
    return g;
  }, [brain, count]);

  const dustGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(dust.pos, 3));
    g.setAttribute("aDir", new THREE.BufferAttribute(dust.dir, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(dust.seed, 1));
    return g;
  }, [dust]);

  const target = useRef(new THREE.Vector2(99, 99));

  useFrame(({ clock }, delta) => {
    const t = motion ? clock.elapsedTime : 0;
    const p = pointer.current;
    uniforms.uTime.value = t;

    // Slow turn, nudged toward the pointer.
    const px = p.active ? p.x : 0;
    const py = p.active ? p.y : 0;
    easing.damp(group.current.rotation, "y", -1.05 + Math.sin(t * 0.12) * 0.4 + px * 0.35, 0.8, delta);
    easing.damp(group.current.rotation, "x", 0.22 - py * 0.2, 0.8, delta);
    group.current.rotation.z = -0.08;

    if (p.active) target.current.set((p.x * w) / 2, (p.y * h) / 2);
    easing.damp2(uniforms.uPointer.value, target.current, 0.12, delta);
    easing.damp(uniforms.uPointerOn, "value", p.active ? 1 : 0, 0.3, delta);
  });

  return (
    <group ref={group} position={center} scale={scale}>
      <points geometry={brainGeo} material={brainMat} frustumCulled={false} />
      <points geometry={dustGeo} material={dustMat} frustumCulled={false} />
    </group>
  );
}

/** Specks of light hanging in the shaft, drifting upward. */
function Motes({ w, h, motion }: { w: number; h: number; motion: boolean }) {
  const { viewport } = useThree();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uPx: { value: viewport.dpr }, uH: { value: h } },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          uniform float uPx;
          uniform float uH;
          varying float vA;
          void main() {
            vec3 p = position;
            p.y = mod(p.y + uTime * (0.03 + aSeed * 0.05) + uH, uH * 1.2) - uH * 0.6;
            p.x += sin(uTime * 0.3 + aSeed * 30.0) * 0.05;
            vA = (0.25 + 0.75 * aSeed) * (0.6 + 0.4 * sin(uTime * 1.5 + aSeed * 50.0));
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.0 + aSeed * 2.2) * uPx;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * 0.7;
            gl_FragColor = vec4(vec3(0.35, 1.0, 0.5) * a, a);
          }
        `,
      }),
    [h, viewport.dpr],
  );
  const geometry = useMemo(() => {
    const rand = rng(21);
    const N = 260;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos.set([(rand() - 0.5) * w * 1.1, (rand() - 0.5) * h * 1.2, (rand() - 0.5) * 2], i * 3);
      seed[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [w, h]);
  useFrame(({ clock }) => {
    if (motion) material.uniforms.uTime.value = clock.elapsedTime;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function Scene({ pointer, motion, count }: { pointer: PointerRef; motion: boolean; count: number }) {
  const { viewport } = useThree();
  const { width: w, height: h } = viewport;
  return (
    <>
      <color attach="background" args={[BG]} />
      <Backdrop w={w} h={h} />
      <Motes w={w} h={h} motion={motion} />
      <Brain pointer={pointer} motion={motion} count={count} />
    </>
  );
}

/* ------------------------------------------------------------ the lens */

function Lens({ pointer, motion, count }: { pointer: PointerRef; motion: boolean; count: number }) {
  const group = useRef<THREE.Group>(null!);
  const mesh = useRef<THREE.Mesh>(null!);
  const buffer = useFBO();
  const { viewport: vp } = useThree();
  const [scene] = useState(() => new THREE.Scene());
  const geometry = useMemo(() => lensGeometry(), []);
  const idle = useRef(0);
  const prev = useRef(new THREE.Vector2());
  const stretch = useRef(0);

  useFrame((state, delta) => {
    const { gl, camera, size } = state;
    const v = state.viewport.getCurrentViewport(camera, [0, 0, 15]);
    const p = pointer.current;

    if (motion) idle.current += delta;
    const t = idle.current;
    // Off-pointer: a slow loop across the face of the brain.
    const tx = p.active ? p.x : 0.08 + Math.sin(t * 0.3) * 0.3;
    const ty = p.active ? p.y : 0.04 + Math.sin(t * 0.6 + 1) * 0.2;
    easing.damp3(group.current.position, [(tx * v.width) / 2, (ty * v.height) / 2, 15], p.active ? 0.14 : 0.6, delta);

    // Squash and stretch along the direction of travel: the "liquid" part.
    const pos = group.current.position;
    const dx = pos.x - prev.current.x;
    const dy = pos.y - prev.current.y;
    prev.current.set(pos.x, pos.y);
    const speed = Math.hypot(dx, dy) / Math.max(delta, 1e-3) / v.height;
    easing.damp(stretch, "current", clamp(speed * 0.12, 0, 0.22), 0.12, delta);
    if (speed > 0.02) group.current.rotation.z = Math.atan2(dy, dx);
    group.current.scale.set(1 + stretch.current, 1 - stretch.current * 0.6, 1);

    const diameterPx = clamp(size.width * 0.13, 120, 210);
    mesh.current.scale.setScalar(((diameterPx / size.height) * v.height) / 2);

    gl.setRenderTarget(buffer);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
  });

  return (
    <>
      {createPortal(<Scene pointer={pointer} motion={motion} count={count} />, scene)}
      <mesh scale={[vp.width, vp.height, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={buffer.texture} toneMapped={false} />
      </mesh>
      <group ref={group} position={[0, 0, 15]}>
        <mesh ref={mesh} rotation-x={Math.PI / 2} geometry={geometry}>
          <MeshTransmissionMaterial
            buffer={buffer.texture}
            ior={1.25}
            thickness={3}
            transmission={1}
            roughness={0}
            anisotropy={0.01}
            chromaticAberration={0.1}
            distortion={0.04}
            distortionScale={0.4}
            temporalDistortion={motion ? 0.08 : 0}
            color="#ffffff"
          />
        </mesh>
      </group>
      <Environment resolution={256} frames={1}>
        <Lightformer form="ring" intensity={3} color="#ffffff" position={[0, 6, -2]} scale={6} />
        <Lightformer form="rect" intensity={2} color="#ffffff" position={[-6, 1, 4]} rotation-y={Math.PI / 2} scale={[10, 1, 1]} />
        <Lightformer form="rect" intensity={2.5} color="#3dff8f" position={[6, -1, 4]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} />
        <Lightformer form="circle" intensity={1.5} color="#b6ff5c" position={[0, -6, 2]} scale={4} />
      </Environment>
    </>
  );
}

/* ------------------------------------------------------------ root */

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function FluidGlass({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const pointer = useRef<Pointer>({ x: 0, y: 0, active: false });
  const [supported] = useState(hasWebGL);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [motion] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [count] = useState(() => (window.innerWidth < 720 ? 32000 : 75000));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      pointer.current.active = inside;
      if (inside) {
        pointer.current.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.current.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") pointer.current.active = false;
    };
    const onLeave = () => (pointer.current.active = false);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      io.disconnect();
    };
  }, []);

  if (!supported) return null;

  return (
    <div
      ref={host}
      className={className}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, opacity: ready ? 1 : 0, transition: "opacity 1.4s cubic-bezier(.22,1,.36,1)" }}
    >
      <Canvas
        camera={{ position: [0, 0, 20], fov: 15 }}
        dpr={[1, 1.75]}
        flat
        frameloop={visible ? "always" : "never"}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(BG, 1);
          requestAnimationFrame(() => setReady(true));
        }}
        style={{ pointerEvents: "none" }}
      >
        <Lens pointer={pointer} motion={motion} count={count} />
      </Canvas>
    </div>
  );
}
