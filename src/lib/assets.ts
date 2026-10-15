/**
 * Images and fonts, imported so the build gives them content-hashed names under
 * /_astro/. Vercel serves /_astro/ with a year-long immutable cache, so repeat
 * visits never refetch them, and a changed file gets a new name on its own.
 */
import heroImage from "@/assets/infinity-background.png";
import forestFloorWebp from "@/assets/primitives/01-forest-floor.webp";
import forestFloorJpg from "@/assets/primitives/01-forest-floor.jpg";
import woodlandWebp from "@/assets/primitives/02-woodland.webp";
import woodlandJpg from "@/assets/primitives/02-woodland.jpg";
import vistaWebp from "@/assets/primitives/03-vista.webp";
import vistaJpg from "@/assets/primitives/03-vista.jpg";
import panoramaWebp from "@/assets/primitives/04-panorama.webp";
import panoramaJpg from "@/assets/primitives/04-panorama.jpg";
// The same files global.css loads through @fontsource, so the preload and the
// @font-face share one URL.
import figtreeFont from "@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2?url";

/** The sunrise photo behind the hero (and the 404). */
export const hero = heroImage.src;

/** The forest backdrops, WebP first with a JPEG fallback. */
export const backdrops = {
  "01-forest-floor": { webp: forestFloorWebp.src, jpg: forestFloorJpg.src },
  "02-woodland": { webp: woodlandWebp.src, jpg: woodlandJpg.src },
  "03-vista": { webp: vistaWebp.src, jpg: vistaJpg.src },
  "04-panorama": { webp: panoramaWebp.src, jpg: panoramaJpg.src },
};
export type Backdrop = keyof typeof backdrops;

/** A backdrop as a CSS background, WebP where supported. */
export const backdropStyle = (name: Backdrop) =>
  `background-image: image-set(url(${backdrops[name].webp}) type("image/webp"), url(${backdrops[name].jpg}) type("image/jpeg"))`;

/** Fonts the first screen sets in, worth fetching before the CSS asks. */
export const fonts = [figtreeFont];
