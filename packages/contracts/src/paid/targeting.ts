// ---------------------------------------------------------------------------
// Meta ad-set targeting: the audience axis.
//
// "Which angle works for which audience" has been unanswerable here for a structural
// reason: there was no audience. `paid_media.adset_targeting_snapshots` has held 24
// designed columns and zero rows since it shipped, because nothing ever requested the
// targeting spec on a scheduled path — and `optimizer.adset_snapshots.audience_type` has
// no writer either, while two live consumers already read it (the fatigue frequency cap,
// which is 3.0 for cold traffic and 5.0 for warm, and `warm_audience_skew` in the
// creative win-rate RPC). Both have been reading null.
//
// These helpers live in contracts because the derivation must be identical wherever it
// runs: the optimizer service stamps snapshots with it, and the same normalization feeds
// the targeting-snapshot writer.
// ---------------------------------------------------------------------------

import type { AudienceType } from '../optimization/engine-contracts';

/** Meta's targeting spec, as returned. Deliberately untyped beyond "an object": the spec
 *  is large, versioned by Meta, and stored verbatim — narrowing it here would quietly
 *  discard the fields we cannot yet name, which is the one thing the snapshot table
 *  exists to prevent. */
export type TargetingSpec = Record<string, unknown>;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const idsOf = (value: unknown): string[] => {
  const out: string[] = [];
  for (const entry of asArray(value)) {
    if (typeof entry === 'string') {
      out.push(entry);
    } else if (entry && typeof entry === 'object') {
      const id = (entry as { id?: unknown }).id;
      if (typeof id === 'string') out.push(id);
      else if (typeof id === 'number') out.push(String(id));
    }
  }
  return out;
};

const stringsOf = (value: unknown): string[] =>
  asArray(value).filter((entry): entry is string => typeof entry === 'string');

const intsOf = (value: unknown): number[] =>
  asArray(value)
    .map((entry) => Number(entry))
    .filter((n) => Number.isFinite(n));

const intOrNull = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Geo targeting is a nested object of arrays keyed by granularity. Flatten it to the
 *  node ids the lattice indexes on, keeping the granularity in the key so `US` the
 *  country and `US` the region can never collide. */
function geoNodeIds(spec: TargetingSpec): string[] {
  const locations = spec.geo_locations;
  if (!locations || typeof locations !== 'object') return [];
  const out: string[] = [];
  for (const [granularity, value] of Object.entries(locations as Record<string, unknown>)) {
    for (const id of idsOf(value)) out.push(`${granularity}:${id}`);
    for (const id of stringsOf(value)) out.push(`${granularity}:${id}`);
  }
  return [...new Set(out)].sort();
}

/** The columns `paid_media.adset_targeting_snapshots` normalizes out of the spec. The
 *  spec itself is stored alongside them untouched — these are an index, not a summary. */
export type NormalizedTargeting = {
  ageMin: number | null;
  ageMax: number | null;
  genders: number[];
  customAudienceIds: string[];
  excludedCustomAudienceIds: string[];
  geoNodeIds: string[];
  publisherPlatforms: string[];
  placements: string[];
  devicePlatforms: string[];
};

export function normalizeTargeting(spec: TargetingSpec): NormalizedTargeting {
  // Meta splits placements across four per-platform arrays; the lattice wants one list.
  const placements = [
    ...stringsOf(spec.facebook_positions),
    ...stringsOf(spec.instagram_positions),
    ...stringsOf(spec.messenger_positions),
    ...stringsOf(spec.audience_network_positions),
  ];
  return {
    ageMin: intOrNull(spec.age_min),
    ageMax: intOrNull(spec.age_max),
    genders: intsOf(spec.genders),
    customAudienceIds: idsOf(spec.custom_audiences),
    excludedCustomAudienceIds: idsOf(spec.excluded_custom_audiences),
    geoNodeIds: geoNodeIds(spec),
    publisherPlatforms: stringsOf(spec.publisher_platforms),
    placements: [...new Set(placements)].sort(),
    devicePlatforms: stringsOf(spec.device_platforms),
  };
}

/**
 * Cold or warm?
 *
 * An INCLUDED custom audience means the ad set is aimed at people Meta already has a
 * list for. Exclusions do not count — excluding existing customers is what prospecting
 * looks like, not the opposite.
 *
 * Known limit, stated because a threshold depends on it: a lookalike audience is also
 * delivered as a custom audience id, so a pure lookalike ad set reads as `retargeting`
 * here and gets the warmer frequency cap (5.0 rather than 3.0) — making F2 slightly
 * SLOWER to fire on it. Resolving lookalikes needs a per-id lookup against the audience
 * catalogue; until something needs that, this stays an approximation that says so. The
 * reach-curve trigger (F3) is unaffected: it reads no audience type at all.
 */
export function audienceTypeFromTargeting(spec: TargetingSpec | null | undefined): AudienceType {
  if (!spec || typeof spec !== 'object') return 'unknown';
  const { customAudienceIds } = normalizeTargeting(spec);
  return customAudienceIds.length > 0 ? 'retargeting' : 'prospecting';
}

/**
 * A stable string for one targeting spec, so an unchanged ad set dedupes to one row per
 * day instead of one row per cycle.
 *
 * Key order out of Meta is not guaranteed, so `JSON.stringify` on the raw spec would
 * produce a different hash for an identical audience and defeat the dedupe index. Keys
 * are sorted at every depth; array ORDER is preserved, because in a targeting spec it
 * can carry meaning.
 */
export function canonicalizeTargeting(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalizeTargeting).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeTargeting(v)}`).join(',')}}`;
}
