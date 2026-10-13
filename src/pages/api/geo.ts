/**
 * Returns the visitor's country from the IP-geolocation header the host adds
 * (Vercel, Cloudflare, Netlify, CloudFront). Returns null when no host header
 * is present (e.g. local dev); the form then keeps its time-zone guess.
 */
import type { APIRoute } from "astro";

export const prerender = false;

function fromNetlify(header: string | null): string | null {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"))?.country?.code ?? null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = ({ request }) => {
  const h = request.headers;
  const raw =
    h.get("x-vercel-ip-country") ??
    h.get("cf-ipcountry") ??
    h.get("cloudfront-viewer-country") ??
    fromNetlify(h.get("x-nf-geo"));
  // Cloudflare uses XX (unknown) and T1 (Tor).
  const country = raw && /^[A-Z]{2}$/.test(raw) && raw !== "XX" && raw !== "T1" ? raw : null;
  return new Response(JSON.stringify({ country }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
};
