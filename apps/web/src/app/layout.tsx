import type { Metadata } from 'next';
import { Anton, Montserrat } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
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

export const metadata: Metadata = {
  title: 'Specialty Masters Club',
  description: 'Members and events for UW Foster Specialty Master’s students',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${montserrat.variable}`}>
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
