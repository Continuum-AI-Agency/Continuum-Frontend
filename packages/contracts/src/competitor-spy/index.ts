// Canonical competitor-ad-spy boundary types shared by Backend (ingest, routes,
// agent tools) and Frontend (dashboard). DB rows are snake_case; these boundary
// shapes are camelCase and the data layer maps between them. Moved here from
// Continuum-Backend/App/competitor-ad-spy/schemas.ts (now a re-export shim) per
// the monorepo "contracts are mandatory for cross-boundary types" rule.

import { z } from "zod";
import {
  competitorAdAnalysisSchema,
} from "./analysis";
import { instagramAccountSchema, instagramPostSchema } from "../media/instagram";

export * from "./analysis";

export const competitorSourceSchema = z.enum(["auto", "user"]);
export const competitorStatusSchema = z.enum(["active", "archived"]);
export const adStatusSchema = z.enum(["active", "paused"]);
export const adSourceSchema = z.enum(["meta_ad_library"]);
export const competitorOrganicStatusSchema = z.enum(["ready", "needs_instagram", "unavailable"]);
export const competitorPaidStatusSchema = z.enum(["ready", "resolving", "needs_review", "unresolved", "error"]);
export const metaPageResolutionStatusSchema = z.enum(["unresolved", "resolving", "resolved", "needs_review", "error"]);

export const metaPageResolutionCandidateSchema = z
  .object({
    pageId: z.string(),
    pageName: z.string(),
    confidence: z.number().min(0).max(1).default(0),
    reasons: z.array(z.string()).default([]),
    source: z.enum(["meta_ad_library", "deterministic", "ai"]).default("meta_ad_library"),
  })
  .strict();
export type MetaPageResolutionCandidate = z.infer<typeof metaPageResolutionCandidateSchema>;

export const metaPageResolutionSchema = z
  .object({
    status: metaPageResolutionStatusSchema,
    selectedPageId: z.string().nullable(),
    selectedPageName: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    candidates: z.array(metaPageResolutionCandidateSchema).default([]),
    resolvedAt: z.string().nullable(),
    error: z.string().nullable(),
  })
  .strict();
export type MetaPageResolution = z.infer<typeof metaPageResolutionSchema>;

export const competitorSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(140),
  source: competitorSourceSchema,
  metaPageId: z.string().nullable(),
  instagramUsername: z.string().nullable().optional(),
  instagramUserId: z.string().nullable().optional(),
  instagramName: z.string().nullable().optional(),
  instagramFollowersCount: z.number().int().nonnegative().nullable().optional(),
  metaPageName: z.string().nullable().optional(),
  metaPageResolutionStatus: metaPageResolutionStatusSchema.nullable().optional(),
  metaPageResolutionConfidence: z.number().min(0).max(1).nullable().optional(),
  metaPageResolutionCandidates: z.array(metaPageResolutionCandidateSchema).nullable().optional(),
  metaPageResolvedAt: z.string().nullable().optional(),
  metaPageResolutionError: z.string().nullable().optional(),
  organicStatus: competitorOrganicStatusSchema.optional(),
  paidStatus: competitorPaidStatusSchema.optional(),
  status: competitorStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Competitor = z.infer<typeof competitorSchema>;

// Meta Page autocomplete result. The Library "Inspiration" tagger lets a user
// type a brand name; the backend resolves real advertiser Pages from the Ad
// Library and returns these so the user picks the exact page_id to track.
export const metaPageSearchResultSchema = z.object({
  pageId: z.string(),
  pageName: z.string(),
});
export type MetaPageSearchResult = z.infer<typeof metaPageSearchResultSchema>;

export const instagramCompetitorSearchWarningSchema = z.enum([
  "meta_page_search_failed",
  "meta_page_not_found",
  "instagram_handle_resolved_by_fallback",
]);
export type InstagramCompetitorSearchWarning = z.infer<typeof instagramCompetitorSearchWarningSchema>;

export const competitorSearchWarningSchema = z.enum([
  "meta_page_search_failed",
  "meta_page_not_found",
  "instagram_handle_resolved_by_fallback",
  "paid_page_resolved_by_ai",
  "paid_page_needs_review",
  "paid_page_unresolved",
]);
export type CompetitorSearchWarning = z.infer<typeof competitorSearchWarningSchema>;

export const instagramCompetitorSearchResultSchema = z
  .object({
    query: z.string(),
    resolvedUsername: z.string(),
    account: instagramAccountSchema,
    posts: z.array(instagramPostSchema),
    metaPageCandidates: z.array(metaPageSearchResultSchema),
    warnings: z.array(instagramCompetitorSearchWarningSchema).default([]),
  })
  .strict();
export type InstagramCompetitorSearchResult = z.infer<typeof instagramCompetitorSearchResultSchema>;

export const competitorSearchResultSchema = z
  .object({
    query: z.string(),
    resolvedUsername: z.string().nullable(),
    account: instagramAccountSchema.nullable(),
    posts: z.array(instagramPostSchema),
    metaPageCandidates: z.array(metaPageSearchResultSchema),
    metaPageResolution: metaPageResolutionSchema,
    organicStatus: competitorOrganicStatusSchema,
    paidStatus: competitorPaidStatusSchema,
    warnings: z.array(competitorSearchWarningSchema).default([]),
  })
  .strict();
export type CompetitorSearchResult = z.infer<typeof competitorSearchResultSchema>;

export const competitorOrganicPostSchema = z
  .object({
    competitorId: z.string().uuid(),
    competitorName: z.string(),
    instagramUsername: z.string(),
    post: instagramPostSchema,
  })
  .strict();
export type CompetitorOrganicPost = z.infer<typeof competitorOrganicPostSchema>;

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

export const competitorAdPublicMetadataSchema = z
  .object({
    sourceAdId: z.string(),
    pageId: z.string().nullable(),
    pageName: z.string().nullable(),
    linkTitle: z.string().nullable(),
    linkCaption: z.string().nullable(),
    snapshotUrl: z.string().url().nullable(),
    creationTime: z.string().nullable(),
    deliveryStart: z.string().nullable(),
    deliveryStop: z.string().nullable(),
    firstSeenAt: z.string(),
    lastSeenAt: z.string(),
    fetchedAt: z.string(),
    observedActiveDays: z.number().int().nonnegative(),
    platforms: z.array(z.string()),
    languages: z.array(z.string()),
  })
  .strict();
export type CompetitorAdPublicMetadata = z.infer<typeof competitorAdPublicMetadataSchema>;

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
  publicMetadata: competitorAdPublicMetadataSchema.optional(),
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
