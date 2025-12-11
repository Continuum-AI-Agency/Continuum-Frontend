"use client";

import { useEffect, useMemo, useState } from "react";

import { createSignedAssetUrl, getPublicAssetUrl } from "./storageClient";
import type { CreativeAsset } from "./types";

type PreviewOptions = {
  expiresInSeconds?: number;
};

export function useAssetPreviewUrl(asset: CreativeAsset | null, options: PreviewOptions = {}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const shouldPreview = useMemo(() => {
    if (!asset) return false;
    if (asset.kind !== "file") return false;
    const contentType = asset.contentType ?? "";
    return contentType.startsWith("image/") || contentType.startsWith("video/");
  }, [asset]);

  useEffect(() => {
    let cancelled = false;
    if (!asset || !shouldPreview) {
      setUrl(null);
      setLoading(false);
      return undefined;
    }

    const resolveUrl = async () => {
      setLoading(true);
      try {
        if (process.env.NEXT_PUBLIC_SUPABASE_STORAGE_PUBLIC === "true") {
          const publicUrl = await getPublicAssetUrl(asset.fullPath);
          if (!cancelled) setUrl(publicUrl);
          return;
        }
        const signed = await createSignedAssetUrl(asset.fullPath, options.expiresInSeconds ?? 600);
        if (!cancelled) setUrl(signed);
      } catch (error) {
        try {
          const fallback = await getPublicAssetUrl(asset.fullPath);
          if (!cancelled) setUrl(fallback);
        } catch (err) {
          console.error("preview url resolution failed", error ?? err);
          if (!cancelled) setUrl(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void resolveUrl();
    return () => {
      cancelled = true;
    };
  }, [asset, options.expiresInSeconds, shouldPreview]);

  return { url, loading, canPreview: shouldPreview };
}
