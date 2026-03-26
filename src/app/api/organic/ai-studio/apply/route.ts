import { NextResponse } from "next/server";

import { getCreativeAssetsBucket, resolveStoragePath } from "@/lib/creative-assets/config";
import {
  plannerAiStudioApplyRequestSchema,
  plannerAiStudioApplyResponseSchema,
} from "@/lib/organic/ai-studio-bridge";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
export const runtime = "nodejs";

function resolveAssetMimeType(kind: "image" | "video", provided?: string | null): string {
  const normalized = typeof provided === "string" ? provided.trim().toLowerCase() : "";
  if (normalized.length > 0) return normalized;
  return kind === "video" ? "video/mp4" : "image/png";
}

function resolveFileExtension(mimeType: string, kind: "image" | "video"): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  return kind === "video" ? "mp4" : "png";
}

function decodeBase64ToBytes(value: string): Buffer {
  const normalized = value.replace(/\s+/g, "");
  return Buffer.from(normalized, "base64");
}

function extractDataUrlParts(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64: match[2],
  };
}

async function resolveSourceBytes(input: {
  kind: "image" | "video";
  sourceUrl?: string;
  sourceDataUrl?: string;
  sourceBase64?: string;
  mimeType?: string;
}) {
  if (input.sourceDataUrl) {
    const parsed = extractDataUrlParts(input.sourceDataUrl);
    if (!parsed) {
      throw new Error("Invalid data URL received for apply asset.");
    }
    return {
      bytes: decodeBase64ToBytes(parsed.base64),
      mimeType: resolveAssetMimeType(input.kind, parsed.mimeType),
    };
  }

  if (input.sourceBase64) {
    return {
      bytes: decodeBase64ToBytes(input.sourceBase64),
      mimeType: resolveAssetMimeType(input.kind, input.mimeType),
    };
  }

  if (input.sourceUrl) {
    const upstream = await fetch(input.sourceUrl);
    if (!upstream.ok) {
      throw new Error(`Failed to fetch source asset URL (${upstream.status}).`);
    }
    const arrayBuffer = await upstream.arrayBuffer();
    const upstreamMime = upstream.headers.get("content-type");
    return {
      bytes: Buffer.from(arrayBuffer),
      mimeType: resolveAssetMimeType(input.kind, upstreamMime ?? input.mimeType),
    };
  }

  throw new Error("Apply asset is missing source data.");
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsedRequest = plannerAiStudioApplyRequestSchema.safeParse(json);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "Invalid apply payload.", issues: parsedRequest.error.flatten() },
      { status: 400 }
    );
  }

  const payload = parsedRequest.data;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: hasAccess, error: accessError } = await supabase
    .schema("brand_profiles")
    .rpc("has_brand_access", { brand_id: payload.brandProfileId });

  if (accessError || !hasAccess) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const bucket = getCreativeAssetsBucket();
    const timestamp = Date.now();
    const persistedAssets = [];

    for (let index = 0; index < payload.assets.length; index += 1) {
      const asset = payload.assets[index];
      const source = await resolveSourceBytes({
        kind: asset.kind,
        sourceUrl: asset.sourceUrl,
        sourceDataUrl: asset.sourceDataUrl,
        sourceBase64: asset.sourceBase64,
        mimeType: asset.mimeType,
      });

      const extension = resolveFileExtension(source.mimeType, asset.kind);
      const roleToken = asset.role.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
      const fileName = `${timestamp}-${index + 1}-${roleToken}.${extension}`;
      const storagePath = resolveStoragePath(
        payload.brandProfileId,
        `organic-planner/${payload.draftId}`,
        fileName
      );

      const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, source.bytes, {
        contentType: source.mimeType,
        upsert: false,
      });

      if (uploadError) {
        throw new Error(`Storage upload failed for ${asset.role}: ${uploadError.message}`);
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

      if (signedError || !signedData?.signedUrl) {
        throw new Error(`Signed URL creation failed for ${asset.role}.`);
      }

      persistedAssets.push({
        role: asset.role,
        kind: asset.kind,
        slideIndex: asset.slideIndex,
        storagePath,
        storageUrl: signedData.signedUrl,
        mimeType: source.mimeType,
        width: asset.width,
        height: asset.height,
        generationContext: asset.generationContext,
      });
    }

    const responsePayload = plannerAiStudioApplyResponseSchema.parse({
      schemaVersion: "planner_ai_apply_v1",
      draftId: payload.draftId,
      brandProfileId: payload.brandProfileId,
      postType: payload.postType,
      platform: payload.platform,
      overwrite: true,
      contentPatch: payload.contentPatch,
      assets: persistedAssets,
      appliedAt: new Date().toISOString(),
    });

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to persist apply payload.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
