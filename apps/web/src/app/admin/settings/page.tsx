'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { SiteSettings } from '@/content';
import { api, describeError } from '@/lib/api';

const splitLines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
/** "Title | text" per line ↔ [{ title, text }]. */
const toPairs = (s: string) =>
  splitLines(s).map((l) => {
    const [title, ...rest] = l.split('|');
    return { title: title!.trim(), text: rest.join('|').trim() };
  });
const fromPairs = (p: { title: string; text: string }[] = []) =>
  p.map((x) => `${x.title} | ${x.text}`).join('\n');

function Section(props: {
  title: string;
  description: string;
  onSave: () => Promise<void>;
  status: string | null;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="ax-card"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        await props.onSave();
        setBusy(false);
      }}
    >
      <div className="ax-card-head">
        <div>
          <h2>{props.title}</h2>
          <p className="ax-muted" style={{ margin: '4px 0 0' }}>
            {props.description}
          </p>
        </div>
        <button type="submit" className="ax-btn ax-btn--primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="ax-pad ax-form">
        {props.status && (
          <p
            className={`ax-alert${props.status.startsWith('Saved') ? '' : ' ax-alert--error'}`}
            style={{ margin: 0 }}
            role="status"
          >
            {props.status}
          </p>
        )}
        {props.children}
      </div>
    </form>
  );
}

export default function SiteSettingsPage() {
  const [loaded, setLoaded] = useState(false);
  const [about, setAbout] = useState('');
  const [pillars, setPillars] = useState<{ title: string; items: string }[]>([]);
  const [contact, setContact] = useState({
    email: '',
    linkedinLabel: '',
    linkedinUrl: '',
    instagramLabel: '',
    instagramUrl: '',
    address: '',
  });
  const [join, setJoin] = useState({ lead: '', why: '', steps: '', closing: '' });
  const [status, setStatus] = useState<Record<string, string | null>>({});

  useEffect(() => {
    void api<SiteSettings>('/admin/content/settings').then((res) => {
      const s = res.data ?? {};
      setAbout((s.about?.paragraphs ?? []).join('\n\n'));
      setPillars(
        (s.pillars?.items ?? []).map((p) => ({ title: p.title, items: p.items.join('\n') })),
      );
      if (s.contact) setContact({ ...s.contact, address: s.contact.address.join('\n') });
      if (s.join)
        setJoin({
          lead: s.join.lead,
          why: fromPairs(s.join.why),
          steps: fromPairs(s.join.steps),
          closing: s.join.closing,
        });
      setLoaded(true);
    });
  }, []);

  async function save(key: string, body: unknown) {
    const res = await api(`/admin/content/settings/${key}`, { method: 'PUT', body });
    setStatus((s) => ({
      ...s,
      [key]: res.ok ? 'Saved. The website shows the new text now.' : describeError(res),
    }));
  }

  if (!loaded) return <p className="ax-muted">Loading…</p>;

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">Site settings</h1>
          <p>Text on the home page, footer and Join page.</p>
        </div>
      </div>
      <div className="ax-grid">
        <Section
          title="About the club"
          description="Home page “About” section. Leave a blank line between paragraphs."
          status={status.about ?? null}
          onSave={() =>
            save('about', {
              paragraphs: about
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean),
            })
          }
        >
          <label className="ax-field">
            <span>Paragraphs</span>
            <textarea
              className="ax-input"
              rows={8}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
          </label>
        </Section>

        <Section
          title="Strategy pillars"
          description="Home page “3-Pillar Strategy” cards. One bullet per line."
          status={status.pillars ?? null}
          onSave={() =>
            save('pillars', {
              items: pillars.map((p) => ({ title: p.title.trim(), items: splitLines(p.items) })),
            })
          }
        >
          <div className="ax-form-row">
            {pillars.map((p, i) => (
              <div key={i} className="ax-form">
                <label className="ax-field">
                  <span>Pillar {i + 1} title</span>
                  <input
                    className="ax-input"
                    value={p.title}
                    onChange={(e) =>
                      setPillars((ps) =>
                        ps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <label className="ax-field">
                  <span>Bullets</span>
                  <textarea
                    className="ax-input"
                    rows={5}
                    value={p.items}
                    onChange={(e) =>
                      setPillars((ps) =>
                        ps.map((x, j) => (j === i ? { ...x, items: e.target.value } : x)),
                      )
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Contact"
          description="Home page “Get in Touch” and the footer."
          status={status.contact ?? null}
          onSave={() => save('contact', { ...contact, address: splitLines(contact.address) })}
        >
          <div className="ax-form-row">
            {(
              [
                ['email', 'Email'],
                ['linkedinLabel', 'LinkedIn name'],
                ['linkedinUrl', 'LinkedIn link'],
                ['instagramLabel', 'Instagram handle'],
                ['instagramUrl', 'Instagram link'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="ax-field">
                <span>{label}</span>
                <input
                  className="ax-input"
                  value={contact[k]}
                  onChange={(e) => setContact((c) => ({ ...c, [k]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <label className="ax-field">
            <span>Address (one line per row)</span>
            <textarea
              className="ax-input"
              rows={3}
              value={contact.address}
              onChange={(e) => setContact((c) => ({ ...c, address: e.target.value }))}
            />
          </label>
        </Section>

        <Section
          title="Join page"
          description="For “Why join” and “How to join”, write one item per line as: Title | text"
          status={status.join ?? null}
          onSave={() =>
            save('join', {
              lead: join.lead.trim(),
              why: toPairs(join.why),
              steps: toPairs(join.steps),
              closing: join.closing.trim(),
            })
          }
        >
          <label className="ax-field">
            <span>Intro</span>
            <input
              className="ax-input"
              value={join.lead}
              onChange={(e) => setJoin((j) => ({ ...j, lead: e.target.value }))}
            />
          </label>
          <label className="ax-field">
            <span>Why join</span>
            <textarea
              className="ax-input"
              rows={4}
              value={join.why}
              onChange={(e) => setJoin((j) => ({ ...j, why: e.target.value }))}
            />
          </label>
          <label className="ax-field">
            <span>How to join</span>
            <textarea
              className="ax-input"
              rows={3}
              value={join.steps}
              onChange={(e) => setJoin((j) => ({ ...j, steps: e.target.value }))}
            />
          </label>
          <label className="ax-field">
            <span>Closing line</span>
            <input
              className="ax-input"
              value={join.closing}
              onChange={(e) => setJoin((j) => ({ ...j, closing: e.target.value }))}
            />
          </label>
        </Section>
      </div>
    </>
  );
}
