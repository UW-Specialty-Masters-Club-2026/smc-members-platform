'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** The member's personal check-in QR. An organizer scans it with their phone camera. */
export function CheckInCode({
  url,
  checkedInAt,
  opensAt,
}: {
  url: string;
  checkedInAt: string | null;
  opensAt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    void QRCode.toDataURL(url, {
      margin: 2,
      width: 240,
      errorCorrectionLevel: 'M',
      color: { dark: '#2D0A68', light: '#FFFFFF' },
    }).then(setSrc);
  }, [url]);

  if (checkedInAt) {
    return (
      <div className="notice" role="status">
        You’re checked in. Enjoy the event!
      </div>
    );
  }

  return (
    <section className="checkin-code" aria-labelledby="checkin-title">
      <h2 id="checkin-title">Your check-in code</h2>
      {src ? (
        <img src={src} width={240} height={240} alt="Your personal check-in QR code" />
      ) : (
        <div style={{ width: 240, height: 240 }} aria-hidden="true" />
      )}
      <p className="muted">
        Show this to an SMC organizer at the door. Check-in opens{' '}
        {new Date(opensAt).toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })}{' '}
        PT. Please don’t share it — it’s tied to your registration.
      </p>
    </section>
  );
}
