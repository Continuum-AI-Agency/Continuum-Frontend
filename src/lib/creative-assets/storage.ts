"use client";

import type { FileObject } from "@supabase/storage-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { getCreativeAssetsBucket, resolveStoragePath } from "./config";
import type {
  CreativeAsset,
  CreativeAssetListing,
  UploadResult,
} from "./types";

type ListOptions = {
  limit?: number;
  offset?: number;
};

function mapStorageListing(
  brandProfileId: string,
  folder: string,
  items: FileObject[]
): CreativeAsset[] {
  return items.map((item) => {
    const parentPath = resolveStoragePath(brandProfileId, folder);
    const fullPath = resolveStoragePath(brandProfileId, folder, item.name);
    const isFile = Boolean(item.id);
    const size = typeof item.metadata?.size === "number" ? item.metadata.size : null;
    const mime =
      typeof item.metadata?.mimetype === "string"
        ? item.metadata.mimetype
        : null;
    return {
      id: item.id ?? fullPath,
      name: item.name,
      kind: isFile ? "file" : "folder",
      path: parentPath,
      fullPath,
      size,
      updatedAt: item.updated_at,
      contentType: mime,
    } as CreativeAsset;
  });
}

export async function listCreativeAssets(
  brandProfileId: string,
  folder: string,
  options?: ListOptions
): Promise<CreativeAssetListing> {
  const supabase = createSupabaseBrowserClient();
  const bucket = getCreativeAssetsBucket();
  const path = resolveStoragePath(brandProfileId, folder);

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(path === "" ? undefined : path, {
      limit: options?.limit ?? 1000,
      offset: options?.offset ?? 0,
      sortBy: { column: "name", order: "asc" },
    });

  if (error) {
    throw error;
  }

  return {
    path,
    assets: mapStorageListing(brandProfileId, folder, data ?? []),
  };
}

export async function uploadCreativeAsset(
  brandProfileId: string,
  folder: string,
  file: File
): Promise<UploadResult> {
  const supabase = createSupabaseBrowserClient();
  const bucket = getCreativeAssetsBucket();
  const targetPath = resolveStoragePath(brandProfileId, folder, file.name);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(targetPath, file, {
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    throw error;
  }

  const asset: CreativeAsset = {
    id: targetPath,
    name: file.name,
    kind: "file",
    path: resolveStoragePath(brandProfileId, folder),
    fullPath: targetPath,
    size: file.size,
    updatedAt: new Date().toISOString(),
    contentType: file.type,
  };

  return { asset };
}

export async function renameCreativeAsset(
  fullPath: string,
  newName: string
) {
  const supabase = createSupabaseBrowserClient();
  const bucket = getCreativeAssetsBucket();
  const segments = fullPath.split("/");
  const currentName = segments.pop();
  if (!currentName) {
    throw new Error("Invalid asset path");
  }
  const destination = [...segments, newName].join("/");

  const { error } = await supabase.storage
    .from(bucket)
    .move(fullPath, destination);

  if (error) {
    throw error;
  }

  return destination;
}

export async function deleteCreativeAsset(fullPath: string) {
  const supabase = createSupabaseBrowserClient();
  const bucket = getCreativeAssetsBucket();
  const { error } = await supabase.storage.from(bucket).remove([fullPath]);
  if (error) {
    throw error;
  }
}

export async function createSignedAssetUrl(
  fullPath: string,
  expiresInSeconds: number
): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const bucket = getCreativeAssetsBucket();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fullPath, expiresInSeconds, {
      transform: { width: 1280 },
    });

  if (error || !data?.signedUrl) {
    throw error ?? new Error("Failed to create signed URL");
  }

  return data.signedUrl;
}

export async function getPublicAssetUrl(fullPath: string): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const bucket = getCreativeAssetsBucket();
  const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
  if (!data?.publicUrl) {
    throw new Error("Failed to resolve public URL");
  }
  return data.publicUrl;
}
