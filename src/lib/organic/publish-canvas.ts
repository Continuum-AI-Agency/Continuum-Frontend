// Legacy contract + pure helpers for Planner-originated composition handoffs.
// The current Organic Publisher canvas node uses the backend's searchable,
// existing-draft-only publishing API instead. This route remains for older
// composition lifecycle callers that still finalize an already-bound render.

import { z } from 'zod';
import { formatDayId, startOfWeek } from '@/components/organic/primitives/calendar-utils';

// Drafts with no assigned publishing account use this sentinel, matching the FE
// autosave stub path (calendar-draft-persistence).
export const PUBLISH_UNASSIGNED_PLATFORM_ACCOUNT_ID = 'unassigned';
export const DEFAULT_PUBLISH_PLATFORM = 'instagram';

export const publishCanvasStatusSchema = z.enum(['draft', 'approved', 'scheduled']);
export type PublishCanvasStatus = z.infer<typeof publishCanvasStatusSchema>;

export const publishCanvasRequestSchema = z
  .object({
    brandId: z.string().min(1),
    // Present → attach to this existing draft. Absent → create a new draft and
    // return its id.
    draftId: z.string().min(1).optional(),
    // Present for Planner-seeded compositions. The publish route closes the
    // composition lifecycle after attaching the rendered video to its draft.
    compositionId: z.string().min(1).optional(),
    resultAssetId: z.string().min(1).optional(),
    // Stable key for the node-owned draft, so a re-publish UPSERTs the same row
    // instead of spawning duplicates.
    clientKey: z.string().min(1).optional(),
    // Durable, re-signable coords of the already-uploaded MP4 (media-library).
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    mimeType: z.string().optional(),
    durationSec: z.number().nonnegative().optional(),
    platform: z.string().min(1).optional(),
    scheduledAt: z.string().optional(),
    caption: z.string().optional(),
    status: publishCanvasStatusSchema.optional(),
  })
  .strict();
export type PublishCanvasRequest = z.infer<typeof publishCanvasRequestSchema>;

export const publishCanvasResponseSchema = z
  .object({
    draftId: z.string(),
    weekStartId: z.string(),
    bucket: z.string(),
    storagePath: z.string(),
    signedUrl: z.string(),
    createdDraft: z.boolean(),
    compositionId: z.string().min(1).optional(),
  })
  .strict();
export type PublishCanvasResponse = z.infer<typeof publishCanvasResponseSchema>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function localNoon(reference: Date): Date {
  const noon = new Date(reference);
  noon.setHours(12, 0, 0, 0);
  return noon;
}

// Full ISO timestamptz for a target slot. Accepts a full datetime or a bare
// YYYY-MM-DD (anchored at local noon so it can't slip across a tz boundary), and
// defaults to `now` at noon when absent/invalid. Never returns a date-only value:
// organic_calendar_drafts.scheduled_date is a full timestamptz, and a date-only
// write that later gets a time appended triggers Postgres 22007.
export function normalizePublishScheduledAt(input: string | undefined, now: Date): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return localNoon(now).toISOString();
  if (DATE_ONLY.test(raw)) return new Date(`${raw}T12:00:00`).toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return localNoon(now).toISOString();
  return parsed.toISOString();
}

// The Planner week (YYYY-MM-DD, Monday-start) a scheduled instant falls in. The
// deep-link needs it so a freshly-created draft lands inside the loaded week
// window (the Planner selects a deep-linked draft only if it is already loaded).
export function computeWeekStartId(scheduledAtIso: string): string {
  return formatDayId(startOfWeek(new Date(scheduledAtIso)));
}

export interface PublishDraftRowInput {
  brandId: string;
  userId: string;
  clientKey: string;
  platform: string;
  scheduledAtIso: string;
  status: PublishCanvasStatus;
  caption?: string;
  contentJson: Record<string, unknown>;
  mediaStage: string;
  nowIso: string;
}

// The row written when the node CREATES a draft. Mirrors the FE autosave stub
// (buildPersistedDraftPayload) plus content_json/media_stage so the Planner shows
// the reel immediately. Idempotent on (brand_id, client_key). `id` is intentionally
// omitted — the table defaults it, and providing one would mutate the PK on a
// re-publish UPSERT conflict; the route reads the id back via .select("id").
export function buildPublishDraftRow(input: PublishDraftRowInput): Record<string, unknown> {
  const dayId = formatDayId(new Date(input.scheduledAtIso));
  return {
    brand_id: input.brandId,
    user_id: input.userId,
    client_key: input.clientKey,
    platform: input.platform,
    platform_account_id: PUBLISH_UNASSIGNED_PLATFORM_ACCOUNT_ID,
    status: input.status,
    scheduled_date: input.scheduledAtIso,
    media_stage: input.mediaStage,
    content_json: input.contentJson,
    slot_data: {
      weekStart: computeWeekStartId(input.scheduledAtIso),
      dayId,
      platform: input.platform,
      origin: 'ai-studio-canvas',
      ...(input.caption ? { caption: input.caption } : {}),
    },
    updated_at: input.nowIso,
  };
}
