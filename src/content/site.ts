/**
 * Page copy. Components read from here so copy edits never touch layout code.
 * `*text*` inside a title renders with the green gradient emphasis.
 */

export const site = {
  name: "Infinity",
  tagline: "Applied Super Intelligence Lab",
  description:
    "Goal turns everything your company knows into one living brain that every person and every AI agent can think with, safely.",
  nav: [
    { label: "Home", href: "/" },
    { label: "Product", href: "/#product", more: true },
    { label: "Security", href: "/#security" },
    { label: "Customers", href: "/#customers" },
  ],
  cta: { label: "Book a demo", href: "/book-a-demo" },
} as const;

export const hero = {
  title: "AI Systems that\nown outcomes.",
  subtitle:
    "Invest in strong fundamentals and invisible supports that make outcomes flow like water. Systems bring that foundation to life as durable agents for your organization, working alongside you with the context and tools to carry each outcome forward.",
  cta: { label: "Book a demo", href: "/book-a-demo" },
  scroll: "Scroll to explore",
} as const;

export const whoWeAre = {
  /** `*text*` renders as the brand highlight. */
  title: "We are an *Applied Super Intelligence Lab*, building agents that take ongoing responsibility for business outcomes.",
  cta: { label: "Book a demo", href: "/book-a-demo" },
  /** The progression the section argues for; the last one is the product. */
  compare: [
    { name: "Chatbots", title: "Answer questions", body: "You provide the prompt." },
    { name: "Agents", title: "Complete tasks", body: "You delegate the work." },
    { name: "Systems", title: "Own outcomes", body: "You define success and guardrails." },
  ],
} as const;

export const howItWorks = {
  title: "Give a System responsibility.",
  steps: [
    {
      title: "Set the outcome.",
      body: "Define what you want to achieve, how you’ll measure success, and the boundaries of the System’s role.",
      visual: "Outcome and responsibility",
    },
    {
      title: "Bring it into your company.",
      body: "Connect the information and tools the work depends on. Give the System context about your team and how the work gets done.",
      visual: "Company context and tools",
    },
    {
      title: "Work alongside it.",
      body: "Delegate, review progress, and give direction as the System works toward the outcome.",
      visual: "Team collaboration",
    },
  ],
  closing: {
    title: "An ongoing teammate for your organization.",
    body: "The work can continue across conversations, with your team involved along the way.",
    cta: { label: "Book a demo", href: "/book-a-demo" },
  },
} as const;

export const footer = {
  title: "Put a System to work\non your next outcome.",
  body: "Tell us what you want to achieve. We'll show you how a System takes it on.",
  demo: { label: "Book a demo", href: "/book-a-demo" },
  /** Replace with the real inbox. */
  contact: { label: "Contact us", href: "mailto:hello@example.com" },
  links: [
    { label: "Who we are", href: "#who-we-are" },
    { label: "How it works", href: "#how-it-works" },
  ],
  legal: "All rights reserved.",
} as const;

export const bookDemo = {
  title: "Let's put a System\nto work.",
  body: "Tell us a little about your team. We'll reach out to set up a walkthrough.",
  fields: {
    firstName: "First name",
    lastName: "Last name",
    email: "Work email",
    company: "Company",
    role: "Job title",
    size: "Company size",
    sizePlaceholder: "Select a size",
    sizes: ["1–200", "201–500", "501–1K", "1K–5K", "5K–10K", "10K+"],
    country: "Country",
    countryPlaceholder: "Select a country",
    outcome: "What outcome would you hand to a System?",
    outcomeHint: "For example: keep our support backlog under 24 hours.",
    optional: "Optional",
  },
  optIn: "Send me occasional updates. Unsubscribe anytime.",
  privacy: { label: "How we use your info:", link: "Privacy Policy", href: "/privacy" },
  submit: "Request a demo",
  sent: { title: "Thanks, we got it.", body: "Our team will reach out soon to set up a time." },
  error: "Something went wrong. Please try again, or email us instead.",
  back: "Back to home",
} as const;
