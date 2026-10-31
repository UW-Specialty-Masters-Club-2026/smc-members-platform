import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'SMC weekly digest' };

/** "View in browser" target from the email footer. Shows the issue as sent, without recipient data. */
export default async function DigestInBrowserPage({
  params,
}: {
  params: Promise<{ weekKey: string }>;
}) {
  const { weekKey } = await params;
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(weekKey) ? weekKey : 'invalid';
  return (
    <main style={{ background: '#EFE7FA', padding: '16px 0' }}>
      <iframe
        title="SMC weekly digest"
        src={`/api/digest/${safe}/html`}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        style={{
          display: 'block',
          width: '100%',
          maxWidth: 720,
          height: 2400,
          border: 0,
          margin: '0 auto',
          background: '#EFE7FA',
        }}
      />
    </main>
  );
}
