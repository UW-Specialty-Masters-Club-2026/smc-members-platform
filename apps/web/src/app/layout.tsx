import type { Metadata } from 'next';
import { Anton, Inter, Montserrat } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Self-hosted at build time by next/font (no runtime request to Google).
const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-anton',
  display: 'swap',
});
const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
});
// Admin workspace UI face.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Specialty Masters Club',
  description:
    'Empowering MSBA, MSIS, MSCM & Specialty Master’s Students at UW Foster School of Business.',
  icons: { icon: '/content/2026-09-smc-logo.png' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${montserrat.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
