import { notFound, redirect } from 'next/navigation';
import { AutomationWorkspace } from '@/components/automations/workspace/AutomationWorkspace';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type AutomationWorkspacePageProps = {
  params: Promise<{ automationId: string }>;
};

export async function AutomationWorkspaceLoader({ params }: AutomationWorkspacePageProps) {
  const { automationId } = await params;
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('automations')
    .select('id, brand_id')
    .eq('id', automationId)
    .eq('brand_id', activeBrandId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load automation ${automationId}: ${error.message}`);
  if (!data) notFound();

  return <AutomationWorkspace automationId={automationId} />;
}
