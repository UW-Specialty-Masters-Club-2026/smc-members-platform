/** Club-wide copy, carried over from the previous SMC website. */
export const SITE = {
  name: 'Specialty Masters Club',
  tagline: 'Empowering MSBA, MSIS, MSCM & Specialty Master’s Students at UW Foster',
  footerTagline:
    'Empowering MSBA, MSIS, MSCM & Specialty Master’s Students at UW Foster School of Business.',
  logo: '/content/2026-09-smc-logo.png',
  heroImage: '/content/2026-09-paccar-hall-autumn.jpg',
  email: 'smcommittee@uw.edu',
  linkedin: {
    label: 'UW Foster Specialty Masters Student Club',
    url: 'https://www.linkedin.com/company/uw-foster-specialty-masters-student-club/',
  },
  instagram: { label: '@smclub_uw', url: 'https://www.instagram.com/smclub_uw/' },
  address: ['UW Foster School of Business', 'PACCAR Hall', 'Seattle, WA 98195'],
  writeForUsUrl: 'https://smcfoster.notion.site/3580984ab5b68069996bf623248354cb?pvs=105',
};

export const ABOUT = [
  'The Specialty Masters Club (SMC) at the UW Foster School brings together students across MSBA, MSIS, MSCM, MSA and other specialized programs.',
  'Our mission is to create belonging, industry exposure, and skill-building opportunities through networking, competitions, and AI-driven projects.',
  'We foster a collaborative environment where specialty master’s students can connect, grow, and prepare for successful careers in their respective fields.',
];

export const PILLARS = [
  {
    title: 'Community & Connection',
    items: [
      'Cross-program mixers & meetups',
      'Social & cultural events',
      'Peer collaboration across Foster programs',
      'Strengthening belonging at Foster',
    ],
  },
  {
    title: 'Career & Competitions',
    items: [
      'Networking & Industry Engagement',
      'Career & Application Readiness',
      'Case Competitions',
      'AI Projects & Innovation Lab',
    ],
  },
  {
    title: 'Tech & AI Projects',
    items: [
      'Agentic AI experimentation & hands-on labs',
      'AI Safety Awareness collaborations',
      'Real-world Foster AI applications and ROI modeling',
    ],
  },
];

export const JOIN = {
  title: 'Join SMC Today',
  lead: 'Become part of a thriving community of MSBA, MSIS, MSCM, MSA students at UW Foster',
  why: [
    {
      title: 'Networking Opportunities',
      text: 'Connect with fellow specialty master’s students and industry professionals',
    },
    {
      title: 'Career Development',
      text: 'Access to exclusive workshops, case competitions, and career resources',
    },
    {
      title: 'AI & Tech Projects',
      text: 'Collaborate on cutting-edge AI projects and innovation initiatives',
    },
  ],
  steps: [
    {
      title: 'Sign Up',
      text: 'Fill out our SMC membership form to get started and become an official member',
    },
    {
      title: 'Attend Events',
      text: 'Participate in meetings, workshops, case competitions & networking events',
    },
  ],
  closing:
    'Join hundreds of specialty master’s students building their network and careers at Foster',
};

/** Team page filters and the department keys each one shows. */
export const TEAM_FILTERS = [
  { label: 'All', key: null },
  { label: 'SMC Leads', key: 'leads' },
  { label: 'Core Strategy', key: 'strategy' },
  { label: 'Alumni Relations', key: 'alumni' },
  { label: 'Tech Development', key: 'tech' },
  { label: 'Career & Case Comps', key: 'casecomp' },
  { label: 'Operations', key: 'operations' },
] as const;
