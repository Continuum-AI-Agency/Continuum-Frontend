import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useSelectableAssets } from "@/lib/api/integrations";
import { getSelectableAssetsFlatList } from "@/lib/integrations/selectableAssets";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import type { OnboardingState } from "@/lib/onboarding/state";
import type { PlatformKey } from "../platforms";
import { mergeSelectableAssetsConnections } from "../selectableAssetsMerge";

const SELECTABLE_ASSETS_QUERY_KEY = ["selectable-assets"] as const;

type UseSelectableAssetsStateParams = {
  currentUserId?: string;
  brandId: string;
  setState: Dispatch<SetStateAction<OnboardingState>>;
  selectedAccountIdsByKeyRef: MutableRefObject<Record<PlatformKey, Set<string>>>;
};

type UseSelectableAssetsStateResult = {
  selectableAssetsQuery: ReturnType<typeof useSelectableAssets>;
  selectableAssetsFlatList: ReturnType<typeof getSelectableAssetsFlatList>;
  selectableAccountIdToPlatformKey: Map<string, PlatformKey>;
  isHydrated: boolean;
  refetchSelectableAssets: () => Promise<void>;
};

export function useSelectableAssetsState({
  currentUserId,
  brandId,
  setState,
  selectedAccountIdsByKeyRef,
}: UseSelectableAssetsStateParams): UseSelectableAssetsStateResult {
  const queryClient = useQueryClient();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(false);
  }, [brandId]);

  const selectableAssetsQuery = useSelectableAssets(currentUserId ?? undefined, {
    enabled: Boolean(currentUserId),
    staleTimeMs: 5 * 60 * 1000,
    gcTimeMs: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const selectableAssetsFlatList = useMemo(
    () => (selectableAssetsQuery.data ? getSelectableAssetsFlatList(selectableAssetsQuery.data) : []),
    [selectableAssetsQuery.data]
  );

  const selectableAccountIdToPlatformKey = useMemo(() => {
    const map = new Map<string, PlatformKey>();
    selectableAssetsFlatList.forEach(asset => {
      if (!asset.integration_account_id) return;
      const key = mapIntegrationTypeToPlatformKey(asset.type);
      if (!key) return;
      map.set(asset.integration_account_id, key);
    });
    return map;
  }, [selectableAssetsFlatList]);

  const refetchSelectableAssets = useCallback(async () => {
    try {
      await selectableAssetsQuery.refetch();
    } catch {
      // Keep existing assets visible if the refresh fails.
    }
  }, [selectableAssetsQuery]);

  useEffect(() => {
    if (!isHydrated && selectableAssetsQuery.isSuccess) {
      setIsHydrated(true);
    }
  }, [isHydrated, selectableAssetsQuery.isSuccess]);

  const isHydratedEffective = isHydrated || selectableAssetsQuery.isSuccess;

  useEffect(() => {
    if (!selectableAssetsQuery.data) return;

    setState(prev => {
      const nextConnections = mergeSelectableAssetsConnections({
        prevConnections: prev.connections,
        selectableAssets: selectableAssetsFlatList,
        selectableAssetsData: selectableAssetsQuery.data,
        selectedAccountIdsByKey: selectedAccountIdsByKeyRef.current,
        isHydrated: isHydratedEffective,
      });

      if (!nextConnections) return prev;

      return {
        ...prev,
        connections: nextConnections,
      };
    });
  }, [isHydratedEffective, selectableAssetsFlatList, selectableAssetsQuery.data, selectedAccountIdsByKeyRef, setState]);

  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: SELECTABLE_ASSETS_QUERY_KEY });
    };
  }, [queryClient]);

  return {
    selectableAssetsQuery,
    selectableAssetsFlatList,
    selectableAccountIdToPlatformKey,
    isHydrated,
    refetchSelectableAssets,
  };
}
