export * from './site';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  departments: string[];
  major: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  imageUrl: string | null;
}

export interface ArticleSummary {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  author: string;
  imageUrl: string | null;
  imageAlt: string | null;
  publishedAt: string | null;
}

export interface Article extends ArticleSummary {
  html: string;
}

export interface Newsletter {
  slug: string;
  volume: string;
  title: string;
  summary: string;
  highlights: string[];
  pdfUrl: string;
  issuedAt: string;
}

export interface SkillItem {
  id: string;
  group: 'CAREER' | 'STARTER' | 'BUILT_IN';
  name: string;
  description: string;
  prompt: string | null;
  downloadUrl: string | null;
  linkUrl: string | null;
}

export interface PastEvent {
  slug: string;
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  imageUrl: string | null;
  externalUrl: string | null;
}

export interface SiteSettings {
  about?: { paragraphs: string[] };
  pillars?: { items: { title: string; items: string[] }[] };
  contact?: {
    email: string;
    linkedinLabel: string;
    linkedinUrl: string;
    instagramLabel: string;
    instagramUrl: string;
    address: string[];
  };
  join?: {
    lead: string;
    why: { title: string; text: string }[];
    steps: { title: string; text: string }[];
    closing: string;
  };
}

/** "February 2026" from an ISO date (the old site showed month and year). */
export function monthYear(isoDate: string | null): string {
  if (!isoDate) return '';
  return new Date(`${isoDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
