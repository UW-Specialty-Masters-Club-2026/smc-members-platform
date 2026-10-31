'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { SITE } from '@/content';
import { api, type Profile } from '@/lib/api';
import { Icon, type IconName } from './Icon';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Overview', items: [{ href: '/admin', label: 'Dashboard', icon: 'dashboard' }] },
  {
    section: 'Club',
    items: [
      { href: '/admin/events', label: 'Events', icon: 'calendar' },
      { href: '/admin/members', label: 'Members', icon: 'users', adminOnly: true },
      { href: '/admin/digests', label: 'Weekly digest', icon: 'mail' },
    ],
  },
  {
    section: 'Website',
    items: [
      { href: '/admin/news', label: 'Club news', icon: 'megaphone' },
      { href: '/admin/articles', label: 'Articles', icon: 'article' },
      { href: '/admin/team', label: 'Team', icon: 'team' },
      { href: '/admin/newsletters', label: 'Newsletters', icon: 'newsletter' },
      { href: '/admin/skills', label: 'Skills library', icon: 'sparkles' },
      { href: '/admin/settings', label: 'Site settings', icon: 'settings', adminOnly: true },
    ],
  },
  {
    section: 'System',
    items: [{ href: '/admin/audit', label: 'Audit log', icon: 'shield', adminOnly: true }],
  },
];

const MeContext = createContext<Profile | null>(null);
/** The signed-in staff member (always set inside the admin workspace). */
export const useAdminMe = () => useContext(MeContext)!;

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void api<Profile>('/me').then((res) => {
      if (res.status === 401) router.replace('/login');
      else setMe(res.data);
    });
  }, [router]);

  useEffect(() => setOpen(false), [pathname]);

  if (me === undefined) {
    return (
      <div className="ax ax-center">
        <p className="ax-muted">Loading…</p>
      </div>
    );
  }
  if (!me || me.role === 'MEMBER') {
    return (
      <div className="ax ax-center">
        <div className="ax-card ax-pad" style={{ maxWidth: 420 }}>
          <h1 className="ax-h1">Staff only</h1>
          <p className="ax-muted">The admin workspace is for SMC admins and organizers.</p>
          <Link className="ax-btn ax-btn--primary" href="/">
            Back to the website
          </Link>
        </div>
      </div>
    );
  }

  const isActive = (href: string) =>
    href === '/admin' ? pathname === href : pathname.startsWith(href);

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <MeContext.Provider value={me}>
      <div className="ax">
        <aside className={`ax-side${open ? ' is-open' : ''}`} aria-label="Admin navigation">
          <Link href="/admin" className="ax-brand">
            <img src={SITE.logo} alt="" width={32} height={32} />
            <span>
              SMC <small>Admin</small>
            </span>
          </Link>
          <nav>
            {NAV.map((group) => {
              const items = group.items.filter((i) => !i.adminOnly || me.role === 'ADMIN');
              if (items.length === 0) return null;
              return (
                <div key={group.section} className="ax-nav-group">
                  <p className="ax-nav-label">{group.section}</p>
                  <ul>
                    {items.map((i) => (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          className={`ax-nav-link${isActive(i.href) ? ' is-active' : ''}`}
                          aria-current={isActive(i.href) ? 'page' : undefined}
                        >
                          <Icon name={i.icon} />
                          {i.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
          <div className="ax-side-foot">
            <Link href="/" className="ax-nav-link">
              <Icon name="external" />
              View website
            </Link>
          </div>
        </aside>
        {open && (
          <button className="ax-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />
        )}

        <div className="ax-main">
          <header className="ax-top">
            <button
              type="button"
              className="ax-icon-btn ax-menu-btn"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <div className="ax-top-spacer" />
            <div className="ax-user">
              <span className="ax-avatar" aria-hidden="true">
                {me.firstName.charAt(0)}
                {me.lastName.charAt(0)}
              </span>
              <span className="ax-user-text">
                <strong>
                  {me.firstName} {me.lastName}
                </strong>
                <small>{me.role === 'ADMIN' ? 'Admin' : 'Organizer'}</small>
              </span>
              <button
                type="button"
                className="ax-icon-btn"
                aria-label="Sign out"
                onClick={() => void signOut()}
              >
                <Icon name="logout" />
              </button>
            </div>
          </header>
          <main className="ax-content">{children}</main>
        </div>
      </div>
    </MeContext.Provider>
  );
}
