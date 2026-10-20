'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type Profile } from '@/lib/api';

/** Site navigation; shows sign-in links to visitors and the staff workspace to staff. */
export function SiteHeader() {
  const pathname = usePathname();
  const [me, setMe] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    void api<Profile>('/me').then((res) => setMe(res.ok ? res.data : null));
  }, [pathname]);

  const staff = me && me.role !== 'MEMBER';
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          SPECIALTY MASTERS CLUB
        </Link>
        <nav aria-label="Main">
          <Link href="/events">Events</Link>
          <Link href="/news">News</Link>
          {staff && <Link href="/admin/digests">Digest</Link>}
          {staff && <Link href="/admin/events">Manage events</Link>}
          {me ? (
            <Link href="/me/profile">My profile</Link>
          ) : me === null ? (
            <>
              <Link href="/login">Sign in</Link>
              <Link href="/signup">Join</Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
