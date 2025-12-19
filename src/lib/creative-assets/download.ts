"use client";

import type { CreativeAsset } from "./types";
import { createSignedDownloadUrl, getPublicAssetDownloadUrl } from "./storageClient";

export type CreativeAssetDownloadUrlDependencies = {
  createSignedDownloadUrl: (fullPath: string, expiresInSeconds: number, fileName: string) => Promise<string>;
  getPublicAssetDownloadUrl: (fullPath: string, fileName: string) => Promise<string>;
  isPublicBucket: () => boolean;
};

const defaultDependencies: CreativeAssetDownloadUrlDependencies = {
  createSignedDownloadUrl,
  getPublicAssetDownloadUrl,
  isPublicBucket: () => process.env.NEXT_PUBLIC_SUPABASE_STORAGE_PUBLIC === "true",
};

export async function resolveCreativeAssetDownloadUrl(
  asset: CreativeAsset,
  options: { expiresInSeconds?: number; dependencies?: Partial<CreativeAssetDownloadUrlDependencies> } = {}
): Promise<string> {
  if (asset.kind !== "file") {
    throw new Error(`Cannot download non-file asset: ${asset.kind}`);
  }

  const expiresInSeconds = options.expiresInSeconds ?? 600;
  const deps = { ...defaultDependencies, ...(options.dependencies ?? {}) };

  if (deps.isPublicBucket()) {
    return deps.getPublicAssetDownloadUrl(asset.fullPath, asset.name);
  }

  return deps.createSignedDownloadUrl(asset.fullPath, expiresInSeconds, asset.name);
}

export function triggerBrowserDownload(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener noreferrer";
  anchor.target = "_blank";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

