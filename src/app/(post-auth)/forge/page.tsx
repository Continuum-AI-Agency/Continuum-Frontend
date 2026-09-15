import { redirect } from 'next/navigation';
import { ForgeTabs } from '@/components/forge/ForgeTabs';
import { TierAccessRedirect } from '@/components/ui/TierAccessRedirect';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { isTemplateForgeTier } from '@/lib/media/tier';

export const metadata = {
  title: 'Forge',
  description: 'Turn an After Effects project into a template you can render.',
};

export default async function ForgePage() {
  const { activeBrandId, activeBrandTier, brandSummaries } = await getActiveBrandContext();

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

  return (
    // The app content pane's own height, not a column: the gallery and the render grid want every
    // pixel of width, and each tab scrolls inside it so the tab strip stays put.
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full max-w-none flex-col overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">Forge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn After Effects projects into templates, fill them in, and render.
        </p>
      </header>
      <ForgeTabs
        brandId={activeBrandId}
        brandName={brandSummaries.find((brand) => brand.id === activeBrandId)?.name}
      />
    </div>
  );
}
