/**
 * Page copy. Components read from here so copy edits never touch layout code.
 * `*text*` inside a title renders with the green gradient emphasis.
 */

export const site = {
  name: "Infinity",
  tagline: "Outcome Machines for Organizations",
  description:
    "Goal turns everything your company knows into one living brain that every person and every AI agent can think with, safely.",
  nav: [
    { label: "Home", href: "/" },
    { label: "Product", href: "/#product", more: true },
    { label: "Security", href: "/#security" },
    { label: "Customers", href: "/#customers" },
  ],
  cta: { label: "Book a demo", href: "/request-demo" },
} as const;

export const hero = {
  title: "Build outcome\nmachines.",
  subtitle:
    "Outcome machines are durable agents built on your organization’s knowledge, tools, memory, and guardrails. They grow stronger with every run, until outcomes flow like water.",
  cta: { label: "Request a demo", href: "/request-demo" },
  scroll: "Scroll to explore",
} as const;

export const whoWeAre = {
  /** `*text*` renders as the brand highlight. */
  title: "We are an *Applied Super Intelligence Lab*, focused on building the foundations that make outcomes flow.",
  cta: { label: "Request a demo", href: "/request-demo" },
  /** The progression the section argues for; the last one is the product. */
  compare: [
    { name: "Chatbots", title: "Answer questions", body: "You ask each question.", span: "One reply", level: 1 },
    { name: "Agents", title: "Complete tasks", body: "You delegate each task.", span: "One task", level: 2 },
    { name: "Outcome Machines", title: "Own outcomes", body: "You define success and guardrails.", span: "Ongoing", level: 3 },
  ],
  /** Row labels for the comparison, one per field above. */
  compareRows: { title: "What it does", body: "Your part", span: "How long it works", level: "Responsibility" },
} as const;

export const howItWorks = {
  title: "How an outcome machine works.",
  steps: [
    {
      title: "Set the outcome.",
      body: "Define what you want to achieve, how you’ll measure success, and the boundaries of its role.",
      visual: "Outcome and responsibility",
    },
    {
      title: "Bring it into your company.",
      body: "Teach it what your team knows and connect the tools they use. The setup your most AI-forward people built for themselves becomes part of how the whole organization works.",
      visual: "Company context and tools",
    },
    {
      title: "Work alongside it.",
      body: "Hand it the work the way you would to a trusted colleague. Check in on progress, give direction when it matters, and let it ask when it's unsure. It works beside your team, not instead of it.",
      visual: "Team collaboration",
    },
    {
      title: "Learning compounds with every outcome.",
      body: "Every outcome captures what worked, what didn’t, and why. Instead of disappearing in individual chat histories, that learning becomes organizational infrastructure. Every outcome that follows starts from what your company has already learned.",
      visual: "Knowledge that compounds",
    },
  ],
  closing: {
    title: "An ongoing teammate for your organization.",
    body: "The work can continue across conversations, with your team involved along the way.",
    cta: { label: "Book a demo", href: "/request-demo" },
  },
} as const;

export const harness = {
  title: "The Organizational Harness.",
  intro:
    "A System can only own outcomes if you trust it with real access. The harness decides what each one can see, touch and spend, and checks it on every call.",
  /**
   * One tile each, in reading order. `size` sets the tile's span in the grid:
   * big 2×2, wide 2×1, tall 1×2, small 1×1. The tile shows only `label`; the
   * detail view carries `title`, `body` and `points`.
   */
  items: [
    {
      key: "credentials",
      size: "big",
      title: "Credentials it never sees",
      label: "Credentials it never sees",
      body: "Agents work with stand-in tokens bound to approved hosts. The real key is added at egress, re-checked on every use, and revoked when the run ends.",
      points: [
        "Secrets are encrypted at rest with AES-256-GCM.",
        "Each stand-in works only against the hosts its connection allows.",
        "Every use re-checks the run, the agent’s permission and the host, and is logged.",
        "OAuth tokens refresh outside the sandbox, so the agent only ever holds the stand-in.",
      ],
    },
    {
      key: "sandbox",
      size: "small",
      title: "An isolated sandbox for every run",
      label: "Isolated sandbox",
      body: "Each run gets its own sandbox, walled off from the platform, its database and stored keys. When the run ends, the sandbox is gone. The workspace stays, so the work continues.",
      points: [
        "Unsandboxed commands are switched off.",
        "Writes stay inside the workspace and temporary files.",
        "Network traffic goes through the credential proxy.",
        "Stand-in tokens are revoked as the run closes.",
      ],
    },
    {
      key: "checks",
      size: "tall",
      title: "Every action checked",
      label: "Every action checked",
      body: "One checkpoint sits between the agent and every tool. It checks the run, the caller and the target on every single call.",
      points: [
        "Unknown tools are denied.",
        "New integrations start switched off, and you enable their tools one by one.",
        "A tool whose definition changes is switched off until someone reviews it.",
        "Posting to a private channel needs the caller to be a member, checked live.",
      ],
    },
    {
      key: "deployment",
      size: "small",
      title: "Your own deployment",
      label: "Your own deployment",
      body: "Each organization runs on a dedicated deployment, with its own VM, network, firewall and disk. Your agents, data and keys live there.",
      points: [
        "Web traffic arrives only through Cloudflare.",
        "The firewall closes every other way in.",
        "Daily disk snapshots keep it recoverable.",
      ],
    },
    {
      key: "access",
      size: "wide",
      title: "Permissions down to the tool",
      label: "Permissions down to the tool",
      body: "Every agent has its own identity. Grant people, teams and agents exactly what they need: one agent, one vault, one connection, one tool.",
      points: [
        "Admin rights don’t include using your keys or reading conversations.",
        "Someone without access gets a Request access button, and an owner approves it in one click.",
        "People from partner Slack workspaces join as guests, with their own limits.",
        "Access reads plainly: Can view, Can use, Can edit, Can manage.",
      ],
    },
    {
      key: "brain",
      size: "big",
      title: "A company brain with boundaries",
      label: "Company brain",
      body: "One shared, versioned knowledge base that every agent reads and writes. Each change is a commit with a reason you can trace and undo.",
      points: [
        "Access is set folder by folder: read, or read and write.",
        "An agent never learns about folders it can’t reach.",
        "Edits made at the same time merge, and conflicts are recorded, not lost.",
        "Each conversation keeps its own memory. Nothing becomes organization memory on its own.",
      ],
    },
    {
      key: "budgets",
      size: "small",
      title: "Budgets that hold",
      label: "Budgets per person",
      body: "Give each person a spending allowance. Every run reserves its cost before it starts and settles when it ends, so spend stays inside the limit.",
      points: [
        "Usage is tracked per person, per agent and per job.",
        "Every run carries a hard cost ceiling.",
        "Guests get their own weekly allowance.",
      ],
    },
    {
      key: "audit",
      size: "small",
      title: "A record of every action",
      label: "Audit trail",
      body: "Credential use, tool calls, skill changes and access requests are written to an audit log, with who asked, which agent acted and in which run.",
      points: [
        "Each credential use records the agent, the caller, the run and the host.",
        "Access requests and approvals are logged too.",
        "The log stays on your own deployment.",
      ],
    },
    {
      key: "surfaces",
      size: "wide",
      title: "One agent, every surface",
      label: "One agent, every surface",
      body: "Slack, Discord, web chat and scheduled jobs run the same agent, with the same permissions and budget. Change an assignment and it applies on the next message.",
      points: [
        "Slack Connect channels work, with partners as guests.",
        "Jobs run on a schedule, with their own workspace and run history.",
        "Web chat streams the answer live in the browser.",
      ],
    },
    {
      key: "models",
      size: "small",
      title: "Your models, your accounts",
      label: "Your models",
      body: "Use the included models, or connect your organization’s Anthropic API key, Claude subscription or ChatGPT subscription. Each agent runs on the model you pick.",
      points: [
        "Provider keys are added at egress, like every other credential.",
        "Admins choose which models are enabled.",
        "Cost is worked out per provider.",
      ],
    },
    {
      key: "skills",
      size: "small",
      title: "Skills your team can share",
      label: "Shared skills",
      body: "Turn how your team works into skills. Publish a skill once, version it, and install it for one conversation or the whole organization.",
      points: [
        "Skills are versioned packages in your own registry.",
        "Loading a skill grants no new access. Each tool it uses is still checked.",
        "Agents can install a skill when someone asks.",
      ],
    },
  ],
  /** Detail view controls. */
  dialog: { close: "Close", prev: "Previous", next: "Next", open: "Open details" },
} as const;

export const footer = {
  title: "Put a System to work\non your next outcome.",
  body: "Tell us what you want to achieve. We'll show you how a System takes it on.",
  demo: { label: "Book a demo", href: "/request-demo" },
  /** Replace with the real inbox. */
  contact: { label: "Contact us", href: "mailto:hello@example.com" },
  links: [
    { label: "Who we are", href: "#who-we-are" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Security", href: "#security" },
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
