/**
 * Receives the Book a demo form and posts it to Slack.
 *
 * Runs on the server (not prerendered) so SLACK_WEBHOOK_URL never reaches the
 * browser. Spam guards: a honeypot field bots fill in, a minimum fill time,
 * and strict validation/length caps on every field.
 */
import type { APIRoute } from "astro";
import { COUNTRY_NAMES } from "@/lib/countries";

export const prerender = false;

const LIMITS = {
  firstName: 80,
  lastName: 80,
  email: 200,
  company: 160,
  role: 160,
  size: 40,
  country: 80,
  outcome: 2000,
} as const;
type Field = keyof typeof LIMITS;
const REQUIRED: Field[] = ["firstName", "lastName", "email", "company", "role", "size", "country"];
const SIZES = new Set(["1–200", "201–500", "501–1K", "1K–5K", "5K–10K", "10K+"]);
/** Humans take longer than this to fill the form; bots usually don't. */
const MIN_FILL_MS = 2500;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Slack mrkdwn treats &, <, > specially; escape user input so it can't inject links or mentions. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const POST: APIRoute = async ({ request }) => {
  const webhook = import.meta.env.SLACK_WEBHOOK_URL ?? process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return json(500, { ok: false, error: "not_configured" });

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  // Honeypot filled or submitted too fast: pretend success, send nothing.
  const startedAt = Number(raw.startedAt);
  if (String(raw.website ?? "").trim() || !startedAt || Date.now() - startedAt < MIN_FILL_MS) {
    return json(200, { ok: true });
  }

  const data = {} as Record<Field, string>;
  for (const key of Object.keys(LIMITS) as Field[]) {
    const value = typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
    if (value.length > LIMITS[key]) return json(400, { ok: false, error: "too_long", field: key });
    data[key] = value;
  }
  const missing = REQUIRED.filter((k) => !data[k]);
  if (missing.length) return json(400, { ok: false, error: "missing", fields: missing });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return json(400, { ok: false, error: "bad_email" });
  if (!SIZES.has(data.size)) return json(400, { ok: false, error: "bad_size" });
  if (!COUNTRY_NAMES.has(data.country)) return json(400, { ok: false, error: "bad_country" });
  const optIn = raw.optIn === true;

  const name = `${data.firstName} ${data.lastName}`;
  const message = {
    text: `New demo request: ${name}, ${data.role} at ${data.company}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "New demo request" } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Name*\n${esc(name)}` },
          { type: "mrkdwn", text: `*Email*\n<mailto:${encodeURIComponent(data.email).replace(/%40/g, "@")}|${esc(data.email)}>` },
          { type: "mrkdwn", text: `*Company*\n${esc(data.company)}` },
          { type: "mrkdwn", text: `*Job title*\n${esc(data.role)}` },
          { type: "mrkdwn", text: `*Company size*\n${esc(data.size)}` },
          { type: "mrkdwn", text: `*Country*\n${esc(data.country)}` },
        ],
      },
      ...(data.outcome
        ? [{ type: "section", text: { type: "mrkdwn", text: `*What their first outcome machine should own*\n>${esc(data.outcome).replace(/\n/g, "\n>")}` } }]
        : []),
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Updates opt-in: ${optIn ? "yes" : "no"} · via Book a demo form` }],
      },
    ],
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!res.ok) {
      console.error("[demo-request] Slack responded", res.status, await res.text());
      return json(502, { ok: false, error: "slack_failed" });
    }
  } catch (err) {
    console.error("[demo-request] Slack request failed", err);
    return json(502, { ok: false, error: "slack_unreachable" });
  }

  return json(200, { ok: true });
};
