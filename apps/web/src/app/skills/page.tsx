import type { Metadata } from 'next';
import { BUILT_IN_SKILLS, CAREER_SKILLS, HOW_TO_ADD, STARTER_SKILLS } from '@/content';

export const metadata: Metadata = { title: 'Claude Skills Library · Specialty Masters Club' };

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

export default function SkillsPage() {
  return (
    <main className="page">
      <p className="eyebrow">Claude skills library</p>
      <h1 className="display">Make Claude work for you</h1>
      <p className="muted lead">
        Ready-made skills that turn Claude into a career coach, analyst, and study partner. Pick
        one, add it to Claude, and try it out.
      </p>

      <section className="card" aria-labelledby="how">
        <h2 id="how" style={{ marginTop: 0 }}>
          How to add a skill
        </h2>
        <ol className="steps">
          {HOW_TO_ADD.map((s, i) => (
            <li key={i}>
              {s.text}
              {s.link && (
                <a href={s.link.url} {...ext}>
                  {s.link.label}
                </a>
              )}
              {s.after}
            </li>
          ))}
        </ol>
      </section>

      <h2 className="section-title">Career skills (made by SMC)</h2>
      <p className="muted">Download the ZIP and upload it in Claude under Customize → Skills.</p>
      <ul className="card-grid">
        {CAREER_SKILLS.map((s) => (
          <li key={s.name} className="card">
            <h3 className="card__title">{s.name}</h3>
            <p className="muted">{s.text}</p>
            <p className="try">
              <strong>Try it:</strong> “{s.prompt}”
            </p>
            <div className="card__actions">
              <a className="btn btn--small" href={s.download} {...ext}>
                Download ZIP
              </a>
              <a href={s.view} {...ext}>
                View skill ↗
              </a>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Starter picks from Anthropic</h2>
      <p className="muted">
        Check Customize → Skills first; some may already be there to switch on.
      </p>
      <ul className="card-grid">
        {STARTER_SKILLS.map((s) => (
          <li key={s.name} className="card">
            <h3 className="card__title">{s.name}</h3>
            <p className="muted">{s.text}</p>
            <a href={s.url} {...ext}>
              Open on GitHub ↗
            </a>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Already in Claude</h2>
      <p className="muted">Nothing to download. Turn on code execution and ask for the file.</p>
      <ul className="card-grid">
        {BUILT_IN_SKILLS.map((s) => (
          <li key={s.name} className="card">
            <h3 className="card__title">{s.name}</h3>
            <p className="muted" style={{ marginBottom: 0 }}>
              {s.text}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
