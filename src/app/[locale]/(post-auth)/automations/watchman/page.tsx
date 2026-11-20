import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { WatchmanOperator } from '@/components/watchman/WatchmanOperator';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function WatchmanPage() {
  const uiText = await getTranslations('automations');
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');

  return (
    <main className="min-h-dvh bg-background px-6 py-8 md:px-10">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-500">
          {uiText('automations_ad1fb9e')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Watchman</h1>
        <p className="mt-2 mb-8 max-w-2xl text-sm text-muted-foreground">
          {uiText('the_brand_s_always_on_agent_what_it_may_do_on_ae852ae')}
        </p>
        <WatchmanOperator brandId={activeBrandId} />
      </div>
    </main>
  );
}
