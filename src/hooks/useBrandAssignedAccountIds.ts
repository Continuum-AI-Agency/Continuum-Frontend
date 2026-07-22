'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

async function fetchBrandAssignedAccountIds(brandId: string): Promise<string[]> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('brand_profile_integration_accounts')
    .select('integration_account_id')
    .eq('brand_profile_id', brandId);

  if (error) throw error;
  return (data ?? []).map((row: { integration_account_id: string }) => row.integration_account_id);
}

export function useBrandAssignedAccountIds(brandId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['brand-assigned-account-ids', brandId],
    queryFn: () => (brandId ? fetchBrandAssignedAccountIds(brandId) : Promise.resolve([])),
    enabled: Boolean(brandId),
  });

  return {
    assignedIds: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: () =>
      brandId
        ? queryClient.invalidateQueries({ queryKey: ['brand-assigned-account-ids', brandId] })
        : Promise.resolve(),
  };
}
