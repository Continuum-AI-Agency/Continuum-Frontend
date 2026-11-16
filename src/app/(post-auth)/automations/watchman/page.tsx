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
    <main className="min-h-dvh bg-background px-6 py-8 md:px-10">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-500">
          Automations
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Watchman</h1>
        <p className="mt-2 mb-8 max-w-2xl text-sm text-muted-foreground">
          The brand&apos;s always-on agent: what it may do on its own, what waits for your approval,
          and every wake with its calls and cost. Brand admins only.
        </p>
        <WatchmanOperator brandId={activeBrandId} />
      </div>
    </main>
  );
}
