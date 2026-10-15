// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";

export default defineConfig({
  // The live domain, for absolute URLs (share images, canonical links). Set
  // SITE_URL; on Vercel it falls back to the project's production domain.
  site:
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://brain.example.com"),
  integrations: [react()],
  // The demo page used to live at /book-a-demo; keep old links working.
  redirects: { "/book-a-demo": "/request-demo" },
  // Pages stay static; only routes with `prerender = false` (the demo-request
  // and geo APIs) run as Vercel functions.
  adapter: vercel(),
});
