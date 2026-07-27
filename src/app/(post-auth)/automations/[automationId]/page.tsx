import { redirect } from 'next/navigation';
import { AutomationWorkspace } from '@/components/automations/workspace/AutomationWorkspace';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export default async function AutomationWorkspacePage({
  params,
}: {
  params: Promise<{ automationId: string }>;
}) {
  const { automationId } = await params;
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .schema('brand_profiles')
    .from('automations')
    .select('id, brand_id')
    .eq('id', automationId)
    .eq('brand_id', activeBrandId)
    .maybeSingle();

  if (!data) redirect('/automations');

  return <AutomationWorkspace automationId={automationId} />;
}
