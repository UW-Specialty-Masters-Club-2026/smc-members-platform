import Link from 'next/link';
import { SITE } from '@/content';
import { getSettings } from '@/lib/server-api';

export async function SiteFooter() {
  const { contact } = await getSettings();
  const address = contact?.address ?? SITE.address;
  const email = contact?.email ?? SITE.email;
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <img src={SITE.logo} alt={SITE.name} width={56} height={56} />
          <p>{SITE.footerTagline}</p>
        </div>
        <div>
          <h2>Quick links</h2>
          <ul>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href="/events">Events</Link>
            </li>
            <li>
              <Link href="/articles">Articles</Link>
            </li>
            <li>
              <Link href="/join">Join SMC</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2>Address</h2>
          <address>
            {address.map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
          </address>
        </div>
        <div>
          <h2>Follow us</h2>
          <ul>
            <li>
              <a
                href={contact?.linkedinUrl ?? SITE.linkedin.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn
              </a>
            </li>
            <li>
              <a
                href={contact?.instagramUrl ?? SITE.instagram.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram {contact?.instagramLabel ?? SITE.instagram.label}
              </a>
            </li>
            <li>
              <a href={`mailto:${email}`}>{email}</a>
            </li>
          </ul>
        </div>
      </div>
      <p className="site-footer__copy">
        © {new Date().getFullYear()} {SITE.name}. All rights reserved.
      </p>
    </footer>
  );
}
