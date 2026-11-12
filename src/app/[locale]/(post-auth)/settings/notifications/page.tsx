import type { Metadata } from 'next';

import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { NotificationPreferences } from '@/components/notifications/NotificationPreferences';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('metadataNotifications') };
}

export default function NotificationSettingsPage() {
  const tUi = useTranslations('settings');

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-lg font-semibold">{tUi('m_753a22b2eb')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{tUi('m_014e36fa40')}</p>
      <NotificationPreferences />
    </main>
  );
}
