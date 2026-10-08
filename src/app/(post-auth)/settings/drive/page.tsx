import type { Metadata } from 'next';
import { getServerUser } from '@/lib/supabase/server';
import { DriveSettings } from './DriveSettings';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: 'Drive | Continuum AI',
};

export default async function DriveSettingsPage() {
  const user = await getServerUser();
  const email = user?.email ?? 'your Continuum login email';

  return (
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full max-w-none flex-col overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <header className="mb-3 shrink-0 space-y-1">
        <h1 className="text-xl font-semibold text-white">Drive</h1>
        <p className="text-muted-foreground">
          Reach your brand Libraries from Finder, File Explorer, or the command line.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-[var(--page-section-gap)] overflow-y-auto overscroll-contain">
        <DriveSettings email={email} />
      </div>
    </div>
  );
}
