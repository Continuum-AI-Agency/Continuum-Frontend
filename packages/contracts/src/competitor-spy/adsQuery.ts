// Single source of truth for the competitor "paid ads" read product: the organic
// agent, Jaina, and the Continuum MCP all answer "what paid ads are my tracked
// competitors running, with what hooks/themes, and how long have they been live"
// by reading the SAME durable competitor-ad-spy snapshot store through this core.
//
// Like `media/metadataSearch.ts`, the orchestration core (`runCompetitorAdsQuery`)
// is a pure function whose I/O is injected, so the same logic backs every surface
// without a runtime's Supabase client leaking into the contracts package. It reads
// only the pre-produced/cached snapshots (copy, analysis, CDN/age metadata) — never
// the media bytes, and never a live Meta fetch.

import { z } from "zod";
import type { TimelineEntry } from "./index";

// --- Request shape ----------------------------------------------------------

export const COMPETITOR_ADS_QUERY_DEFAULT_LIMIT = 20;
export const COMPETITOR_ADS_QUERY_MAX_LIMIT = 50;

export const competitorAdsQueryInputSchema = z
  .object({
    brandId: z.string().uuid(),
    // Explicit tracked-competitor id wins. When absent, `competitorRef` (a free-text
    // name/handle) is resolved against the brand's tracked competitors, PREFERRING
    // the user's pre-tagged ones; when neither is given the query spans every tracked
    // competitor for the brand.
    competitorId: z.string().uuid().optional(),
    competitorRef: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["active", "paused"]).optional(),
    // Full-text query over ad copy + analysis fields (ad_search_vector).
    q: z.string().trim().min(1).max(120).optional(),
    since: z.string().optional(),
    until: z.string().optional(),
    sort: z.enum(["first_seen_at", "last_seen_at"]).default("last_seen_at"),
    dir: z.enum(["asc", "desc"]).default("desc"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(COMPETITOR_ADS_QUERY_MAX_LIMIT)
      .default(COMPETITOR_ADS_QUERY_DEFAULT_LIMIT),
  })
  .strict();
export type CompetitorAdsQueryInput = z.infer<typeof competitorAdsQueryInputSchema>;
// Pre-default input type (sort/dir/limit optional) — what the backend binding accepts.
export type CompetitorAdsQueryArgs = z.input<typeof competitorAdsQueryInputSchema>;

// Tool-facing input schema: every surface (organic agent, Jaina, MCP) supplies
// brandId from its own auth context, so the agent-visible schema omits it.
export const competitorAdsToolInputSchema = competitorAdsQueryInputSchema.omit({ brandId: true });
export type CompetitorAdsToolInput = z.infer<typeof competitorAdsToolInputSchema>;

// --- Response shape (compact, model-friendly) -------------------------------

export const competitorAdAnalysisSummarySchema = z.object({
  sentiment: z.string().nullable(),
  hook: z.string().nullable(),
  hookArchetype: z.string().nullable(),
  primaryTheme: z.string().nullable(),
  themes: z.array(z.string()),
});
export type CompetitorAdAnalysisSummary = z.infer<typeof competitorAdAnalysisSummarySchema>;

// One ad, with its AGE surfaced first-class (observedActiveDays = days Continuum has
// seen it live; deliveryStart = Meta's own start). Carries the creative-sentiment
// analysis when the analysis pass has run for the snapshot.
export const competitorAdSummarySchema = z.object({
  snapshotId: z.string(),
  competitorId: z.string(),
  competitor: z.string(),
  status: z.enum(["active", "paused"]),
  body: z.string().nullable(),
  cta: z.string().nullable(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  observedActiveDays: z.number().nullable(),
  deliveryStart: z.string().nullable(),
  deliveryStop: z.string().nullable(),
  hasCreativeMedia: z.boolean(),
  analysis: competitorAdAnalysisSummarySchema.nullable(),
});
export type CompetitorAdSummary = z.infer<typeof competitorAdSummarySchema>;

export const competitorAdsQueryResultSchema = z.object({
  count: z.number().int().nonnegative(),
  ads: z.array(competitorAdSummarySchema),
});
export type CompetitorAdsQueryResult = z.infer<typeof competitorAdsQueryResultSchema>;

// --- Dependency-injected orchestration core ---------------------------------

// Mirrors the backend `TimelineQuery` (App/competitor-ad-spy/schemas.ts) so the
// runtime can pass its `queryTimeline` straight in as the dependency.
export interface CompetitorTimelineQuery {
  brandId: string;
  competitorId?: string;
  status?: "active" | "paused";
  q?: string;
  since?: string;
  until?: string;
  sort: "first_seen_at" | "last_seen_at";
  dir: "asc" | "desc";
  limit: number;
}

export interface CompetitorAdsQueryDeps {
  // Reads the durable ad-snapshot timeline (the cached store). Injected by the runtime.
  queryTimeline: (query: CompetitorTimelineQuery) => Promise<TimelineEntry[]>;
  // Resolves which tracked competitor to scope to, PREFERRING the user's pre-tagged
  // competitors. Returns null to span every tracked competitor for the brand. When
  // omitted, the core honors `input.competitorId` and ignores `competitorRef`.
  resolveCompetitorId?: (
    brandId: string,
    ref: { competitorId?: string; competitorRef?: string },
  ) => Promise<string | null>;
}

function toAnalysisSummary(analysis: TimelineEntry["analysis"]): CompetitorAdAnalysisSummary | null {
  if (!analysis) return null;
  return {
    sentiment: analysis.sentiment ?? null,
    hook: analysis.hook ?? null,
    hookArchetype: analysis.hookArchetype ?? null,
    primaryTheme: analysis.primaryTheme ?? null,
    themes: analysis.themes ?? [],
  };
}

function toAdSummary(entry: TimelineEntry): CompetitorAdSummary {
  return {
    snapshotId: entry.snapshotId,
    competitorId: entry.competitorId,
    competitor: entry.competitorName,
    status: entry.status,
    body: entry.body,
    cta: entry.cta,
    firstSeenAt: entry.firstSeenAt,
    lastSeenAt: entry.lastSeenAt,
    observedActiveDays: entry.publicMetadata?.observedActiveDays ?? null,
    deliveryStart: entry.publicMetadata?.deliveryStart ?? entry.deliveryStart ?? null,
    deliveryStop: entry.publicMetadata?.deliveryStop ?? entry.deliveryStop ?? null,
    hasCreativeMedia: entry.hasCreativeMedia ?? false,
    analysis: toAnalysisSummary(entry.analysis),
  };
}

// Pure orchestration: resolve competitor scope (prefer pre-tagged) → read cached
// snapshots → map to the compact, age-aware ad summary. No live Meta fetch.
export async function runCompetitorAdsQuery(
  deps: CompetitorAdsQueryDeps,
  input: CompetitorAdsQueryInput,
): Promise<CompetitorAdsQueryResult> {
  const competitorId = deps.resolveCompetitorId
    ? await deps.resolveCompetitorId(input.brandId, {
        competitorId: input.competitorId,
        competitorRef: input.competitorRef,
      })
    : (input.competitorId ?? null);

  const entries = await deps.queryTimeline({
    brandId: input.brandId,
    competitorId: competitorId ?? undefined,
    status: input.status,
    q: input.q,
    since: input.since,
    until: input.until,
    sort: input.sort,
    dir: input.dir,
    limit: input.limit,
  });

  const ads = entries.map(toAdSummary);
  return { count: ads.length, ads };
}
