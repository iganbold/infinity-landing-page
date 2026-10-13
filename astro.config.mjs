// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: process.env.SITE_URL || "https://brain.example.com",
  integrations: [react()],
  // Pages stay static; only routes with `prerender = false` (the demo-request
  // and geo APIs) run as Vercel functions.
  adapter: vercel(),
});
