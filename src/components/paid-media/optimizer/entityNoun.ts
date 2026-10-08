// What the thing a portfolio moves is called, on the platform it lives on: an ad set on Meta,
// a campaign on Google Ads, an ad group on TikTok. Mirrors the engine's entityNoun
// (packages/optimization-engine/src/entityNoun.ts), whose sentences this page reads back, so a
// Google-only portfolio is never told about "ad sets" its account does not have.
//
// Tolerant of loose strings: platform and level arrive on cycle_items rows as jsonb passthrough.

/** The two facts that decide the noun. Absent platform means Meta: every row written before
 *  cycle_items carried a platform is a Meta row. */
export type EntityNounSource = {
  platform?: string | null;
  level?: string | null;
};

const PLATFORM_NAME: Readonly<Record<string, string>> = {
  meta: 'Meta',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
};

/** The platform's own name for an entity whose level the row did not say. */
const PLATFORM_UNIT: Readonly<Record<string, string>> = {
  google_ads: 'campaign',
  tiktok_ads: 'ad group',
};

export function isMetaEntity(entity: EntityNounSource | null | undefined): boolean {
  const platform = entity?.platform;
  return platform == null || platform === '' || platform === 'meta';
}

/** "ad set" on Meta; "campaign" or "ad group" elsewhere, by the entity's neutral level. */
export function entityNoun(entity: EntityNounSource | null | undefined): string {
  if (isMetaEntity(entity)) return 'ad set';
  if (entity?.level === 'campaign') return 'campaign';
  if (entity?.level === 'group') return 'ad group';
  return PLATFORM_UNIT[entity?.platform ?? ''] ?? 'campaign';
}

/** The plural for a collection. Entities at two levels (TikTok campaigns and ad groups) name
 *  both rather than guess one. An empty collection reads as Meta, as before. */
export function collectionPlural(entities: readonly EntityNounSource[]): string {
  const nouns = [...new Set((entities.length ? entities : [null]).map(entityNoun))];
  return nouns.map((noun) => `${noun}s`).join(' / ');
}

/** "Meta", "Google Ads", "TikTok Ads" — for the sentence that says where to fix something. */
export function platformName(entity: EntityNounSource | null | undefined): string {
  if (isMetaEntity(entity)) return 'Meta';
  return PLATFORM_NAME[entity?.platform ?? ''] ?? 'the ad platform';
}

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/** The platform and level a loose cycle_items / recommendations row carries: `platform` is a
 *  column, the level sits in `entity_ref` ({platform, level, nativeLevel, id, …}). Null on a
 *  row that says neither. */
export function entityOf(row: Record<string, unknown> | null | undefined): EntityNounSource | null {
  const ref = row?.entity_ref;
  const refObject =
    ref && typeof ref === 'object' && !Array.isArray(ref) ? (ref as Record<string, unknown>) : null;
  const platform = textOf(row?.platform) ?? textOf(refObject?.platform);
  const level = textOf(refObject?.level);
  return platform || level ? { platform, level } : null;
}
