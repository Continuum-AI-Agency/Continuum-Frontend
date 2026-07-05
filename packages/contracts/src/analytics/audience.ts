// Canonical organic audience-demographics contract: follower age/gender/geo
// demographics + the follower-vs-non-follower REACH split that the
// `fetch-organic-analytics` edge function collects for Instagram (and the reach
// split only, for Facebook). Until now this shape lived only inline in the Deno
// edge function and was re-declared as Zod on the Frontend; this is the single
// source of truth the Backend generation grounding and the MCP audience tools
// import via `@continuum/contracts`.
//
// NOTE: the Deno edge function (`supabase/functions/fetch-organic-analytics/
// lib/types.ts`) keeps its own inline copy because it cannot import this package
// under Deno resolution. The two must stay STRUCTURALLY IN SYNC — if you change
// a field here, mirror it there (and vice-versa).
//
// `audienceBreakdown` is REACH-based (followers vs non-followers *reached*), not
// an absolute follower count — copy derived from it must say "reached", never
// "you have N followers".

import { z } from "zod";

export const audienceDemographicSegmentSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  countryCode: z.string().optional(),
});
export type AudienceDemographicSegment = z.infer<typeof audienceDemographicSegmentSchema>;

export const audienceDemographicsSchema = z.object({
  gender: z.array(audienceDemographicSegmentSchema).default([]),
  age: z.array(audienceDemographicSegmentSchema).default([]),
  country: z.array(audienceDemographicSegmentSchema).optional(),
  city: z.array(audienceDemographicSegmentSchema).optional(),
  timeframe: z.string().optional(),
});
export type AudienceDemographics = z.infer<typeof audienceDemographicsSchema>;

export const audienceBreakdownSchema = z.object({
  followers: z.number(),
  nonFollowers: z.number(),
});
export type AudienceBreakdown = z.infer<typeof audienceBreakdownSchema>;

// True when at least one demographic dimension carries data. Pure port of
// `get-organic-insights/reconcile.ts` `hasDemographics` so the Backend
// cache-row selector and the edge reconcile agree on "row has demographics".
export function hasAudienceDemographics(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const demographics = value as Record<string, unknown>;
  return (["gender", "age", "country", "city"] as const).some((key) => {
    const entries = demographics[key];
    return Array.isArray(entries) && entries.length > 0;
  });
}

// --- Digest formatter -------------------------------------------------------
// Compact, deterministic `<audience_demographics>` block for injection into the
// creative agent's grounding, mirroring the style of `formatWinningAnglesDigest`.
// Fail-soft: returns "" when there is nothing to say, so it never blocks
// generation. Each dimension is normalized to WITHIN-dimension share
// (value / sum) so it reads correctly whether the platform emits raw counts or
// pre-percentaged values.

interface RankedSegment {
  label: string;
  share: number; // 0..1
}

function sumValues(segments: AudienceDemographicSegment[] | undefined): number {
  if (!Array.isArray(segments)) return 0;
  return segments.reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0);
}

// Rank segments by share of `denominator`. When no denominator is given, the
// dimension is treated as exhaustive (age/gender) and normalized to its own sum.
// Country/city arrays are top-N truncated, so they pass the exhaustive
// follower-base total as `denominator` to avoid overstating shares.
function rankByShare(
  segments: AudienceDemographicSegment[] | undefined,
  denominator?: number,
): RankedSegment[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const total = denominator && denominator > 0 ? denominator : sumValues(segments);
  if (total <= 0) return [];
  return segments
    .filter((s) => Number.isFinite(s.value) && s.value > 0)
    .map((s) => ({ label: s.label, share: s.value / total }))
    .sort((a, b) => b.share - a.share);
}

function pct(share: number): number {
  return Math.round(share * 100);
}

function ageLine(age: AudienceDemographicSegment[] | undefined): string | null {
  const ranked = rankByShare(age);
  if (ranked.length === 0) return null;
  const core = `${ranked[0].label} (${pct(ranked[0].share)}%)`;
  if (ranked.length === 1) return `- Core age: ${core}`;
  return `- Core age: ${core}, then ${ranked[1].label} (${pct(ranked[1].share)}%)`;
}

function genderLine(gender: AudienceDemographicSegment[] | undefined): string | null {
  const ranked = rankByShare(gender);
  if (ranked.length === 0) return null;
  const parts = ranked.map((r) => `${pct(r.share)}% ${r.label.toLowerCase()}`);
  return `- Gender skew: ${parts.join(" / ")}`;
}

function geoLine(
  country: AudienceDemographicSegment[] | undefined,
  followerBase: number,
): string | null {
  const ranked = rankByShare(country, followerBase).slice(0, 2);
  if (ranked.length === 0) return null;
  const parts = ranked.map((r) => `${r.label} (${pct(r.share)}%)`);
  return `- Top geo: ${parts.join(", ")}`;
}

function reachSplit(breakdown: AudienceBreakdown | null): { followerShare: number; nonFollowerShare: number } | null {
  if (!breakdown) return null;
  const followers = Number.isFinite(breakdown.followers) ? breakdown.followers : 0;
  const nonFollowers = Number.isFinite(breakdown.nonFollowers) ? breakdown.nonFollowers : 0;
  const total = followers + nonFollowers;
  if (total <= 0) return null;
  return { followerShare: followers / total, nonFollowerShare: nonFollowers / total };
}

function directive(demographics: AudienceDemographics | null, split: ReturnType<typeof reachSplit>): string {
  if (split) {
    return split.nonFollowerShare >= 0.5
      ? "earn the cold viewer's first 2 seconds; assume no prior brand knowledge"
      : "reward the existing community; go deeper, not broader";
  }
  if (demographics && rankByShare(demographics.age).length > 0) {
    return "write for the core segment shown above; match its language and cultural references";
  }
  return "write for the audience shown above";
}

export function formatAudienceDemographicsDigest(
  demographics: AudienceDemographics | null,
  breakdown: AudienceBreakdown | null,
): string {
  const split = reachSplit(breakdown);
  // Exhaustive follower-base total (age/gender buckets are exhaustive; country is
  // top-N truncated) so geo shares read as share-of-total, not share-of-shown.
  const followerBase = demographics
    ? sumValues(demographics.age) || sumValues(demographics.gender)
    : 0;
  const lines = [
    demographics ? ageLine(demographics.age) : null,
    demographics ? genderLine(demographics.gender) : null,
    demographics ? geoLine(demographics.country, followerBase) : null,
    split
      ? `- Reach split: ${pct(split.nonFollowerShare)}% non-followers / ${pct(split.followerShare)}% followers`
      : null,
  ].filter((line): line is string => line !== null);

  if (lines.length === 0) return "";

  let block = "<audience_demographics>\n";
  block += "Who this brand actually reaches (platform analytics — write FOR these people):\n";
  block += `${lines.join("\n")}\n`;
  block += `Creative directive: ${directive(demographics, split)}\n`;
  block += "</audience_demographics>\n\n";
  return block;
}
