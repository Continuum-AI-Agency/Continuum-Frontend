import { deriveOrganicMediaStage, syncDraftSnapshotFormat } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import {
  buildPublishDraftRow,
  computeWeekStartId,
  DEFAULT_PUBLISH_PLATFORM,
  normalizePublishScheduledAt,
  publishCanvasRequestSchema,
  publishCanvasResponseSchema,
} from '@/lib/organic/publish-canvas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildUserSuppliedContentJson } from '../ai-studio/apply/userSuppliedContentJson';

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
type OrganicDraftRow = {
  id: string;
  content_json: Record<string, unknown> | null;
  scheduled_date: string | null;
};

// The edited MP4 already lives durably in the media library, so the reel is built
// from its storage coords (no re-upload). Shared by the link + create branches.
function buildReelContentJson(params: {
  existingContentJson: Record<string, unknown> | null;
  storagePath: string;
  bucket: string;
  signedUrl: string;
  mimeType?: string;
  durationSec?: number;
  caption?: string;
}): Record<string, unknown> {
  const existingCreative =
    (params.existingContentJson?.creative as Record<string, unknown> | undefined) ?? {};
  const existingSuggestion =
    (existingCreative.mediaSuggestion as Record<string, unknown> | undefined) ?? {};
  const existingReel = (existingSuggestion.reel as Record<string, unknown> | undefined) ?? {};
  const plannerComposition = existingReel.composition;
  const contentJson = buildUserSuppliedContentJson({
    existingContentJson: params.existingContentJson,
    bucket: params.bucket,
    assets: [
      {
        role: 'primary',
        kind: 'video',
        storagePath: params.storagePath,
        storageUrl: params.signedUrl,
        ...(params.mimeType ? { mimeType: params.mimeType } : {}),
        ...(params.durationSec !== undefined ? { durationSec: params.durationSec } : {}),
      },
    ],
  });

  if (plannerComposition) {
    const creative = (contentJson.creative as Record<string, unknown> | undefined) ?? {};
    const suggestion = (creative.mediaSuggestion as Record<string, unknown> | undefined) ?? {};
    const reel = (suggestion.reel as Record<string, unknown> | undefined) ?? {};
    contentJson.creative = {
      ...creative,
      mediaSuggestion: {
        ...suggestion,
        reel: { ...reel, composition: plannerComposition },
      },
    };
  }

  const caption = params.caption?.trim();
  if (caption) {
    const creative = (contentJson.creative as Record<string, unknown> | undefined) ?? {};
    contentJson.creative = { ...creative, caption };
  }
  return contentJson;
}

function markPlannerCompositionReady(
  contentJson: Record<string, unknown>,
  compositionId: string,
  resultAssetId: string | undefined,
  nowIso: string,
) {
  const creative = (contentJson.creative as Record<string, unknown> | undefined) ?? {};
  const suggestion = (creative.mediaSuggestion as Record<string, unknown> | undefined) ?? {};
  const reel = (suggestion.reel as Record<string, unknown> | undefined) ?? {};
  const composition = (reel.composition as Record<string, unknown> | undefined) ?? {};
  if (composition.id !== compositionId) return;
  contentJson.creative = {
    ...creative,
    mediaSuggestion: {
      ...suggestion,
      reel: {
        ...reel,
        composition: {
          ...composition,
          status: 'ready',
          resultAssetId: resultAssetId ?? null,
          error: null,
          updatedAt: nowIso,
        },
      },
    },
  };
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = publishCanvasRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid publish payload.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const payload = parsed.data;

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
    .rpc('has_brand_access', { brand_id: payload.brandId });
  if (accessError || !hasAccess) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const organic = (admin as unknown as SupabaseClient).schema('organic');
    const media = (admin as unknown as SupabaseClient).schema('media');

    const ownedAsset = await media
      .from('assets')
      .select('id')
      .eq('brand_id', payload.brandId)
      .eq('bucket', payload.bucket)
      .eq('storage_path', payload.storagePath)
      .maybeSingle();
    if (ownedAsset.error || !ownedAsset.data?.id) {
      throw new Error('The rendered video is not registered to this brand.');
    }
    const resultAssetId = ownedAsset.data.id as string;
    if (payload.resultAssetId && payload.resultAssetId !== resultAssetId) {
      throw new Error('The rendered asset does not match its storage location.');
    }

    // Re-sign the durable MP4 for immediate render; brand access was verified above.
    const { data: signed, error: signError } = await admin.storage
      .from(payload.bucket)
      .createSignedUrl(payload.storagePath, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      throw new Error(`Failed to sign published video: ${signError?.message ?? 'no url'}`);
    }
    const signedUrl = signed.signedUrl;
    const nowIso = new Date().toISOString();

    // LINK: attach to the existing draft the node is bound to.
    if (payload.draftId) {
      const { data: draftRow, error: draftError } = await organic
        .from('organic_calendar_drafts')
        .select('id, content_json, scheduled_date, slot_data')
        .eq('id', payload.draftId)
        .eq('brand_id', payload.brandId)
        .single();
      if (draftError || !draftRow) {
        throw new Error(`Draft not found for publish: ${draftError?.message ?? 'no row'}`);
      }
      const existing = draftRow as OrganicDraftRow;

      const contentJson = buildReelContentJson({
        existingContentJson: existing.content_json,
        storagePath: payload.storagePath,
        bucket: payload.bucket,
        signedUrl,
        mimeType: payload.mimeType,
        durationSec: payload.durationSec,
        caption: payload.caption,
      });
      if (payload.compositionId) {
        markPlannerCompositionReady(contentJson, payload.compositionId, resultAssetId, nowIso);
      }
      // A rendered MP4 makes this a REEL; the cached snapshot format outranks content.format
      // in `resolveDraftPublishFormat`, so it has to move with it.
      const nextSlotData = syncDraftSnapshotFormat(
        (draftRow as { slot_data?: unknown }).slot_data,
        'REEL',
      );

      const { error: updateError } = await organic
        .from('organic_calendar_drafts')
        .update({
          content_json: contentJson,
          ...(nextSlotData ? { slot_data: nextSlotData } : {}),
          media_stage: deriveOrganicMediaStage(contentJson),
          updated_at: nowIso,
        })
        .eq('id', payload.draftId)
        .eq('brand_id', payload.brandId);
      if (updateError) {
        throw new Error(`Failed to attach video to draft: ${updateError.message}`);
      }

      if (payload.compositionId) {
        const { error: compositionError } = await organic
          .from('planner_canvas_compositions')
          .update({
            status: 'ready',
            result_asset_id: resultAssetId,
            error: null,
            is_current: true,
            updated_at: nowIso,
          })
          .eq('id', payload.compositionId)
          .eq('draft_id', payload.draftId)
          .eq('brand_id', payload.brandId);
        if (compositionError) {
          throw new Error(`Failed to finish composition: ${compositionError.message}`);
        }
      }

      const weekStartId = computeWeekStartId(existing.scheduled_date ?? nowIso);
      const response = publishCanvasResponseSchema.parse({
        draftId: payload.draftId,
        weekStartId,
        bucket: payload.bucket,
        storagePath: payload.storagePath,
        signedUrl,
        createdDraft: false,
        ...(payload.compositionId ? { compositionId: payload.compositionId } : {}),
      });
      return NextResponse.json(response, { status: 200 });
    }

    // CREATE: mint a new draft (idempotent on brand_id + client_key) with the reel.
    const scheduledAtIso = normalizePublishScheduledAt(payload.scheduledAt, new Date());
    const platform = payload.platform?.trim() || DEFAULT_PUBLISH_PLATFORM;
    const clientKey = payload.clientKey?.trim() || crypto.randomUUID();
    const status = payload.status ?? 'draft';

    const contentJson = buildReelContentJson({
      existingContentJson: null,
      storagePath: payload.storagePath,
      bucket: payload.bucket,
      signedUrl,
      mimeType: payload.mimeType,
      durationSec: payload.durationSec,
      caption: payload.caption,
    });

    const row = buildPublishDraftRow({
      brandId: payload.brandId,
      userId: user.id,
      clientKey,
      platform,
      scheduledAtIso,
      status,
      caption: payload.caption,
      contentJson,
      mediaStage: deriveOrganicMediaStage(contentJson),
      nowIso,
    });

    const { data: upserted, error: upsertError } = await organic
      .from('organic_calendar_drafts')
      .upsert(row, { onConflict: 'brand_id,client_key' })
      .select('id')
      .single();
    if (upsertError || !upserted) {
      throw new Error(`Failed to create draft: ${upsertError?.message ?? 'no row'}`);
    }

    const response = publishCanvasResponseSchema.parse({
      draftId: (upserted as { id: string }).id,
      weekStartId: computeWeekStartId(scheduledAtIso),
      bucket: payload.bucket,
      storagePath: payload.storagePath,
      signedUrl,
      createdDraft: true,
    });
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish to planner.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
