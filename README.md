# Infinity — landing page

Company-brain landing page. Forest green ground, cream type, soft lime accent, liquid glass infinity loop.
Astro 7, static `.astro` components plus small scripts.

```bash
npm install
npm run dev       # http://localhost:4321
npm run build
```

## Where things live

- `src/content/site.ts`: all copy. `*text*` in a title renders with the green gradient.
- `src/styles/global.css`: tokens, dark `.glass` + `.glass--rim`, buttons, chips, reveal animation.
- `src/scripts/infinity-gl.ts` + `src/components/InfinityGL.astro` + `src/lib/infinity.ts`: the WebGL2
  infinity loop from infinity-variant-a (liquid glass tube + light particles that scatter from the cursor),
  recolored to a sunrise palette in `PALETTE` (gold → pale gold → hint of green → cream), with clear-glass
  body, golden rim, light pulses and streaks riding the current, sparks breaking off the surface, and star flares. The SVG in the hero is the
  fallback without WebGL2.
- `src/components/FluidGlass.tsx`: earlier hero (particle brain under a React Bits–style glass lens). Not used
  right now; delete it and the React/three deps if it stays that way.
- `public/hero-sunrise.jpg` (+ `-sm` for phones): placeholder hero photo (Unsplash). Replace both files to swap
  the background; `.shade` in `Hero.astro` darkens the middle so the copy stays readable.
- `src/components/Hero.astro`: split headline (left block + lower-right tail with body copy), CTA pill, scroll cue.
- `src/components/Nav.astro`: top bar (logo + glass CTA pill) and the floating bottom dock.

Avoid `backdrop-filter` on elements directly over the canvas: Chrome tiles it with seams.
