import type { Metadata } from 'next';
import { NotificationPreferences } from '@/components/notifications/NotificationPreferences';

export const metadata: Metadata = {
  title: 'Notifications | Continuum AI',
};

export default function NotificationSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-lg font-semibold">Notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose where each kind of update reaches you, and how often. Digests group everything
        waiting into one message.
      </p>
      <NotificationPreferences />
    </main>
  );
}
