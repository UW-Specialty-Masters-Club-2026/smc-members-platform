import type { DigestContent } from '../digest-content';

/** Mirrors the approved design: two events (one open, one full) and a recruiting post. */
export const DESIGN_CONTENT: DigestContent = {
  weekKey: '2026-10-26',
  dateLabel: 'Monday, October 26, 2026',
  summary: 'Two events to save a seat for, and four open roles on the SMC team.',
  events: [
    {
      id: 'evt_1',
      title: 'AI at Work Workshop',
      summary: 'Hands-on session on putting AI tools to work in finance and analytics roles.',
      when: 'Wed, Oct 28 · 6:00–7:30 PM PT',
      startsAt: '2026-10-29T01:00:00.000Z',
      location: 'PACCAR Hall, Room 192 · UW Seattle',
      seats: '18 of 30 seats left',
      action: 'REGISTER',
      url: 'https://smc.example/events/ai-at-work-workshop-1a2b3c',
    },
    {
      id: 'evt_2',
      title: 'Alumni Coffee Chat',
      summary: 'Small-group conversations with Foster Specialty Master’s alumni.',
      when: 'Wed, Nov 4 · 5:30–7:00 PM PT',
      startsAt: '2026-11-05T01:30:00.000Z',
      location: 'Dempsey Hall, Room 302 · UW Seattle',
      seats: 'Full · Join the waitlist',
      action: 'JOIN_WAITLIST',
      url: 'https://smc.example/events/alumni-coffee-chat-4d5e6f',
    },
  ],
  news: [
    {
      id: 'news_1',
      tag: 'NOW RECRUITING',
      title: 'Join the SMC team',
      summary:
        'SMC is growing. Help create experiences that connect Specialty Master’s students across UW Foster. All positions are open to current UW Foster Specialty Master’s students.',
      url: 'https://smc.example/news/join-the-smc-team-7a8b9c',
      publishedAt: '2026-10-21T18:00:00.000Z',
      openings: [
        { title: 'Finance Officers', openings: 2 },
        { title: 'Operations', openings: 1 },
        { title: 'Alumni Outreach', openings: 1 },
        { title: 'AI & Tech', openings: 1 },
      ],
      applyEmail: 'smcommittee@uw.edu',
      applyChecklist: [
        'Your resume',
        'The role you’re interested in',
        'A brief note on why you’d like to join',
      ],
    },
  ],
  omitted: { events: 0, news: 0 },
};
