"use client";

import { getCreativeAssetsBucket, resolveStoragePath } from "@/lib/creative-assets/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX_BYTES = 2 * 1024 * 1024;
const LOGO_FOLDER = "branding";
const LOGO_BASENAME = "logo-from-scrape";

export async function internalizeLogo(brandId: string, externalUrl: string): Promise<string | null> {
  if (!brandId || !externalUrl) return null;
  if (!/^https?:\/\//i.test(externalUrl)) return null;

  let response: Response;
  try {
    response = await fetch(externalUrl, { mode: "cors", credentials: "omit" });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const contentType = (response.headers.get("content-type") ?? "image/png").split(";")[0]!.trim();
  if (!contentType.startsWith("image/")) return null;

  const blob = await response.blob();
  if (blob.size === 0 || blob.size > MAX_BYTES) return null;

  const ext = pickExtension(contentType, externalUrl);
  const filename = `${LOGO_BASENAME}.${ext}`;
  const file = new File([blob], filename, { type: contentType });

  const supabase = createSupabaseBrowserClient();
  const targetPath = resolveStoragePath(brandId, LOGO_FOLDER, filename);

  const { error } = await supabase.storage.from(getCreativeAssetsBucket()).upload(targetPath, file, {
    upsert: true,
    cacheControl: "3600",
    contentType,
  });
  if (error) return null;

  return targetPath;
}

function pickExtension(contentType: string, url: string): string {
  if (contentType === "image/svg+xml") return "svg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  const match = url.match(/\.(svg|png|jpe?g|webp|gif)(?:[?#]|$)/i);
  if (match) return match[1]!.toLowerCase().replace("jpeg", "jpg");
  return "png";
}
