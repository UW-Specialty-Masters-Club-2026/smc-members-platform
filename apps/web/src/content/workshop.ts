/**
 * Claude workshop "Start Here" page content.
 *
 * Source: the official Luma event page and the workshop transcript (Google Doc "UW Claude",
 * raw Otter transcript, ~1h26m). Anything not covered in the transcript is labelled on the page.
 * Asset links that do not exist yet are null; the page shows them as "coming soon".
 */

export const WORKSHOP = {
  /** Must match the Luma invitation word for word. */
  title: 'Build with Claude at UW Foster: Your AI Chief of Staff + Vibecoded App',
  subtitle: 'Build your AI digital twin with Claude',
  lead: 'A hands-on guide to using Claude as your personal AI chief of staff, from picking a model to shipping your first vibecoded app.',
  instructor: {
    name: 'Léonard Boussioux',
    title: 'Assistant Professor of Information Systems',
    school: 'UW Foster School of Business',
    image: '/content/2026-10-professor_leonard-1.png',
    website: 'https://boussioux.com',
  },
  date: 'Monday, October 26, 2026 · 2:00–5:00 PM PT',
  place: 'Founders Hall 580, UW Foster School of Business',
  poster: '/content/2026-10-leo_workshop-1.jpeg',
  heroImage: '/content/2026-09-paccar-hall-autumn.jpg',
  lumaUrl: 'https://luma.com/claude-cauh',
  /** Not published yet. Set a YouTube/Drive embed URL here when it is. */
  recordingEmbedUrl: null as string | null,
  /** Edited, fact-checked lecture notes from the instructor. Not published yet. */
  notesUrl: null as string | null,
};

export const MODULES = [
  { id: 'overview', num: '01', title: 'Workshop Overview', icon: 'play' },
  { id: 'models', num: '02', title: 'Model Selection & Effort', icon: 'layers' },
  { id: 'context', num: '03', title: 'Context Engineering', icon: 'doc' },
  { id: 'twin', num: '04', title: 'Build Your Digital Twin', icon: 'user' },
  { id: 'dashboard', num: '05', title: 'AI Chief of Staff Dashboard', icon: 'chart' },
  { id: 'integrations', num: '06', title: 'Automation & Tool Integrations', icon: 'bolt' },
  { id: 'build', num: '07', title: 'Build & Deploy AI Apps', icon: 'code' },
  { id: 'resources', num: '08', title: 'Resources & FAQ', icon: 'help' },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];

export interface Prompt {
  id: string;
  label: string;
  /** Where the prompt comes from, shown under it. */
  source: string;
  text: string;
}

export const PROMPTS = {
  compare: {
    id: 'compare',
    label: 'Model comparison',
    source: 'SMC exercise',
    text: 'Read the attached course syllabus and build me a week-by-week study plan. Flag the three weeks with the heaviest workload and suggest what to start early.',
  },
  slideSkill: {
    id: 'slide-skill',
    label: 'Turn your slide style into a skill',
    source: 'Adapted from the workshop demo',
    text: 'Every time you make a slide deck you use the same font and colors, and the slides are too cluttered. From now on, use Helvetica, one title, one message and one image per slide, and never use text smaller than 14 pt. Create a skill so you apply this whenever I ask for a slide deck.',
  },
  twin: {
    id: 'twin',
    label: 'Digital twin chief of staff',
    source: 'Adapted from the workshop demo',
    text: 'I want you to create the perfect digital twin chief of staff for me. The goal is to focus on [my studies / my job search / my research]. Figure out all the work I am doing and build a knowledge base about my contacts, about me, and about my work. You may read only these folders: [list them]. Do not go anywhere else. Store the knowledge base as Markdown files in this folder. Interview me to figure out exactly how I want to use you, and ask me about anything that is an assumption or an open question.',
  },
  score: {
    id: 'score',
    label: 'Score and rank my tasks',
    source: 'Adapted from the workshop demo',
    text: 'Go through every one of my tasks and give each a score from 1 to 5 for how important it is for my career, how much joy it will bring me, and how urgent it is. Rank them, show the result as a dashboard, and tell me what to push on first this week. Interview me if a score depends on something you do not know.',
  },
  hour: {
    id: 'hour',
    label: 'Plan the next hour',
    source: 'Adapted from the workshop demo',
    text: 'I have one hour ahead of me. Look at where I am the blocker and help me unblock as many things as possible. Optimize our next hour together and interview me on how we can unblock things.',
  },
  weekly: {
    id: 'weekly',
    label: 'Sunday review',
    source: 'Adapted from the workshop demo',
    text: 'Show me everything I got done this week, grouped by area. Point out the wins worth celebrating, and the things I planned but did not do, so I can decide whether to protect time for them next week.',
  },
  mockups: {
    id: 'mockups',
    label: 'Explore visual styles',
    source: 'Adapted from the workshop demo',
    text: 'Create mockups of my web page in 10 different aesthetics, including glassmorphism, claymorphism, neumorphism, neo-brutalism and editorial. Do not write the real code yet; I want to compare the options first.',
  },
  app: {
    id: 'app',
    label: 'Build your first app',
    source: 'SMC exercise, using the workshop tip on Vite and React',
    text: 'In this folder, create a simple web app that presents [my project] to people who have never heard of it. Use Vite and React. Emphasize the visuals: one clear headline, an interactive chart or map of the main result, and a short "how it works" section. Ask me before you add any feature I did not mention.',
  },
} satisfies Record<string, Prompt>;

export interface Template {
  file: string;
  purpose: string;
  body: string;
}

/** Starter files for a personal knowledge base. SMC templates, not from the workshop. */
export const TEMPLATES: Template[] = [
  {
    file: 'about-me.md',
    purpose: 'Who you are, in a few lines Claude can reread every time.',
    body: `# About me

## In one sentence
I am a [program] student at UW Foster, focused on [area].

## Background
- Before Foster: [role, company or field]
- Strengths: [2–3 skills]
- Still learning: [1–2 skills]

## Context Claude should know
- Time zone: Pacific
- Weekly rhythm: [classes, work hours, recurring commitments]
`,
  },
  {
    file: 'goals.md',
    purpose: 'What you are working toward, so Claude can weigh tasks against it.',
    body: `# Goals

## This quarter
1. [Goal] — done when [measurable result]
2. [Goal] — done when [measurable result]

## This year
- [Career goal]
- [Personal goal]

## Not a priority right now
- [Things Claude should not push me toward]
`,
  },
  {
    file: 'preferences.md',
    purpose: 'How you like to work, decide and communicate.',
    body: `# Preferences

## Communication style
- Tone: [direct / warm / formal]
- Never use: [em dashes, buzzwords, ...]
- Length: [short bullet points / full paragraphs]

## How I make decisions
- Show me [2–3] options with trade-offs, then your recommendation.
- Ask before: [sending anything, spending money, contacting people]

## Work preferences
- Deep work: [time of day]
- I do my best work when: [...]
`,
  },
  {
    file: 'projects.md',
    purpose: 'What is in flight, who is involved, and what is next.',
    body: `# Projects

## [Project name]
- Status: [idea / in progress / waiting / done]
- Next action: [one concrete step]
- Who is involved: [names and roles]
- Blocked by: [me / someone else / nothing]
- Deadline: [date]

## [Project name]
- Status:
- Next action:
`,
  },
];

export interface ScoredTask {
  id: string;
  title: string;
  career: number;
  joy: number;
  urgency: number;
}

export const SAMPLE_TASKS: ScoredTask[] = [
  {
    id: 't1',
    title: 'Tailor my résumé for a data analyst internship',
    career: 5,
    joy: 2,
    urgency: 4,
  },
  { id: 't2', title: 'Finish the group case write-up', career: 3, joy: 2, urgency: 5 },
  {
    id: 't3',
    title: 'Coffee chat with an alum at a company I like',
    career: 4,
    joy: 4,
    urgency: 2,
  },
  { id: 't4', title: 'Build a dashboard for my capstone data', career: 4, joy: 5, urgency: 3 },
  { id: 't5', title: 'Submit last month’s reimbursement', career: 1, joy: 1, urgency: 3 },
];

/** Illustrative score: equal weights. The workshop did not specify a formula. */
export function taskScore(t: Pick<ScoredTask, 'career' | 'joy' | 'urgency'>): number {
  return t.career + t.joy + t.urgency;
}

/** Highest score first; ties keep their original order. */
export function rankTasks<T extends ScoredTask>(tasks: readonly T[]): T[] {
  return tasks
    .map((t, i) => ({ t, i, s: taskScore(t) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
}

export interface Link {
  label: string;
  href: string;
  note: string;
}

/** Checked on 2026-10-31. */
export const TOOLS: Link[] = [
  {
    label: 'Claude desktop app',
    href: 'https://claude.com/download',
    note: 'Chat, Cowork, Code, projects and connectors.',
  },
  {
    label: 'Claude Code docs',
    href: 'https://code.claude.com/docs/en/overview',
    note: 'Let Claude work inside a folder on your computer.',
  },
  {
    label: 'What are Skills?',
    href: 'https://support.claude.com/en/articles/12512176-what-are-skills',
    note: 'Teach Claude a repeatable way of working.',
  },
  {
    label: 'What are Projects?',
    href: 'https://support.claude.com/en/articles/9517075-what-are-projects',
    note: 'Keep files and chats for one area of your life together.',
  },
  {
    label: 'Connectors',
    href: 'https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities',
    note: 'Connect Gmail, Drive, Slack, Notion and more.',
  },
  {
    label: 'Artifacts',
    href: 'https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them',
    note: 'Dashboards and small apps inside Claude.',
  },
  {
    label: 'Claude privacy center',
    href: 'https://privacy.claude.com/en/',
    note: 'How your data is used and how to opt out of training.',
  },
  {
    label: 'Wispr Flow',
    href: 'https://wisprflow.ai',
    note: 'Voice dictation tool the instructor uses (paid).',
  },
  { label: 'Lovable', href: 'https://lovable.dev', note: 'Prototype a website from a prompt.' },
  { label: 'Vite', href: 'https://vite.dev/guide/', note: 'Fast setup for a React web app.' },
  {
    label: 'React',
    href: 'https://react.dev',
    note: 'The UI library behind most modern web apps.',
  },
  {
    label: 'Deploy Vite on Vercel',
    href: 'https://vercel.com/docs/frameworks/frontend/vite',
    note: 'Put your app on the web (not covered in the workshop).',
  },
];

export interface Faq {
  q: string;
  a: string;
}

/** From the workshop Q&A, except where marked. Product details as of October 2026. */
export const FAQ: Faq[] = [
  {
    q: 'Can I connect more than one Gmail account?',
    a: 'At the time of the workshop, the Claude app connected to one Gmail account. A Gmail and an Outlook account could both be connected. Forwarding mail to one inbox is a workaround, but check your school’s or employer’s rules first.',
  },
  {
    q: 'I don’t see Cowork in my Claude app.',
    a: 'Newer versions of the app merged Chat and Cowork. Use a regular chat and make sure Claude has access to your folder.',
  },
  {
    q: 'How small should a skill be?',
    a: 'The instructor’s advice: prefer smaller skills that each do one task, and let the smartest model orchestrate them. Skills can be chained together.',
  },
  {
    q: 'Do I need to rewrite my skills when a new model comes out?',
    a: 'Sometimes. Skills for subjective, judgment-heavy work tend to need updates, and an over-specified skill can do worse than the raw model. Skills for fixed formats, like a reimbursement email, usually keep working. Some skills become unnecessary once the model learns the task by default.',
  },
  {
    q: 'Subscription or API credits: what is the difference?',
    a: 'Your subscription covers the Claude app. Apps you build that call Claude use API credits, which are pay-as-you-go. Claude Code can bill either one. If it is confusing, ask Claude to explain your billing setup.',
  },
  {
    q: 'Will Claude train on my chats?',
    a: 'You can turn off “Help improve Claude” in Settings → Privacy. The instructor also recommended reading how your data is used in the privacy center, because policies have gray areas.',
  },
];

export const TROUBLESHOOTING: Faq[] = [
  {
    q: 'Claude says it cannot read my folder.',
    a: 'Add the folder to the session and approve access when Claude asks. Claude only sees folders you grant.',
  },
  {
    q: 'Computer use can see the browser but cannot click or type.',
    a: 'Some apps are given a read-only tier. Claude will tell you; finish that step yourself or grant the access it asks for.',
  },
  {
    q: 'I keep running out of usage.',
    a: 'Check Settings → Usage for your 5-hour and weekly limits. Use Sonnet for lighter tasks and save Opus and higher effort levels for hard work.',
  },
  {
    q: 'My app looks like everyone else’s.',
    a: 'Claude has a default taste. Ask for several mockups in different aesthetics, choose fonts and colors yourself, and save your style as a skill.',
  },
];

/** Shown in Module 08 so reviewers know what is still outstanding. */
export const MISSING = [
  'Workshop recording (link or embed)',
  'Edited, fact-checked transcript and concise lecture notes from the instructor',
  'Slides or screenshots from the live demos',
  'Instructor review of this page',
];
