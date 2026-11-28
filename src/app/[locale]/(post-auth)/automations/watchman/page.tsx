import { redirect } from 'next/navigation';
import { WatchmanOperator } from '@/components/watchman/WatchmanOperator';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function WatchmanPage() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');

  return (
    <div className="h-[var(--app-content-h)] min-h-0 px-[var(--shell-gutter)] py-[var(--app-shell-pad-block)]">
      <WatchmanOperator brandId={activeBrandId} />
    </div>
  );
}
