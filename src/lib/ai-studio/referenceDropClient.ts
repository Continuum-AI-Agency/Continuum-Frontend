"use client";

import { createSignedAssetUrl } from "@/lib/creative-assets/storageClient";
import { formatMiB, type ParsedReferenceDropPayload } from "@/lib/ai-studio/referenceDrop";

export async function resolveDroppedBase64(
  parsed: ParsedReferenceDropPayload,
  maxBytes: number
): Promise<{ base64: string; sourceName?: string; byteLength?: number; sourceUrl?: string }> {
  if (parsed.kind === "data-url") {
    return { base64: parsed.base64, sourceName: "data-url" };
  }

  const source = parsed.publicUrl ?? parsed.path;
  if (!source) throw new Error("Missing asset data");

  const freshUrl = async () => createFreshSignedUrl(parsed);
  const url = parsed.publicUrl ?? (await freshUrl());

  let resolvedUrl = url;
  let fetched: { base64: string; byteLength?: number };
  try {
    fetched = await fetchBase64(url, maxBytes);
  } catch (error) {
    if (!parsed.publicUrl || !canRefreshRemoteUrl(parsed)) {
      throw error;
    }
    resolvedUrl = await freshUrl();
    fetched = await fetchBase64(resolvedUrl, maxBytes);
  }
  const rawName = source.split("/").pop() ?? "ref";
  const sourceName = rawName.split("?")[0]?.split("#")[0] ?? rawName;
  return { ...fetched, sourceName, sourceUrl: resolvedUrl };
}

function canRefreshRemoteUrl(parsed: Extract<ParsedReferenceDropPayload, { kind: "remote" }>): boolean {
  return Boolean((parsed.brandId && parsed.assetId) || (parsed.bucket && parsed.path) || parsed.path);
}

async function createFreshSignedUrl(parsed: Extract<ParsedReferenceDropPayload, { kind: "remote" }>): Promise<string> {
  if (parsed.brandId && parsed.assetId) {
    const resp = await fetch("/api/library/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: parsed.brandId, assetId: parsed.assetId }),
    });
    if (!resp.ok) {
      throw new Error(`Failed to sign library asset: ${resp.status}`);
    }
    const data = (await resp.json()) as { signedUrl?: string };
    if (data.signedUrl) return data.signedUrl;
    throw new Error("Failed to sign library asset");
  }

  if (parsed.path) {
    return createSignedAssetUrl(parsed.path, 300, parsed.bucket);
  }

  throw new Error("Missing asset data");
}

async function fetchBase64(
  url: string,
  maxBytes: number
): Promise<{ base64: string; byteLength?: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch asset: ${res.status}`);
  const contentLength = res.headers.get("content-length");
  const headerBytes = contentLength ? Number(contentLength) : undefined;
  if (Number.isFinite(headerBytes) && (headerBytes as number) > maxBytes) {
    throw new Error(`Attachment exceeds ${formatMiB(maxBytes)} limit`);
  }
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new Error(`Attachment exceeds ${formatMiB(maxBytes)} limit`);
  }
  const byteLength = Number.isFinite(headerBytes) ? (headerBytes as number) : buffer.byteLength;
  return { base64: arrayBufferToBase64(buffer), byteLength };
}

export function getVideoDuration(source: File | string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      reject(new Error("Failed to load video metadata"));
      URL.revokeObjectURL(video.src);
    };
    if (typeof source === "string") {
      // Handle base64 or URL
      video.src = source.startsWith("data:") ? source : `data:video/mp4;base64,${source}`;
    } else {
      video.src = URL.createObjectURL(source);
    }
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
