/** Claude Skills Library, carried over from the previous SMC website. */
const REPO = 'UW-Specialty-Masters-Club-2026/uw-foster-smc-claude-skills';
const smc = (slug: string) => ({
  download: `https://raw.githubusercontent.com/${REPO}/main/downloads/${slug}.zip`,
  view: `https://github.com/${REPO}/blob/main/skills/${slug}/SKILL.md`,
});
const anthropic = (slug: string) => `https://github.com/anthropics/skills/tree/main/skills/${slug}`;

export const HOW_TO_ADD = [
  { text: 'Sign in at ', link: { label: 'claude.ai', url: 'https://claude.ai' }, after: '.' },
  { text: 'Go to Settings → Capabilities and turn on “Code execution and file creation”.' },
  {
    text: 'Download a skill ZIP, then go to Customize → Skills → + → Create skill → Upload a skill.',
  },
];

export const CAREER_SKILLS = [
  {
    name: 'Resume Tailor',
    text: 'Matches your resume to a job posting: fit table, before/after bullet rewrites, and an ATS format check.',
    prompt: 'Tailor my resume to this job.',
    ...smc('resume-tailor'),
  },
  {
    name: 'Cover Letter Writer',
    text: 'A specific 250–350 word letter built from your two strongest stories, without the generic phrases.',
    prompt: 'Write a cover letter for this job using my resume.',
    ...smc('cover-letter-writer'),
  },
  {
    name: 'Interview Prep Coach',
    text: 'Likely questions, a STAR story bank, and mock interviews one question at a time with feedback.',
    prompt: 'Run a mock behavioral interview for this role.',
    ...smc('interview-prep-coach'),
  },
  {
    name: 'LinkedIn Optimizer',
    text: 'Headline options, About section, and experience bullets rewritten for your target role.',
    prompt: 'Improve my LinkedIn profile for product management roles.',
    ...smc('linkedin-optimizer'),
  },
  {
    name: 'Networking Outreach',
    text: 'Connection notes, coffee-chat requests, referral asks, and follow-ups people actually answer.',
    prompt: 'Draft a coffee-chat request to a PM at Microsoft.',
    ...smc('networking-outreach'),
  },
];

export const STARTER_SKILLS = [
  {
    name: 'Skill Creator',
    text: 'Turn something you do often (case prep, meeting notes, study guides) into your own skill.',
    url: anthropic('skill-creator'),
  },
  {
    name: 'Frontend Design',
    text: 'Better-looking web pages and app prototypes.',
    url: anthropic('frontend-design'),
  },
  {
    name: 'Internal Comms',
    text: 'Status updates, newsletters, and team announcements.',
    url: anthropic('internal-comms'),
  },
  {
    name: 'Brand Guidelines',
    text: 'Keep documents and visuals on-brand.',
    url: anthropic('brand-guidelines'),
  },
  { name: 'Canvas Design', text: 'Posters and visual designs.', url: anthropic('canvas-design') },
  { name: 'Algorithmic Art', text: 'Generative art with code.', url: anthropic('algorithmic-art') },
];

export const BUILT_IN_SKILLS = [
  { name: 'Word', text: 'Create and edit .docx documents.' },
  { name: 'PowerPoint', text: 'Create slide decks.' },
  { name: 'Excel', text: 'Build spreadsheets with formulas and charts.' },
  { name: 'PDF', text: 'Create, read, and fill PDFs.' },
];
