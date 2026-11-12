import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getServerUser } from '@/lib/supabase/server';
import { DriveSettings } from './DriveSettings';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('metadataDrive') };
}

export default async function DriveSettingsPage() {
  const tUi = await getTranslations('settings');

  const user = await getServerUser();
  const email = user?.email ?? tUi('m_ba10ca9cf0');

  return (
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full max-w-none flex-col overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <header className="mb-3 shrink-0 space-y-1">
        <h1 className="text-xl font-semibold text-white">{tUi('m_a02bb45937')}</h1>
        <p className="text-muted-foreground">{tUi('m_58b7f1f560')}</p>
      </header>

      <div className="min-h-0 flex-1 space-y-[var(--page-section-gap)] overflow-y-auto overscroll-contain">
        <DriveSettings email={email} />
      </div>
    </div>
  );
}
