'use client';

import { useRouter } from 'next/navigation';
import { EventForm } from '@/components/EventForm';
import { api, type EventView } from '@/lib/api';

export default function NewEventPage() {
  const router = useRouter();
  return (
    <main className="page page--narrow" style={{ maxWidth: 640 }}>
      <h1 className="display">New event</h1>
      <p className="muted">New events start as drafts. Members see them once you publish.</p>
      <EventForm
        submitLabel="Save draft"
        onSubmit={async (body) => {
          const res = await api<EventView>('/admin/events', { method: 'POST', body });
          if (res.ok && res.data) router.push(`/admin/events/${res.data.id}`);
          return res;
        }}
      />
    </main>
  );
}
