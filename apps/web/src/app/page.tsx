export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          textTransform: 'uppercase',
          fontSize: 56,
          margin: 0,
        }}
      >
        Specialty Masters Club
      </h1>
      <p style={{ color: 'var(--smc-body)' }}>UW Foster School of Business · Seattle, WA</p>
    </main>
  );
}
