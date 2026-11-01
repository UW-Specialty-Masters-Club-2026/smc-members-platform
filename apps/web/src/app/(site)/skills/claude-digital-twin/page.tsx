import type { Metadata } from 'next';
import Link from 'next/link';
import { BackToTop } from '@/components/workshop/BackToTop';
import { LearningNav } from '@/components/workshop/LearningNav';
import { WORKSHOP } from '@/content/workshop';
import {
  BuildModule,
  ContextModule,
  DashboardModule,
  IntegrationsModule,
  ModelsModule,
  OverviewModule,
  ResourcesModule,
  TwinModule,
} from './modules';

export const metadata: Metadata = {
  title: `Start Here: ${WORKSHOP.title} · Specialty Masters Club`,
  description:
    'Learn to build your AI digital twin and chief of staff with Claude: model choice, context engineering, dashboards, tool integrations and vibecoded apps. From Prof. Léonard Boussioux’s workshop at UW Foster.',
  openGraph: {
    title: WORKSHOP.title,
    description: 'Start here: a self-paced guide to Prof. Léonard Boussioux’s Claude workshop.',
    images: [WORKSHOP.poster],
  },
};

export default function ClaudeWorkshopPage() {
  return (
    <main id="top">
      <section
        className="hero workshop-hero"
        style={{ backgroundImage: `url(${WORKSHOP.heroImage})` }}
      >
        <div className="workshop-hero__inner">
          <nav aria-label="Breadcrumb">
            <ol className="breadcrumb">
              <li>
                <Link href="/">Home</Link>
              </li>
              <li>
                <Link href="/skills">Skills</Link>
              </li>
              <li>
                <span aria-current="page">Claude Workshop</span>
              </li>
            </ol>
          </nav>
          <p className="workshop-hero__eyebrow">Start here · {WORKSHOP.subtitle}</p>
          <h1 className="display workshop-hero__title">{WORKSHOP.title}</h1>
          <p className="hero__lead workshop-hero__lead">{WORKSHOP.lead}</p>
          <ul className="workshop-hero__facts">
            <li>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
              </svg>
              <span>
                Prof. {WORKSHOP.instructor.name} · {WORKSHOP.instructor.school}
              </span>
            </li>
            <li>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <span>{WORKSHOP.date}</span>
            </li>
          </ul>
          <div className="hero__actions">
            <a className="btn" href="#overview">
              Start the workshop <span aria-hidden="true">→</span>
            </a>
            <a className="btn btn--light" href="#models">
              View lecture notes
            </a>
          </div>
        </div>
      </section>

      <div className="workshop">
        <aside className="workshop__side">
          <LearningNav />
        </aside>
        <div className="workshop__main">
          <OverviewModule />
          <ModelsModule />
          <ContextModule />
          <TwinModule />
          <DashboardModule />
          <IntegrationsModule />
          <BuildModule />
          <ResourcesModule />
        </div>
      </div>
      <BackToTop />
    </main>
  );
}
