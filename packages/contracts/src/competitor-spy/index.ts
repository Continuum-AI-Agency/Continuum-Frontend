// Canonical competitor-ad-spy boundary types shared by Backend (ingest, routes,
// agent tools) and Frontend (dashboard). DB rows are snake_case; these boundary
// shapes are camelCase and the data layer maps between them. Moved here from
// Continuum-Backend/App/competitor-ad-spy/schemas.ts (now a re-export shim) per
// the monorepo "contracts are mandatory for cross-boundary types" rule.

import { z } from "zod";
import {
  competitorAdAnalysisSchema,
} from "./analysis";

export * from "./analysis";

export const competitorSourceSchema = z.enum(["auto", "user"]);
export const competitorStatusSchema = z.enum(["active", "archived"]);
export const adStatusSchema = z.enum(["active", "paused"]);
export const adSourceSchema = z.enum(["meta_ad_library"]);

export const competitorSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(140),
  source: competitorSourceSchema,
  metaPageId: z.string().nullable(),
  status: competitorStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Competitor = z.infer<typeof competitorSchema>;

export const competitorAdSchema = z.object({
  sourceAdId: z.string(),
  pageId: z.string().nullable(),
  pageName: z.string().nullable(),
  status: adStatusSchema,
  body: z.string().nullable(),
  linkTitle: z.string().nullable(),
  linkCaption: z.string().nullable(),
  cta: z.string().nullable(),
  snapshotUrl: z.string().url().nullable(),
  imageUrl: z.string().url().nullable(),
  deliveryStart: z.string().nullable(),
  deliveryStop: z.string().nullable(),
  creationTime: z.string().nullable(),
  platforms: z.array(z.string()),
  languages: z.array(z.string()),
});
export type CompetitorAd = z.infer<typeof competitorAdSchema>;

export const adSnapshotSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  competitorId: z.string().uuid(),
  source: adSourceSchema,
  sourceAdId: z.string(),
  fetchedAt: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  status: adStatusSchema,
  payload: competitorAdSchema,
});
export type AdSnapshot = z.infer<typeof adSnapshotSchema>;

export const timelineEntrySchema = z.object({
  snapshotId: z.string().uuid(),
  competitorId: z.string().uuid(),
  competitorName: z.string(),
  competitorSlug: z.string(),
  sourceAdId: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  status: adStatusSchema,
  snapshotUrl: z.string().url().nullable(),
  imageUrl: z.string().url().nullable(),
  body: z.string().nullable(),
  cta: z.string().nullable(),
  platforms: z.array(z.string()),
  deliveryStart: z.string().nullable(),
  deliveryStop: z.string().nullable(),
  // v2 additive, optional so v1 timeline rows still validate. Populated once the
  // media-extraction + analysis passes have run for a snapshot.
  analysis: competitorAdAnalysisSchema.nullable().optional(),
  analysisStatus: z.string().nullable().optional(),
  creativeMediaStatus: z.string().nullable().optional(),
  hasCreativeMedia: z.boolean().optional(),
});
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;

export const adLifecycleEventTypeSchema = z.enum([
  "new_ad",
  "resumed",
  "paused",
  "removed",
  "variant_spawned",
  "copy_changed",
  "sustained_hero",
  "volume_spike",
  "creative_theme_shift",
]);
export type AdLifecycleEventType = z.infer<typeof adLifecycleEventTypeSchema>;

export const adLifecycleEventSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  competitorId: z.string().uuid(),
  snapshotId: z.string().uuid().nullable(),
  sourceAdId: z.string(),
  eventType: adLifecycleEventTypeSchema,
  eventAt: z.string(),
  priorStatus: z.string().nullable(),
  newStatus: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type AdLifecycleEvent = z.infer<typeof adLifecycleEventSchema>;

// The assembled awareness payload (what the dashboard renders). Blocks are
// self-describing (category + title + free-form data) so the renderer can switch
// on category without a rigid per-block schema.
export const awarenessBlockSchema = z.object({
  category: z.string(),
  title: z.string(),
  data: z.unknown(),
});
export type AwarenessBlock = z.infer<typeof awarenessBlockSchema>;

export const awarenessSummarySchema = z.object({
  newAds: z.number().int().nonnegative(),
  paused: z.number().int().nonnegative(),
  resumed: z.number().int().nonnegative(),
  analyzedActive: z.number().int().nonnegative(),
});

export const awarenessReportPayloadSchema = z.object({
  windowStart: z.string(),
  windowEnd: z.string(),
  summary: awarenessSummarySchema,
  blocks: z.array(awarenessBlockSchema),
});
export type AwarenessReportPayload = z.infer<typeof awarenessReportPayloadSchema>;

export const awarenessReportSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  runId: z.string(),
  generatedAt: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  payload: awarenessReportPayloadSchema,
  storageBucket: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
});
export type AwarenessReport = z.infer<typeof awarenessReportSchema>;
