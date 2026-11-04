import { notFound, redirect } from 'next/navigation';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { setActiveBrandPreference } from '@/lib/brands/preferences';

// The MCP's integrations_connect link: OAuth only completes from the web app, so the
// agent hands the user here. Switch to the agent's brand first, then show the
// connect buttons (Settings → Connections; assigning to the brand is one tab over).
export const instant = false;

type IntegrationsHandoffPageProps = {
  searchParams: Promise<{ brandId?: string | string[] }>;
};

export default async function IntegrationsHandoffPage({
  searchParams,
}: IntegrationsHandoffPageProps) {
  const query = await searchParams;
  const brandId = Array.isArray(query.brandId) ? query.brandId[0] : query.brandId;
  const { brandSummaries, permissions } = await getActiveBrandContext();
  const permittedIds = new Set(permissions.map((permission) => permission.brand_profile_id));
  const accessible = brandSummaries.some(
    (brand) => brand.id === brandId && !brand.isPending && permittedIds.has(brand.id),
  );
  if (!brandId || !accessible) notFound();

  await setActiveBrandPreference(brandId);
  redirect('/settings?section=connections');
}
