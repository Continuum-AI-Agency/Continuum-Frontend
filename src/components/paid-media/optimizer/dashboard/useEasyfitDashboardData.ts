'use client';

// React Query reads and the one write of the Easy Fit dashboard. The payload is recomputed
// once a day (07:40 Mexico City), so a long freshness window is honest; the config is what
// the edit panel writes, and a save replaces the cached copy with the server's answer.

import type { EasyfitPilotConfig } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getEasyfitConfig, getEasyfitDashboard, putEasyfitConfig } from '@/lib/api/easyfit.client';
import { isAdminUser } from '@/lib/brands/brand-switcher-utils';
import { useBrandRole } from '@/lib/library/useBrandRole';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const easyfitQueryKeys = {
  dashboard: (brandId: string) => ['easyfit', 'dashboard', brandId] as const,
  config: (brandId: string) => ['easyfit', 'config', brandId] as const,
};

export function useEasyfitDashboard(brandId: string) {
  return useQuery({
    queryKey: easyfitQueryKeys.dashboard(brandId),
    queryFn: ({ signal }) => getEasyfitDashboard(signal),
    staleTime: FIFTEEN_MINUTES,
  });
}

export function useEasyfitConfig(brandId: string) {
  return useQuery({
    queryKey: easyfitQueryKeys.config(brandId),
    queryFn: ({ signal }) => getEasyfitConfig(signal),
    staleTime: FIFTEEN_MINUTES,
  });
}

export function useSaveEasyfitConfig(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: EasyfitPilotConfig) => putEasyfitConfig(config),
    onSuccess: (saved) => {
      queryClient.setQueryData(easyfitQueryKeys.config(brandId), saved);
    },
  });
}

/** Whether the signed-in user is Continuum staff (an app admin). Read from the local session,
 *  no network call; false until it resolves. */
function useIsContinuumStaff(): boolean {
  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setIsStaff(isAdminUser(data.session?.user));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return isStaff;
}

/** Continuum staff and the brand's owners/admins may edit the pilot config. Presentation only:
 *  PUT /easyfit/config refuses anyone else with a 403, which the panel reports. */
export function useCanEditEasyfitConfig(brandId: string): boolean {
  const role = useBrandRole(brandId);
  const isStaff = useIsContinuumStaff();
  return isStaff || role === 'owner' || role === 'admin';
}
