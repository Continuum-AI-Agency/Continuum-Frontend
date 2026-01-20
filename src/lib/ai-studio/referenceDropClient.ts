"use client";

import { createSignedAssetUrl } from "@/lib/creative-assets/storageClient";
import { formatMiB, type ParsedReferenceDropPayload } from "@/lib/ai-studio/referenceDrop";

export async function resolveDroppedBase64(
  parsed: ParsedReferenceDropPayload,
  maxBytes: number
): Promise<{ base64: string; sourceName?: string; byteLength?: number }> {
  if (parsed.kind === "data-url") {
    return { base64: parsed.base64, sourceName: "data-url" };
  }

  const source = parsed.publicUrl ?? parsed.path;
  if (!source) throw new Error("Missing asset data");

  const url = parsed.publicUrl ? parsed.publicUrl : await createSignedAssetUrl(parsed.path!, 300);

  const { base64, byteLength } = await fetchBase64(url, maxBytes);
  const rawName = source.split("/").pop() ?? "ref";
  const sourceName = rawName.split("?")[0]?.split("#")[0] ?? rawName;
  return { base64, sourceName, byteLength };
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
