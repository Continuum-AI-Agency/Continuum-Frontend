import {
  attachOrganicCanvasCreativeResponseSchema,
  type CanvasPublishingAsset,
  type CanvasPublishingFormat,
  registerGeneratedAssetResponseSchema,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { ApiError } from '@/lib/api/errors';
import { httpServer } from '@/lib/api/http.server';
import { getCreativeAssetsBucket, resolveStoragePath } from '@/lib/creative-assets/config';
import {
  plannerAiStudioApplyRequestSchema,
  plannerAiStudioApplyResponseSchema,
} from '@/lib/organic/ai-studio-bridge';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { type AppliedMediaAssetInput, buildApplyRegisterOperation } from './registerOperation';

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
// Register a generated creative as a durable media.assets row so it is
// searchable by the Organic agent in future sessions.
//
// Goes through Creative Operations rather than inserting the row directly: the RPC
// mints the asset head, its version and lineage edges in one transaction, dedupes on
// the idempotency key, and hands back the id — so the old `created_at desc limit 1`
// re-read of the row we had just written, and its race, are gone.
async function registerAiCreativeAsMediaAsset(
  params: AppliedMediaAssetInput,
): Promise<{ assetId: string; versionId: string } | null> {
  const admin = createSupabaseAdminClient();

  // "media" schema is not in generated types yet; cast to untyped base client.
  const mediaAdmin = (admin as unknown as SupabaseClient).schema('media');
  const operation = buildApplyRegisterOperation(params);

  const { data, error } = await mediaAdmin.rpc('library_execute_operation', {
    p_action: operation.action,
    p_payload: { ...operation, actor: params.userId },
  });

  const parsed = registerGeneratedAssetResponseSchema.safeParse(data);
  if (error || !parsed.success) {
    // Non-fatal to the apply itself — the creative is already stored and already on
    // the draft. Logged with the full storage coordinates plus the idempotency key so
    // the object can be registered after the fact instead of being stranded.
    console.error('[apply] media asset registration failed', {
      brandId: params.brandProfileId,
      bucket: params.bucket,
      storagePath: params.storagePath,
      fileName: params.fileName,
      mimeType: params.mimeType,
      kind: params.kind,
      idempotencyKey: operation.idempotencyKey,
      error: error?.message ?? parsed.error?.message,
    });
    return null;
  }

  // Enqueue vision analysis. Tier-gated inside the edge function itself.
  const assetId = parsed.data.assetId;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { assetId, versionId: parsed.data.versionId };
  fetch(`${supabaseUrl}/functions/v1/analyze_media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      brandId: params.brandProfileId,
      assetId,
      storagePath: params.storagePath,
      bucket: params.bucket,
      mimeType: params.mimeType,
      fileName: params.fileName,
    }),
  }).catch((err) => {
    console.warn('[apply] analyze_media enqueue failed', { assetId, error: String(err) });
  });

  return { assetId, versionId: parsed.data.versionId };
}

function resolveAssetMimeType(kind: 'image' | 'video', provided?: string | null): string {
  const normalized = typeof provided === 'string' ? provided.trim().toLowerCase() : '';
  if (normalized.length > 0) return normalized;
  return kind === 'video' ? 'video/mp4' : 'image/png';
}

function resolveFileExtension(mimeType: string, kind: 'image' | 'video'): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  return kind === 'video' ? 'mp4' : 'png';
}

function decodeBase64ToBytes(value: string): Buffer {
  const normalized = value.replace(/\s+/g, '');
  return Buffer.from(normalized, 'base64');
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
  kind: 'image' | 'video';
  sourceUrl?: string;
  sourceDataUrl?: string;
  sourceBase64?: string;
  mimeType?: string;
}) {
  if (input.sourceDataUrl) {
    const parsed = extractDataUrlParts(input.sourceDataUrl);
    if (!parsed) {
      throw new Error('Invalid data URL received for apply asset.');
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
    const upstreamMime = upstream.headers.get('content-type');
    return {
      bytes: Buffer.from(arrayBuffer),
      mimeType: resolveAssetMimeType(input.kind, upstreamMime ?? input.mimeType),
    };
  }

  throw new Error('Apply asset is missing source data.');
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsedRequest = plannerAiStudioApplyRequestSchema.safeParse(json);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: 'Invalid apply payload.', issues: parsedRequest.error.flatten() },
      { status: 400 },
    );
  }

  const payload = parsedRequest.data;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { data: hasAccess, error: accessError } = await supabase
    .schema('brand_profiles')
    .rpc('has_brand_access', { brand_id: payload.brandProfileId });

  if (accessError || !hasAccess) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  try {
    const bucket = getCreativeAssetsBucket();
    const timestamp = Date.now();
    const persistedAssets = [];
    const libraryAssets: CanvasPublishingAsset[] = [];

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
      const roleToken = asset.role.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
      const fileName = `${timestamp}-${index + 1}-${roleToken}.${extension}`;
      const storagePath = resolveStoragePath(
        payload.brandProfileId,
        `organic-planner/${payload.draftId}`,
        fileName,
      );

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, source.bytes, {
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

      // Register the AI-generated creative in the media library. This USED to be
      // fire-and-forget, on the grounds that the draft write did not depend on it.
      // It does now: the durable write goes through the Backend's planner funnel,
      // which takes library asset ids, so an unregistered creative has nothing to
      // attach. Awaiting it also means a registration failure surfaces as a failed
      // apply the user can retry, instead of a warning in a log nobody reads.
      const registered = await registerAiCreativeAsMediaAsset({
        brandProfileId: payload.brandProfileId,
        userId: user.id,
        draftId: payload.draftId,
        bucket,
        storagePath,
        fileName,
        mimeType: source.mimeType,
        kind: asset.kind,
        sizeBytes: source.bytes.byteLength,
        width: asset.width,
        height: asset.height,
      });
      if (!registered) {
        throw new Error(
          `Could not register ${asset.role} in the media library; the creative is stored at ${storagePath} and the apply can be retried.`,
        );
      }
      libraryAssets.push({
        assetId: registered.assetId,
        versionId: registered.versionId,
        kind: asset.kind,
        order: index,
      });
    }

    // Durably write the applied creative onto the draft, through the SAME funnel every
    // other planner write uses: `applyPlannerFieldEdit` → `plugin_mcp.planner_apply_draft_patches`.
    //
    // This route used to do its own raw service-role UPDATE with no compare-and-set and its
    // own private copy of the content_json mapping. Two mappings drift, and a write with no
    // CAS loses races silently: the generation path's own merge could land between this
    // route's read and its write and quietly revert a creative the user had just applied —
    // which is how a draft ended up carrying five carousel slides while still labelled Reel.
    // The funnel has the CAS token, the operation ledger, and one mapping.
    const organic = (createSupabaseAdminClient() as unknown as SupabaseClient).schema('organic');
    const { data: draftRow, error: draftError } = await organic
      .from('organic_calendar_drafts')
      .select('updated_at')
      .eq('id', payload.draftId)
      .eq('brand_id', payload.brandProfileId)
      .single();

    if (draftError || !draftRow) {
      throw new Error(`Draft not found for apply: ${draftError?.message ?? 'no row'}`);
    }
    const expectedUpdatedAt = (draftRow as { updated_at: string | null }).updated_at;
    if (!expectedUpdatedAt) {
      throw new Error('Draft has no updated_at to compare against; refusing a blind write.');
    }

    // What the applied media IS, measured from the media. The seed's `postType` is the
    // format the draft carried BEFORE the user edited anything, and sending that is how a
    // set of five images arrived declared as a reel.
    const canvasFormat: CanvasPublishingFormat =
      libraryAssets.length > 1
        ? 'carousel'
        : libraryAssets[0]?.kind === 'video'
          ? 'video'
          : 'image';

    await httpServer.request({
      path: `/api/ai-studio/publishing/organic/drafts/${payload.draftId}/creative`,
      method: 'POST',
      body: {
        brandId: payload.brandProfileId,
        expectedUpdatedAt,
        format: canvasFormat,
        assets: libraryAssets,
      },
      schema: attachOrganicCanvasCreativeResponseSchema,
    });

    const responsePayload = plannerAiStudioApplyResponseSchema.parse({
      schemaVersion: 'planner_ai_apply_v1',
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
    // The funnel's own verdicts are the user's answer, not a 502. 409 means someone else
    // wrote the draft while this apply was in flight — retryable, and the client says so
    // instead of pretending the write landed. 422 means the creative would change what the
    // post is. Anything else is genuinely ours.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to persist apply payload.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
