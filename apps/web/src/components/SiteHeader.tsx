import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          SPECIALTY MASTERS CLUB
        </Link>
        <nav aria-label="Main">
          <Link href="/events">Events</Link>
          <Link href="/me/profile">My profile</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Join</Link>
        </nav>
      </div>
    </header>
  );
}
