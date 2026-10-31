'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SITE } from '@/content';
import { api, type Profile } from '@/lib/api';

/** The club menu from the previous site, plus member and staff links. */
const MENU = [
  { href: '/', label: 'Home' },
  { href: '/team', label: 'Team' },
  { href: '/articles', label: 'Articles' },
  { href: '/newsletters', label: 'Newsletter' },
  { href: '/events', label: 'Events' },
  { href: '/skills', label: 'Skills' },
  { href: '/#contact', label: 'Contact' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    void api<Profile>('/me').then((res) => setMe(res.ok ? res.data : null));
  }, [pathname]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : !href.startsWith('/#') && pathname.startsWith(href);
  const staff = me && me.role !== 'MEMBER';

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          <img src={SITE.logo} alt="" width={40} height={40} />
          <span>SPECIALTY MASTERS CLUB</span>
        </Link>
        <button
          type="button"
          className="site-header__toggle"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
        <nav id="site-menu" aria-label="Main" className={open ? 'is-open' : undefined}>
          <ul className="site-menu">
            {MENU.map((m) => (
              <li key={m.href}>
                <Link href={m.href} aria-current={isActive(m.href) ? 'page' : undefined}>
                  {m.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="site-menu site-menu--account">
            {staff && (
              <>
                <li>
                  <Link href="/admin/digests">Digest</Link>
                </li>
                <li>
                  <Link href="/admin/events">Manage events</Link>
                </li>
              </>
            )}
            {me ? (
              <li>
                <Link href="/me/profile">My profile</Link>
              </li>
            ) : me === null ? (
              <>
                <li>
                  <Link href="/login">Sign in</Link>
                </li>
                <li>
                  <Link href="/join" className="site-menu__cta">
                    Join
                  </Link>
                </li>
              </>
            ) : null}
          </ul>
        </nav>
      </div>
    </header>
  );
}
