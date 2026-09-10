import { redirect } from 'next/navigation';
import { ForgeWorkbench } from '@/components/forge/ForgeWorkbench';
import { TierAccessRedirect } from '@/components/ui/TierAccessRedirect';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { isTemplateForgeTier } from '@/lib/media/tier';

export const metadata = {
  title: 'Forge',
  description: 'Turn an After Effects project into a template you can render.',
};

export default async function ForgePage() {
  const { activeBrandId, activeBrandTier } = await getActiveBrandContext();

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
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Forge</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Upload an After Effects project and watch it become a template. Everything the designer
          left adjustable shows up here as a variable you can name, give a meaning, and give a
          default — and once it is published, it is selectable from the API render node on the
          canvas.
        </p>
      </header>
      <ForgeWorkbench brandId={activeBrandId} />
    </div>
  );
}
