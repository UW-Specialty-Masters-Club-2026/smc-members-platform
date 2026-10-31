import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from './AdminShell';
import './admin.css';

export const metadata: Metadata = { title: 'Admin · Specialty Masters Club' };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
