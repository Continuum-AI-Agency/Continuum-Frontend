import { notFound, redirect } from 'next/navigation';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { resolvePlannerHandoff } from '@/lib/brands/planner-handoff';
import { setActiveBrandPreference } from '@/lib/brands/preferences';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type PlannerHandoffPageProps = {
  searchParams: Promise<{ brandId?: string | string[]; draftId?: string | string[] }>;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function PlannerHandoffPage({ searchParams }: PlannerHandoffPageProps) {
  const query = await searchParams;
  const brandId = first(query.brandId);
  const draftId = first(query.draftId) || undefined;
  const { brandSummaries, permissions } = await getActiveBrandContext();
  const permittedIds = new Set(permissions.map((permission) => permission.brand_profile_id));
  const accessibleBrandIds = brandSummaries
    .filter((brand) => !brand.isPending && permittedIds.has(brand.id))
    .map((brand) => brand.id);

  let draftBrandId: string | null | undefined;
  if (draftId) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .schema('organic')
      .from('organic_calendar_drafts')
      .select('brand_id')
      .eq('id', draftId)
      .maybeSingle();
    if (error) notFound();
    draftBrandId = data?.brand_id ?? null;
  }

  let handoff;
  try {
    handoff = resolvePlannerHandoff({
      brandId,
      draftId,
      accessibleBrandIds,
      draftBrandId,
    });
  } catch {
    notFound();
  }

  await setActiveBrandPreference(handoff.brandId);
  redirect(handoff.destination);
}
