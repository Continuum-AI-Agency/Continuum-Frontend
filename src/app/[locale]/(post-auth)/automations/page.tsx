import { Workflow, Zap } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AutomationTemplateGallery } from '@/components/automations/workspace/AutomationTemplateGallery';
import { Link } from '@/i18n/navigation';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AutomationsPage() {
  const uiText = await getTranslations('automations');
  const uiLocale = await getLocale();
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
              {uiText('automations_ad1fb9e')}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {uiText('workflow_operations_5224579')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {uiText('connect_triggers_live_brand_context_agents_lo_bb83e15')}
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
                  <span className="rounded-full border px-2 py-0.5 text-2xs uppercase tracking-wider text-muted-foreground">
                    {uiText('workflow_2e2d5c5')}
                  </span>
                </div>
                <h2 className="mt-5 font-medium">{automation.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {uiText.rich('sentence_a67d86298323', {
                    v0: () =>
                      automation.enabled ? uiText('enabled_92c1cdf') : uiText('paused_e159b06'),
                    v1: () => new Date(automation.updated_at).toLocaleDateString(uiLocale),
                  })}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-12 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed text-center">
            <Zap className="h-7 w-7 text-violet-500" />
            <h2 className="mt-4 font-medium">{uiText('no_workflows_yet_d3e72e0')}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {uiText('start_with_the_blank_canvas_or_choose_a_workf_8485f4c')}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
