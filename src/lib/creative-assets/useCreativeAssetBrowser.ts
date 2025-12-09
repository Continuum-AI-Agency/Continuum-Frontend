"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createSignedAssetUrl,
  deleteCreativeAsset,
  listCreativeAssets,
  createCreativeFolder,
  renameCreativeAsset,
  uploadCreativeAsset,
} from "./storageClient";
import { resolveStoragePath } from "./config";
import type { CreativeAsset } from "./types";

type BrowserState = {
  loading: boolean;
  error: string | null;
  assets: CreativeAsset[];
  folderSegments: string[];
};

export function useCreativeAssetBrowser(brandProfileId: string) {
  const [state, setState] = useState<BrowserState>({
    loading: true,
    error: null,
    assets: [],
    folderSegments: [],
  });

  const folderPath = useMemo(
    () => state.folderSegments.join("/"),
    [state.folderSegments]
  );

  const breadcrumbs = useMemo(() => {
    const segments = ["Root", ...state.folderSegments];
    const paths = segments.map((_, index) =>
      index === 0 ? "" : state.folderSegments.slice(0, index).join("/")
    );
    return segments.map((label, index) => ({
      label,
      path: paths[index] ?? "",
    }));
  }, [state.folderSegments]);

  const loadFolder = useCallback(
    async (path: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const listing = await listCreativeAssets(brandProfileId, path);
        const segments = path ? path.split("/").filter(Boolean) : [];
        setState({
          loading: false,
          error: null,
          assets: listing.assets,
          folderSegments: segments,
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: (error as Error)?.message ?? "Failed to load assets",
        }));
      }
    },
    [brandProfileId]
  );

  useEffect(() => {
    void loadFolder(folderPath);
  }, [folderPath, loadFolder]);

  const refresh = useCallback(async () => {
    await loadFolder(folderPath);
  }, [folderPath, loadFolder]);

  const navigateTo = useCallback(
    async (path: string) => {
      await loadFolder(path);
    },
    [loadFolder]
  );

  const navigateInto = useCallback(
    async (asset: CreativeAsset) => {
      if (asset.kind !== "folder") return;
      const nextPath = resolveStoragePath("", folderPath, asset.name).replace(/^\//, "");
      await loadFolder(nextPath);
    },
    [folderPath, loadFolder]
  );

  const navigateUp = useCallback(async () => {
    if (state.folderSegments.length === 0) return;
    const nextSegments = state.folderSegments.slice(0, -1);
    await loadFolder(nextSegments.join("/"));
  }, [state.folderSegments, loadFolder]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        await uploadCreativeAsset(brandProfileId, folderPath, file);
      }
      await refresh();
    },
    [brandProfileId, folderPath, refresh]
  );

  const renameAssetPath = useCallback(
    async (asset: CreativeAsset, nextName: string) => {
      const destination = await renameCreativeAsset(brandProfileId, asset.fullPath, nextName);
      await refresh();
      return destination;
    },
    [brandProfileId, refresh]
  );

  const deleteAssetPath = useCallback(
    async (asset: CreativeAsset) => {
      await deleteCreativeAsset(asset.fullPath);
      await refresh();
    },
    [refresh]
  );

  const signedUrl = useCallback(async (asset: CreativeAsset, expiresInSeconds = 60) => {
    return createSignedAssetUrl(asset.fullPath, expiresInSeconds);
  }, []);

  const createFolder = useCallback(
    async (name: string) => {
      await createCreativeFolder(brandProfileId, folderPath, name);
      await refresh();
    },
    [brandProfileId, folderPath, refresh]
  );

  return {
    loading: state.loading,
    error: state.error,
    assets: state.assets,
    breadcrumbs,
    folderPath,
    refresh,
    navigateTo,
    navigateInto,
    navigateUp,
    uploadFiles,
    renameAssetPath,
    deleteAssetPath,
    signedUrl,
    createFolder,
  };
}
