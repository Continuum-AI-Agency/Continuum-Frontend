// Foreplay-style "Discovery" smart search: one keyboard-driven query over the
// brand's tracked competitors and their cached ad snapshots. Results are grouped
// so the command palette can render sections — Brands (tracked competitors with
// their cached ad counts), Ads (copy/hook matches via the durable
// ad_search_vector), and Actions (e.g. "search Meta & track a new brand" when
// nothing matches). Reads only the pre-produced/cached store; no live Meta fetch.
//
// This is the wire shape shared by the Backend route and the Frontend palette.

import { z } from "zod";

export const SMART_SEARCH_DEFAULT_AD_LIMIT = 8;
export const SMART_SEARCH_MAX_AD_LIMIT = 25;

export const competitorSmartSearchQueryInputSchema = z
  .object({
    brandId: z.string().uuid(),
    q: z.string().trim().min(2).max(120),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SMART_SEARCH_MAX_AD_LIMIT)
      .default(SMART_SEARCH_DEFAULT_AD_LIMIT),
  })
  .strict();
export type CompetitorSmartSearchQueryInput = z.infer<typeof competitorSmartSearchQueryInputSchema>;

// A tracked competitor surfaced as a "Brand" row, carrying its cached ad count
// (foreplay's "6,304 Ads"). `handle` is the @instagram username when known, else
// the slug, so the palette always has a monospace secondary line to render.
export const smartSearchBrandSchema = z
  .object({
    competitorId: z.string().uuid(),
    name: z.string(),
    handle: z.string().nullable(),
    adCount: z.number().int().nonnegative(),
  })
  .strict();
export type SmartSearchBrand = z.infer<typeof smartSearchBrandSchema>;

// A compact ad-copy match (one snapshot) — enough to render a palette row and
// deep-link to it; the full record is read via the timeline endpoint.
export const smartSearchAdSchema = z
  .object({
    snapshotId: z.string().uuid(),
    competitorId: z.string().uuid(),
    competitorName: z.string(),
    body: z.string().nullable(),
    status: z.enum(["active", "paused"]),
    hasCreativeMedia: z.boolean(),
  })
  .strict();
export type SmartSearchAd = z.infer<typeof smartSearchAdSchema>;

// Discovery affordance: when the query matches no tracked brand, the palette
// offers to run the existing search/resolve/track flow against Meta for `query`.
export const smartSearchActionKindSchema = z.enum(["track_new"]);
export type SmartSearchActionKind = z.infer<typeof smartSearchActionKindSchema>;

export const smartSearchActionSchema = z
  .object({
    kind: smartSearchActionKindSchema,
    query: z.string(),
  })
  .strict();
export type SmartSearchAction = z.infer<typeof smartSearchActionSchema>;

export const competitorSmartSearchResultSchema = z
  .object({
    query: z.string(),
    brands: z.array(smartSearchBrandSchema),
    ads: z.array(smartSearchAdSchema),
    actions: z.array(smartSearchActionSchema),
  })
  .strict();
export type CompetitorSmartSearchResult = z.infer<typeof competitorSmartSearchResultSchema>;
