// The Meta ad-set targeting spec as the Graph API actually shapes it — nested
// `flexible_spec` clauses, exclusions, custom audiences, placements, Advantage+ flag — plus
// the reads a card needs: which interests are live, and a one-line summary.
//
// `paid/audience-groups.ts` keeps its FLAT targeting schema because that one is a Jaina
// tool input (Gemini's Schema proto cannot take nested unions). This schema is the write
// shape and the read shape; it is deliberately `.loose()` so a spec read from Meta round-trips
// with fields we do not model.

import { z } from 'zod';

export const metaTargetingRefSchema = z
  .object({ id: z.string().min(1), name: z.string().optional() })
  .loose();
export type MetaTargetingRef = z.infer<typeof metaTargetingRefSchema>;

/** One AND-clause of interests / behaviors / demographics. Meta ORs inside a clause and
 *  ANDs the clauses of `flexible_spec` together. */
export const metaFlexibleSpecEntrySchema = z
  .object({
    interests: z.array(metaTargetingRefSchema).optional(),
    behaviors: z.array(metaTargetingRefSchema).optional(),
    demographics: z.array(metaTargetingRefSchema).optional(),
    life_events: z.array(metaTargetingRefSchema).optional(),
    industries: z.array(metaTargetingRefSchema).optional(),
    income: z.array(metaTargetingRefSchema).optional(),
  })
  .loose();
export type MetaFlexibleSpecEntry = z.infer<typeof metaFlexibleSpecEntrySchema>;

/** Regions, cities and zips are keyed (`key`), countries are codes; Meta echoes names too. */
const metaGeoPlaceSchema = z
  .object({ key: z.string().optional(), name: z.string().optional() })
  .loose();

export const metaGeoLocationsSchema = z
  .object({
    countries: z.array(z.string()).optional(),
    regions: z.array(metaGeoPlaceSchema).optional(),
    cities: z.array(metaGeoPlaceSchema).optional(),
    zips: z.array(metaGeoPlaceSchema).optional(),
    location_types: z.array(z.string()).optional(),
  })
  .loose();

export const metaTargetingSpecSchema = z
  .object({
    age_min: z.number().int().optional(),
    age_max: z.number().int().optional(),
    genders: z.array(z.number().int()).optional(),
    geo_locations: metaGeoLocationsSchema.optional(),
    excluded_geo_locations: metaGeoLocationsSchema.optional(),
    flexible_spec: z.array(metaFlexibleSpecEntrySchema).optional(),
    exclusions: metaFlexibleSpecEntrySchema.optional(),
    /** Legacy top-level clauses Meta still returns on older ad sets. */
    interests: z.array(metaTargetingRefSchema).optional(),
    behaviors: z.array(metaTargetingRefSchema).optional(),
    custom_audiences: z.array(metaTargetingRefSchema).optional(),
    excluded_custom_audiences: z.array(metaTargetingRefSchema).optional(),
    publisher_platforms: z.array(z.string()).optional(),
    facebook_positions: z.array(z.string()).optional(),
    instagram_positions: z.array(z.string()).optional(),
    messenger_positions: z.array(z.string()).optional(),
    audience_network_positions: z.array(z.string()).optional(),
    device_platforms: z.array(z.string()).optional(),
    locales: z.array(z.number().int()).optional(),
    /** Advantage+ audience: 1 = Meta may deliver beyond the spec, 0 = strict. */
    targeting_automation: z
      .object({ advantage_audience: z.union([z.literal(0), z.literal(1)]).optional() })
      .loose()
      .optional(),
  })
  .loose();
export type MetaTargetingSpec = z.infer<typeof metaTargetingSpecSchema>;

/** Every interest the spec targets, wherever Meta put it (legacy top-level or clauses). */
export function interestRefsOf(spec: MetaTargetingSpec): MetaTargetingRef[] {
  const seen = new Map<string, MetaTargetingRef>();
  const add = (refs: MetaTargetingRef[] | undefined) => {
    for (const ref of refs ?? []) if (!seen.has(ref.id)) seen.set(ref.id, ref);
  };
  add(spec.interests);
  for (const clause of spec.flexible_spec ?? []) add(clause.interests);
  return [...seen.values()];
}

export function behaviorRefsOf(spec: MetaTargetingSpec): MetaTargetingRef[] {
  const seen = new Map<string, MetaTargetingRef>();
  const add = (refs: MetaTargetingRef[] | undefined) => {
    for (const ref of refs ?? []) if (!seen.has(ref.id)) seen.set(ref.id, ref);
  };
  add(spec.behaviors);
  for (const clause of spec.flexible_spec ?? []) add(clause.behaviors);
  return [...seen.values()];
}

export type TargetingSummary = {
  /** "25–54", "18+", or null when the spec sets no age. */
  age: string | null;
  gender: 'all' | 'women' | 'men';
  /** Country codes plus "+N regions/cities" when present. */
  geo: string[];
  interests: string[];
  behaviors: string[];
  customAudienceCount: number;
  excludedCustomAudienceCount: number;
  /** null when the spec does not carry the flag. */
  advantageAudience: boolean | null;
};

export function summarizeTargetingSpec(spec: MetaTargetingSpec): TargetingSummary {
  const age =
    spec.age_min != null && spec.age_max != null
      ? `${spec.age_min}–${spec.age_max}`
      : spec.age_min != null
        ? `${spec.age_min}+`
        : spec.age_max != null
          ? `up to ${spec.age_max}`
          : null;
  const genders = spec.genders ?? [];
  const gender = genders.length === 1 ? (genders[0] === 2 ? 'women' : 'men') : ('all' as const);
  const geo: string[] = [...(spec.geo_locations?.countries ?? [])];
  const finer =
    (spec.geo_locations?.regions?.length ?? 0) +
    (spec.geo_locations?.cities?.length ?? 0) +
    (spec.geo_locations?.zips?.length ?? 0);
  if (finer > 0) geo.push(`+${finer} region${finer === 1 ? '' : 's'}/cities`);
  const flag = spec.targeting_automation?.advantage_audience;
  return {
    age,
    gender,
    geo,
    interests: interestRefsOf(spec).map((ref) => ref.name ?? ref.id),
    behaviors: behaviorRefsOf(spec).map((ref) => ref.name ?? ref.id),
    customAudienceCount: spec.custom_audiences?.length ?? 0,
    excludedCustomAudienceCount: spec.excluded_custom_audiences?.length ?? 0,
    advantageAudience: flag == null ? null : flag === 1,
  };
}

/** "25–54 · all · MX · 4 interests · Advantage+" — the card's one-line audience read. */
export function targetingSummaryLine(spec: MetaTargetingSpec): string {
  const s = summarizeTargetingSpec(spec);
  const parts = [s.age ?? 'any age', s.gender, s.geo.length > 0 ? s.geo.join(', ') : 'anywhere'];
  if (s.interests.length > 0) {
    parts.push(`${s.interests.length} interest${s.interests.length === 1 ? '' : 's'}`);
  }
  if (s.customAudienceCount > 0) {
    parts.push(`${s.customAudienceCount} custom audience${s.customAudienceCount === 1 ? '' : 's'}`);
  }
  if (s.advantageAudience) parts.push('Advantage+');
  return parts.join(' · ');
}
