'use client';

import { useState } from 'react';
import { uploadImage } from '@/lib/upload';

/** Image URL input with an upload button, for uncontrolled forms (submits as `name`). */
export function ImageField(props: { name: string; label: string; defaultValue?: string | null }) {
  const [url, setUrl] = useState(props.defaultValue ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="field">
      <label htmlFor={`img-${props.name}`}>{props.label}</label>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {url && (
          <img
            src={url}
            alt=""
            width={64}
            height={64}
            style={{ objectFit: 'cover', borderRadius: 8 }}
          />
        )}
        <div style={{ display: 'grid', gap: 8, flex: 1 }}>
          <input
            id={`img-${props.name}`}
            name={props.name}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… or upload"
          />
          <label
            className="btn btn--outline btn--small"
            style={{ justifySelf: 'start', cursor: 'pointer' }}
          >
            {busy ? 'Uploading…' : 'Upload image'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError(null);
                const r = await uploadImage(file);
                setBusy(false);
                if ('url' in r) setUrl(r.url);
                else setError(r.error);
                e.target.value = '';
              }}
            />
          </label>
          {error && <small style={{ color: '#b42318' }}>{error}</small>}
        </div>
      </div>
    </div>
  );
}
