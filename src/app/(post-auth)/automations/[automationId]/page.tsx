import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AutomationWorkspace } from '@/components/automations/workspace/AutomationWorkspace';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type AutomationWorkspacePageProps = {
  params: Promise<{ automationId: string }>;
};

// Exported for route-boundaries.test.tsx: the redirect/notFound/throw contract
// lives here now that the default export is just the Suspense wrapper.
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

  // A failed read is not the same as a missing workflow: one is retryable, one is a 404.
  if (error) {
    throw new Error(`Failed to load automation ${automationId}: ${error.message}`);
  }
  if (!data) notFound();

  return <AutomationWorkspace automationId={automationId} />;
}

// The page awaits nothing: params and the brand context are resolved inside the
// boundary, so everything above it prerenders as the shell.
export default function AutomationWorkspacePage(props: AutomationWorkspacePageProps) {
  return (
    <Suspense fallback={null}>
      <AutomationWorkspaceLoader {...props} />
    </Suspense>
  );
}
