'use client';

import { useState } from 'react';

/** A prompt or template with a copy-to-clipboard button. */
export function CopyBlock({
  label,
  text,
  source,
  file,
}: {
  label: string;
  text: string;
  source?: string;
  /** Shown as a filename tab instead of a label, for Markdown templates. */
  file?: boolean;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <figure className="copy-block">
      <figcaption className="copy-block__bar">
        <span className={file ? 'copy-block__file' : 'copy-block__label'}>{label}</span>
        <button type="button" className="copy-block__btn" onClick={copy}>
          {status === 'copied' ? 'Copied' : status === 'failed' ? 'Select & copy' : 'Copy'}
          <span className="sr-only"> {label}</span>
        </button>
      </figcaption>
      <pre className="copy-block__text">{text}</pre>
      {source && <p className="copy-block__source">{source}</p>}
      <span className="sr-only" role="status">
        {status === 'copied' ? `${label} copied to clipboard` : ''}
      </span>
    </figure>
  );
}
