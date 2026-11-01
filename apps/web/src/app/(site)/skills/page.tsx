import type { Metadata } from 'next';
import Link from 'next/link';
import type { SkillItem } from '@/content';
import { WORKSHOP } from '@/content/workshop';
import { getContent } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Claude Skills Library · Specialty Masters Club' };
export const dynamic = 'force-dynamic';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

const GROUPS = [
  {
    key: 'CAREER',
    title: 'Career skills (made by SMC)',
    lead: 'Download the ZIP and upload it in Claude under Customize → Skills.',
  },
  {
    key: 'STARTER',
    title: 'Starter picks from Anthropic',
    lead: 'Check Customize → Skills first; some may already be there to switch on.',
  },
  {
    key: 'BUILT_IN',
    title: 'Already in Claude',
    lead: 'Nothing to download. Turn on code execution and ask for the file.',
  },
] as const;

export default async function SkillsPage() {
  const skills = (await getContent<{ items: SkillItem[] }>('/skills'))?.items ?? [];
  return (
    <main className="page">
      <p className="eyebrow">Claude skills library</p>
      <h1 className="display">Make Claude work for you</h1>
      <p className="muted lead">
        Ready-made skills that turn Claude into a career coach, analyst, and study partner. Pick
        one, add it to Claude, and try it out.
      </p>

      <section className="feature-card" aria-labelledby="workshop-card">
        <img
          src={WORKSHOP.poster}
          alt={`Workshop poster: ${WORKSHOP.title}, led by Professor ${WORKSHOP.instructor.name}`}
          width={1081}
          height={1400}
          loading="lazy"
        />
        <div>
          <p className="eyebrow">Claude workshop · Start here</p>
          <h2 id="workshop-card">{WORKSHOP.title}</h2>
          <p>
            With Prof. {WORKSHOP.instructor.name}, {WORKSHOP.instructor.school}. A self-paced guide
            to building your AI digital twin and chief of staff: model choice, context engineering,
            dashboards, tool integrations and your first vibecoded app.
          </p>
          <Link className="btn" href="/skills/claude-digital-twin">
            Start here <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="card" aria-labelledby="how">
        <h2 id="how" style={{ marginTop: 0 }}>
          How to add a skill
        </h2>
        <ol className="steps">
          <li>
            Sign in at{' '}
            <a href="https://claude.ai" {...ext}>
              claude.ai
            </a>
            .
          </li>
          <li>Go to Settings → Capabilities and turn on “Code execution and file creation”.</li>
          <li>
            Download a skill ZIP, then go to Customize → Skills → + → Create skill → Upload a skill.
          </li>
        </ol>
      </section>

      {GROUPS.map((g) => {
        const items = skills.filter((s) => s.group === g.key);
        if (items.length === 0) return null;
        return (
          <section key={g.key}>
            <h2 className="section-title">{g.title}</h2>
            <p className="muted">{g.lead}</p>
            <ul className="card-grid">
              {items.map((s) => (
                <li key={s.id} className="card">
                  <h3 className="card__title">{s.name}</h3>
                  <p className="muted">{s.description}</p>
                  {s.prompt && (
                    <p className="try">
                      <strong>Try it:</strong> “{s.prompt}”
                    </p>
                  )}
                  <div className="card__actions">
                    {s.downloadUrl && (
                      <a className="btn btn--small" href={s.downloadUrl} {...ext}>
                        Download ZIP
                      </a>
                    )}
                    {s.linkUrl && (
                      <a href={s.linkUrl} {...ext}>
                        {g.key === 'CAREER' ? 'View skill ↗' : 'Open on GitHub ↗'}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
