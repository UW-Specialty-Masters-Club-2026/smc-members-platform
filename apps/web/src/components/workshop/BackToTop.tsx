'use client';

import { useEffect, useState } from 'react';

export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 800);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <a
      href="#top"
      className={`back-to-top${show ? ' is-visible' : ''}`}
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
    >
      <span aria-hidden="true">↑</span> Back to top
    </a>
  );
}
