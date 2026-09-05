'use client';

// The real data sources behind the automation action pickers. Each one is the
// SAME read the owning surface already uses — the Library page's collections
// endpoint, the brand-integration summary the planner and the ad-account
// selector share, and the optimizer's own portfolio list — so a picker can never
// offer a target its surface would reject.
//
// They are injected into the pickers as props so a test can substitute a pure
// stub without a process-wide module mock.

import type { MediaCollection } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useOptimizerPortfolios } from '@/components/paid-media/optimizer/useOptimizerData';
import { useBrandIntegrations } from '@/hooks/useBrandIntegrations';
import { fetchBrandPipelines, type PipelineItem } from '@/lib/ai-studio/pipelines';
import { fetchLibraryCollections } from '@/lib/library/collections';
import {
  deriveOrganicPlatformAccounts,
  deriveOrganicPublishAccountOptions,
  type OrganicPlatformAccounts,
  type OrganicPublishAccountOption,
} from '@/lib/organic/platformAccountOptions';
import { ORGANIC_PLATFORM_KEYS } from '@/lib/organic/platforms';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { PickerSourceState } from './pickerSource';

export type PortfolioOption = {
  id: string;
  name: string;
  adAccountId: string | null;
};

export function useLibraryCollectionSource(
  brandId: string | undefined,
): PickerSourceState<MediaCollection> {
  const query = useQuery({
    queryKey: ['automation-picker', 'library-collections', brandId],
    queryFn: () => fetchLibraryCollections(brandId as string),
    enabled: Boolean(brandId),
    staleTime: 60_000,
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useOrganicPublishAccountSource(
  brandId: string | undefined,
): PickerSourceState<OrganicPublishAccountOption> {
  const { integrations, isLoading, isError } = useBrandIntegrations(brandId);
  const items = useMemo(() => deriveOrganicPublishAccountOptions(integrations), [integrations]);
  return { items, isLoading, isError };
}

/** Planner drafts may target any organic platform, not just the publishable
 *  three, so this source keeps every platform row and lets the picker mark the
 *  non-MVP ones unavailable. */
export function useOrganicPlatformAccountSource(
  brandId: string | undefined,
): PickerSourceState<OrganicPlatformAccounts> {
  const { integrations, isLoading, isError } = useBrandIntegrations(brandId);
  const items = useMemo(
    () =>
      deriveOrganicPlatformAccounts({
        integrationSummary: integrations,
        platforms: ORGANIC_PLATFORM_KEYS,
      }),
    [integrations],
  );
  return { items, isLoading, isError };
}

export type CanvasRoomOption = {
  id: string;
  name: string;
};

/** AI Studio workspaces (`brand_profiles.canvas_rooms`) a generated asset can be
 *  attributed to. Read through React Query rather than the canvas's own
 *  `useCanvasRooms`, which reports a failure by toasting and returning an empty
 *  list — a picker needs to tell "no workspaces" apart from "could not load". */
export function useAiStudioRoomSource(
  brandId: string | undefined,
): PickerSourceState<CanvasRoomOption> {
  const query = useQuery({
    queryKey: ['automation-picker', 'canvas-rooms', brandId],
    queryFn: async (): Promise<CanvasRoomOption[]> => {
      const { data, error } = await createSupabaseBrowserClient()
        .schema('brand_profiles')
        .from('canvas_rooms')
        .select('id, name')
        .eq('brand_profile_id', brandId as string)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(brandId),
    staleTime: 60_000,
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** Published pipelines (`canvas_workflows.metadata.pipeline`) an automation may
 *  run headlessly. Filtered on the publish flag, not on "has ports": a saved
 *  Technique is a person's building block, and offering one here would let a
 *  schedule run a canvas nobody promised a machine could run. */
export function usePipelineSource(
  brandId: string | undefined,
): PickerSourceState<PipelineItem> {
  const query = useQuery({
    queryKey: ['automation-picker', 'pipelines', brandId],
    queryFn: () => fetchBrandPipelines(brandId as string),
    enabled: Boolean(brandId),
    staleTime: 60_000,
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useOptimizerPortfolioSource(
  brandId: string | undefined,
): PickerSourceState<PortfolioOption> {
  // `null` ad account = every portfolio the brand owns; an automation is not
  // scoped to whichever account the optimizer surface happens to be showing.
  const query = useOptimizerPortfolios(brandId ?? '', null);
  const items = useMemo(
    () =>
      query.data.map((portfolio) => ({
        id: portfolio.id,
        name: portfolio.name,
        adAccountId: portfolio.ad_account_id,
      })),
    [query.data],
  );
  return { items, isLoading: query.isLoading, isError: query.isError };
}
