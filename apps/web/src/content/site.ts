/** Fixed site identity. Editable copy (about, pillars, contact, join) lives in the database. */
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
