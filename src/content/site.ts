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
  title: "Build outcome\nmachines",
  subtitle:
    "Outcome machines are durable agents built on your organization’s knowledge, tools, memory, and guardrails. They grow stronger with every run, until outcomes flow like water.",
  cta: { label: "Request a demo", href: "/request-demo" },
  scroll: "Scroll to explore",
} as const;

export const whoWeAre = {
  /** `*text*` renders as the brand highlight. */
  title: "We are an *Applied Super Intelligence Lab*, focused on building the foundations that make outcomes flow",
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
  title: "How an outcome machine works",
  steps: [
    {
      title: "Set the outcome",
      body: "Define what you want to achieve, how you’ll measure success, and the boundaries of its role.",
      visual: "Outcome and responsibility",
    },
    {
      title: "Bring it into your company",
      body: "Teach it what your team knows and connect the tools they use. The setup your most AI-forward people built for themselves becomes part of how the whole organization works.",
      visual: "Company context and tools",
    },
    {
      title: "Work alongside it",
      body: "Hand it the work the way you would to a trusted colleague. Check in on progress, give direction when it matters, and let it ask when it's unsure. It works beside your team, not instead of it.",
      visual: "Team collaboration",
    },
    {
      title: "Learning compounds with every outcome",
      body: "Every outcome captures what worked, what didn’t, and why. Instead of disappearing in individual chat histories, that learning becomes organizational infrastructure. Every outcome that follows starts from what your company has already learned.",
      visual: "Knowledge that compounds",
    },
  ],
  closing: {
    title: "An ongoing teammate for your organization",
    body: "The work can continue across conversations, with your team involved along the way.",
    cta: { label: "Book a demo", href: "/request-demo" },
  },
} as const;

export const harness = {
  title: "Organizational Harness",
  /**
   * One tile each, in reading order; every tile is the same size. The tile
   * shows only `label`; the detail view carries `title`, `body` and `points`.
   */
  items: [
    {
      key: "credentials",
      title: "Agents never see your keys",
      label: "Agents never see your keys",
      body: "Agents get a stand-in key that only works with the services you approve. The real key is swapped in as each request leaves, and checked every time. When the task ends, the stand-in stops working.",
      points: [
        "Stored keys are encrypted with AES-256-GCM.",
        "A stand-in key only works with the services its connection allows.",
        "Each use is checked against the task, the agent’s permission and the destination, then logged.",
        "Logins (OAuth tokens) refresh outside the sandbox, so the agent only ever holds the stand-in.",
      ],
    },
    {
      key: "access",
      title: "Your whole team, each with the right access",
      label: "Multiplayer permissions",
      body: "Every agent has its own identity, like a person on your team. Give people, teams and agents exactly the access they need, down to a single agent, key vault, connection or tool.",
      points: [
        "Being an admin doesn’t let someone use your keys or read your conversations.",
        "Someone without access sees a Request access button, and an owner approves it in one click.",
        "People from partner Slack workspaces join as guests, with their own limits.",
        "Access levels are plain: Can view, Can use, Can edit, Can manage.",
      ],
    },
    {
      key: "checks",
      title: "Access, down to each tool",
      label: "Access down to each tool",
      body: "Every time an agent uses a tool, the request passes through one checkpoint first. It confirms the task, who asked for it, and what the tool will touch.",
      points: [
        "Tools it doesn’t recognize are blocked.",
        "Tools that appear on a connection later start switched off until someone turns them on.",
        "If a tool changes, it’s switched off until someone reviews it.",
        "An agent can post in a private channel only if the person who asked is a member, checked at that moment.",
      ],
    },
    {
      key: "deployment",
      title: "Bring your own cloud",
      label: "Bring your own cloud",
      body: "Your organization runs on its own dedicated deployment, with its own server, network, firewall and storage. Your agents, data and keys live there.",
      points: [
        "Web traffic reaches it only through Cloudflare.",
        "A firewall closes every other way in.",
        "Daily snapshots let you restore it if something goes wrong.",
      ],
    },
    {
      key: "sandbox",
      title: "An isolated sandbox for every task",
      label: "Isolated sandbox & filesystem",
      body: "Every task runs in its own isolated sandbox, with no way into the platform, its database or your stored keys. When the task ends, the sandbox is deleted. Its files are kept, so the next task picks up where this one left off.",
      points: [
        "Nothing runs outside the sandbox.",
        "It can only write to its own workspace and temporary files.",
        "Its internet traffic goes through the same checkpoint that adds your keys.",
        "Its stand-in keys stop working when the task ends.",
      ],
    },
    {
      key: "brain",
      title: "A company brain with boundaries",
      label: "Company brain",
      body: "One shared knowledge base that every agent reads from and adds to. Every change is saved with the reason behind it, so you can trace it or undo it.",
      points: [
        "You set access folder by folder: read only, or read and write.",
        "An agent can’t even see folders it has no access to.",
        "When two edits happen at once, they’re merged and any conflict is kept on record.",
        "Each conversation keeps its own memory. Nothing joins the company brain automatically.",
      ],
    },
    {
      key: "budgets",
      title: "Spending limits that hold",
      label: "Budgets per person",
      body: "Give each person a spending allowance. Each task sets aside its cost before it starts and settles up when it ends, so spending stays within the limit.",
      points: [
        "Usage is tracked by person, by agent and by scheduled job.",
        "Every task has a hard cost cap.",
        "Guests get their own weekly allowance.",
      ],
    },
    {
      key: "audit",
      title: "A record of every action",
      label: "Audit trail",
      body: "Every key use, tool use, skill change and access request goes into an audit log, with who asked, which agent acted and in which task.",
      points: [
        "Each key use records the agent, who asked, the task and where the request went.",
        "Access requests and approvals are logged too.",
        "The log stays in your own deployment.",
      ],
    },
    {
      key: "surfaces",
      title: "Your agents, on every surface",
      label: "Your agents, every surface",
      body: "Each agent works the same way in Slack, Discord, web chat and scheduled jobs, with the same permissions and budget everywhere. Changes apply from the next message.",
      points: [
        "It works in Slack Connect channels too, with partners joining as guests.",
        "Scheduled jobs run on their own, each with its own workspace and history.",
        "In web chat, answers appear live as they’re written.",
      ],
    },
    {
      key: "models",
      title: "Any model, your accounts",
      label: "Any model",
      body: "Use the included models, or connect your organization’s Anthropic API key, Claude subscription or ChatGPT subscription. Each agent runs on the model you pick.",
      points: [
        "Model keys are protected like every other key.",
        "Admins choose which models are available.",
        "Costs are tracked for each provider.",
      ],
    },
    {
      key: "connectors",
      title: "Connect the tools you already use",
      label: "Connectors",
      body: "Add apps from the catalog, like Google Workspace, Microsoft 365, Notion, Linear, GitHub, Salesforce and Zendesk, or bring your own MCP server. Connections live in a vault, and each agent gets the vault or a single connection.",
      points: [
        "Connect with OAuth or an API key. The secret never enters the sandbox.",
        "Add any MCP server with an HTTPS address.",
        "Turn each tool on or off, or all of them at once.",
        "Connections that need signing in again are flagged.",
      ],
    },
    {
      key: "code",
      title: "Agents write code to use your tools",
      label: "Code mode",
      body: "Instead of calling tools one at a time, an agent can write a short JavaScript program that finds the tools it needs and calls them. The code runs in its own sandbox, and every tool call it makes passes the same checks as any other.",
      points: [
        "The code has no network, no keys and no way into the platform’s files or database.",
        "Each tool call from the code is checked and logged, one by one.",
        "It can read the agent’s workspace, but not change it.",
        "Every run is capped: 50 tool calls, about a minute, and 1 MB of output.",
      ],
    },
    {
      key: "jobs",
      title: "Jobs that start on a schedule or on request",
      label: "Triggers and scheduled jobs",
      body: "Save a request as a Job and choose how it starts: on a schedule, from an API call, or with Run now. Each Job keeps its own workspace, run history and costs, and sends its result back to the conversation it came from.",
      points: [
        "Run every day, every weekday, once a week, or on any cron schedule, in your time zone.",
        "Ask in chat and the agent sets up the schedule for you.",
        "Choose whether a Job remembers context between runs or starts fresh each time.",
        "If a run is still going, skip the next one, let them overlap, or replace the old one.",
      ],
    },
    {
      key: "skills",
      title: "Skills your team can share",
      label: "Memory and skills",
      body: "Turn the way your team works into reusable skills. Publish a skill once, keep every version, and switch it on for one conversation or the whole organization.",
      points: [
        "Skills live in your own library, with every version kept.",
        "A skill grants no new access. Every tool it uses is still checked.",
        "Agents can install a skill when someone asks.",
      ],
    },
  ],
  /** Detail view controls. */
  dialog: { close: "Close", prev: "Previous", next: "Next", open: "Open details" },
} as const;

export const footer = {
  title: "Put an outcome machine\nto work",
  body: "Tell us what you want to achieve. We'll show you how an outcome machine takes it on.",
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
  title: "Meet your first\noutcome machine",
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
    outcome: "What should your first outcome machine own?",
    outcomeHint: "For example: keep our support backlog under 24 hours.",
    optional: "Optional",
  },
  optIn: "Send me occasional updates. Unsubscribe anytime.",
  privacy: { label: "How we use your info:", link: "Privacy Policy", href: "/privacy" },
  submit: "Request a demo",
  sent: { title: "Thanks, we got it", body: "Our team will reach out soon to set up a time." },
  error: "Something went wrong. Please try again, or email us instead.",
  back: "Back to home",
} as const;
