import { Workflow, Zap } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AutomationTemplateGallery } from '@/components/automations/workspace/AutomationTemplateGallery';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AutomationsPage() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('automations')
    .select('id, name, enabled, updated_at')
    .eq('brand_id', activeBrandId)
    .order('updated_at', { ascending: false });

  // A failed read must not masquerade as an empty list; error.tsx owns the retry.
  if (error) {
    throw new Error(`Failed to load automations for brand ${activeBrandId}: ${error.message}`);
  }

  return (
    <main className="min-h-dvh bg-background px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-500">
              Automations
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Workflow operations</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Connect triggers, live brand context, agents, logic, reports, and outcomes in an open
              canvas. Published workflows stay locked until you unpublish them.
            </p>
          </div>
        </div>
        <AutomationTemplateGallery brandId={activeBrandId} />
        {data?.length ? (
          <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.map((automation) => (
              <Link
                key={automation.id}
                href={`/automations/${automation.id}`}
                className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-violet-500/40 hover:bg-violet-500/[0.03]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-500">
                    <Workflow className="h-4 w-4" />
                  </span>
                  <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Workflow
                  </span>
                </div>
                <h2 className="mt-5 font-medium">{automation.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {automation.enabled ? 'Enabled' : 'Paused'} · Updated{' '}
                  {new Date(automation.updated_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-12 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed text-center">
            <Zap className="h-7 w-7 text-violet-500" />
            <h2 className="mt-4 font-medium">No workflows yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Start with the blank canvas or choose a workflow template above. Automations are
              created and managed here independently from agent chats.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
