// A persisted cut of a Library video: the timeline editor's document, saved so
// a cut survives closing the dialog. Backed by media.timeline_drafts (one row
// per asset per author — a draft is a personal working copy, not a shared doc).
//
// The wire format names a clip's source `sourceId` (a media.assets id). The
// Frontend's runtime TimelineItem calls the same field `sourceNodeId` because
// on the canvas it names an upstream node; a pure mapper converts between them.
//
// `effects` and `captionStyle` stay opaque here: they are large, fast-moving
// Frontend-owned shapes (ClipEffectSpec, CaptionStyle) that no backend or agent
// consumer reads. `schemaVersion` is the escape hatch if that ever changes.

import { z } from 'zod';
import { clipTransitionSchema } from '../ai-studio/workflow-graph';

export const TIMELINE_DRAFT_SCHEMA_VERSION = 1;

export const timelineDraftSourceKindSchema = z.enum(['video', 'image', 'audio']);
export type TimelineDraftSourceKind = z.infer<typeof timelineDraftSourceKindSchema>;

// A member of the editor's media bin. Durable coordinates only — signed URLs
// expire, so the server re-mints them on every load.
export const timelineDraftPoolSourceSchema = z
  .object({
    assetId: z.string().uuid(),
    kind: timelineDraftSourceKindSchema,
    label: z.string().min(1),
    durationSec: z.number().nonnegative().optional(),
  })
  .strict();
export type TimelineDraftPoolSource = z.infer<typeof timelineDraftPoolSourceSchema>;

export const timelineDraftItemSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    sourceId: z.string().uuid(),
    kind: timelineDraftSourceKindSchema.optional(),
    trimStartSec: z.number().min(0).optional(),
    trimEndSec: z.number().min(0).optional(),
    durationSec: z.number().min(0).optional(),
    muteAudio: z.boolean().optional(),
    volume: z.number().min(0).max(4).optional(),
    audioFadeInSec: z.number().min(0).optional(),
    audioFadeOutSec: z.number().min(0).optional(),
    // Overlay items only: where the clip sits on the output timeline.
    startSec: z.number().min(0).optional(),
    transition: clipTransitionSchema.optional(),
    effects: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type TimelineDraftItem = z.infer<typeof timelineDraftItemSchema>;

export const timelineDraftTrackSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['base', 'overlay', 'audio']),
    items: z.array(timelineDraftItemSchema),
  })
  .strict();
export type TimelineDraftTrack = z.infer<typeof timelineDraftTrackSchema>;

export const timelineDraftCaptionWordSchema = z
  .object({
    text: z.string(),
    startSec: z.number(),
    endSec: z.number(),
  })
  .strict();
export type TimelineDraftCaptionWord = z.infer<typeof timelineDraftCaptionWordSchema>;

export const timelineDraftCaptionCueSchema = z
  .object({
    id: z.string().min(1),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
    words: z.array(timelineDraftCaptionWordSchema).min(1),
    style: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type TimelineDraftCaptionCue = z.infer<typeof timelineDraftCaptionCueSchema>;

export const timelineDraftDocumentSchema = z
  .object({
    schemaVersion: z.literal(TIMELINE_DRAFT_SCHEMA_VERSION),
    sourceAssetId: z.string().uuid(),
    pool: z.array(timelineDraftPoolSourceSchema).max(24),
    items: z.array(timelineDraftItemSchema),
    overlayTracks: z.array(timelineDraftTrackSchema).optional(),
    audioTracks: z.array(timelineDraftTrackSchema).optional(),
    exportPresetId: z.string().min(1).optional(),
    markers: z.array(z.number().min(0)).optional(),
    captionsEnabled: z.boolean().optional(),
    captionCues: z.array(timelineDraftCaptionCueSchema).optional(),
    captionWords: z.array(timelineDraftCaptionWordSchema).optional(),
    captionStyle: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type TimelineDraftDocument = z.infer<typeof timelineDraftDocumentSchema>;

export const timelineDraftStatusSchema = z.enum(['active', 'rendered', 'discarded']);
export type TimelineDraftStatus = z.infer<typeof timelineDraftStatusSchema>;

export const timelineDraftSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    createdBy: z.string().nullable().optional(),
    schemaVersion: z.number().int().positive(),
    document: timelineDraftDocumentSchema,
    status: timelineDraftStatusSchema,
    renderedAssetId: z.string().nullable().optional(),
    lastRenderedAt: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type TimelineDraft = z.infer<typeof timelineDraftSchema>;

export const upsertTimelineDraftRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    document: timelineDraftDocumentSchema,
    status: timelineDraftStatusSchema.optional(),
    renderedAssetId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type UpsertTimelineDraftRequest = z.infer<typeof upsertTimelineDraftRequestSchema>;

// Freshly signed playback URL per pool member. `signedUrl: null` means the
// asset is gone (deleted since the draft was saved) — the bin renders it as a
// missing tile rather than silently dropping the clip.
export const timelineDraftPoolMediaSchema = z
  .object({
    assetId: z.string().min(1),
    signedUrl: z.string().nullable(),
    kind: timelineDraftSourceKindSchema.nullable(),
    durationMs: z.number().int().nullable(),
    label: z.string().nullable(),
  })
  .strict();
export type TimelineDraftPoolMedia = z.infer<typeof timelineDraftPoolMediaSchema>;

export const getTimelineDraftResponseSchema = z
  .object({
    draft: timelineDraftSchema.nullable(),
    poolMedia: z.array(timelineDraftPoolMediaSchema),
  })
  .strict();
export type GetTimelineDraftResponse = z.infer<typeof getTimelineDraftResponseSchema>;

export const upsertTimelineDraftResponseSchema = z
  .object({
    id: z.string().min(1),
    updatedAt: z.string(),
  })
  .strict();
export type UpsertTimelineDraftResponse = z.infer<typeof upsertTimelineDraftResponseSchema>;
