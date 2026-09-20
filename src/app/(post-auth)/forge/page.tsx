import { redirect } from 'next/navigation';
import { ForgeTabs } from '@/components/forge/ForgeTabs';
import { MetaWritesSwitch } from '@/components/forge/MetaWritesSwitch';
import { TierAccessRedirect } from '@/components/ui/TierAccessRedirect';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { isTemplateForgeTier } from '@/lib/media/tier';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Forge',
  description: 'Turn an After Effects project into a template you can render.',
};

export default async function ForgePage() {
  const { activeBrandId, activeBrandTier, brandSummaries, permissions } =
    await getActiveBrandContext();

  if (!activeBrandId) {
    redirect('/onboarding');
  }

  // The courtesy, not the boundary. Every route this page calls checks the tier again on the
  // server (`assertTemplateForgeTier`), because a redirect has never stopped anyone holding a
  // bearer token and a brand id — and this capability provisions collections and workflows in a
  // shared render workspace.
  if (!isTemplateForgeTier(activeBrandTier)) {
    return (
      <TierAccessRedirect description="Forge is available on Tier 3. Please contact an Administrator." />
    );
  }

  // Whether this brand may publish to its own ad account. Read here, on the page that asks the
  // question, rather than threaded through the tabs: it is one indexed row and the switch is the
  // only thing that uses it. RLS gives the write to owner/admin, so the control matches.
  const supabase = await createSupabaseServerClient();
  const { data: brandRow } = await supabase
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('meta_writes_allowed')
    .eq('id', activeBrandId)
    .maybeSingle();
  const role = permissions.find((entry) => entry.brand_profile_id === activeBrandId)?.role ?? null;

  return (
    // The app content pane's own height, not a column: the gallery and the render grid want every
    // pixel of width, and each tab scrolls inside it so the tab strip stays put.
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full max-w-none flex-col overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <header className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forge</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn After Effects projects into templates, fill them in, and render.
          </p>
        </div>
        <MetaWritesSwitch
          brandId={activeBrandId}
          allowed={brandRow?.meta_writes_allowed === true}
          canEdit={role === 'owner' || role === 'admin'}
        />
      </header>
      <ForgeTabs
        brandId={activeBrandId}
        brandName={brandSummaries.find((brand) => brand.id === activeBrandId)?.name}
      />
    </div>
  );
}
