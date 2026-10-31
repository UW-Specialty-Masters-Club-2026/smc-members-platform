import Link from 'next/link';
import { UpcomingEvents } from '@/components/UpcomingEvents';
import { SITE } from '@/content';
import { getSettings } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { about, pillars, contact } = await getSettings();
  return (
    <main>
      <section className="hero" style={{ backgroundImage: `url(${SITE.heroImage})` }}>
        <div className="hero__inner">
          <img src={SITE.logo} alt="" width={96} height={96} className="hero__logo" />
          <h1 className="display hero__title">{SITE.name}</h1>
          <p className="hero__lead">{SITE.tagline}</p>
          <div className="hero__actions">
            <Link className="btn" href="/join">
              Join the Club
            </Link>
            <Link className="btn btn--light" href="/events">
              Upcoming Events
            </Link>
          </div>
        </div>
      </section>

      <section className="page" aria-labelledby="about">
        <h2 id="about" className="section-title">
          About the Specialty Masters Club
        </h2>
        <div className="prose">
          {(about?.paragraphs ?? []).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>

        <h2 className="section-title" style={{ marginTop: 48 }}>
          Our 3-Pillar Strategy
        </h2>
        <ul className="card-grid">
          {(pillars?.items ?? []).map((pillar) => (
            <li key={pillar.title} className="card">
              <h3 className="card__title">{pillar.title}</h3>
              <ul className="bullets">
                {pillar.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="band" aria-labelledby="events">
        <div className="page" style={{ paddingBlock: 48 }}>
          <h2 id="events" className="section-title">
            Events
          </h2>
          <p className="muted">
            Check out our previous and upcoming fireside chats, workshops, and networking events.
          </p>
          <UpcomingEvents />
          <p>
            <Link className="btn btn--outline" href="/events">
              View All Events
            </Link>
          </p>
        </div>
      </section>

      <section className="page" aria-labelledby="newsletter">
        <h2 id="newsletter" className="section-title">
          Newsletter
        </h2>
        <p className="muted">
          Stay updated with the latest news, events, and opportunities from SMC
        </p>
        <Link className="btn btn--outline" href="/newsletters">
          View Newsletters
        </Link>
      </section>

      <section id="contact" className="band" aria-labelledby="contact-title">
        <div className="page" style={{ paddingBlock: 48 }}>
          <h2 id="contact-title" className="section-title">
            Get in Touch
          </h2>
          <dl className="contact-list">
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${contact?.email ?? SITE.email}`}>
                  {contact?.email ?? SITE.email}
                </a>
              </dd>
            </div>
            <div>
              <dt>LinkedIn</dt>
              <dd>
                <a
                  href={contact?.linkedinUrl ?? SITE.linkedin.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {contact?.linkedinLabel ?? SITE.linkedin.label}
                </a>
              </dd>
            </div>
            <div>
              <dt>Instagram</dt>
              <dd>
                <a
                  href={contact?.instagramUrl ?? SITE.instagram.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {contact?.instagramLabel ?? SITE.instagram.label}
                </a>
              </dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{(contact?.address ?? SITE.address).join(', ')}</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}
