import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page">
      <h1 className="display">Specialty Masters Club</h1>
      <p className="muted">
        Events, news and community for UW Foster Specialty Master’s students. UW Foster School of
        Business · Seattle, WA.
      </p>
      <p>
        <Link className="btn" href="/signup">
          Join SMC
        </Link>
      </p>
    </main>
  );
}
