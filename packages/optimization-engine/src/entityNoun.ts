// What the thing a portfolio moves is called, on the platform it lives on.
//
// The engine scores Meta ad sets, Google campaigns and TikTok ad groups through the same
// pipeline, but a sentence a human reads has to name the thing in front of them. A Google-only
// portfolio told "1 of 2 ad sets bid for another result" is told about an entity its account
// does not have.
//
// Pure and import-free on purpose: explain.ts (which the Frontend renders from) calls it, and
// it must stay safe on either side of the boundary. Tolerant of loose strings for the same
// reason — `cycle_items.diagnostics` is jsonb.

/** The two facts that decide the noun. Absent platform means Meta: every Meta snapshot and
 *  every row written before multi-platform carries neither field. */
export type EntityNounSource = {
  platform?: string | null;
  level?: string | null;
};

const PLATFORM_NAME: Readonly<Record<string, string>> = {
  meta: 'Meta',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
};

/** The platform's own name for an entity whose level the caller did not say. */
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

const plural = (noun: string): string => `${noun}s`;

/** The noun for `count` entities: singular for one, plural otherwise. */
export function entityNounFor(entity: EntityNounSource | null | undefined, count: number): string {
  const noun = entityNoun(entity);
  return count === 1 ? noun : plural(noun);
}

/** The plural for a collection. One platform cycle is one platform, but its entities may sit
 *  at two levels (TikTok campaigns and ad groups); both names are said rather than one guessed. */
export function collectionNoun(entities: readonly EntityNounSource[], count: number): string {
  const nouns = [...new Set(entities.map(entityNoun))];
  if (nouns.length <= 1) return entityNounFor(entities[0], count);
  return nouns.map((noun) => (count === 1 ? noun : plural(noun))).join(' / ');
}

const SPANISH: Readonly<Record<string, readonly [string, string]>> = {
  'ad set': ['conjunto', 'conjuntos'],
  campaign: ['campaña', 'campañas'],
  'ad group': ['grupo de anuncios', 'grupos de anuncios'],
};

/** The Spanish noun the recommendation titles use ("conjuntos" on Meta, as before). */
export function entityNounEs(entity: EntityNounSource | null | undefined, count: number): string {
  const [one, many] = SPANISH[entityNoun(entity)] ?? ['conjunto', 'conjuntos'];
  return count === 1 ? one : many;
}

/** The plural whatever the count — for "N of M ad sets", which has always read plural. */
export function collectionPlural(entities: readonly EntityNounSource[]): string {
  return collectionNoun(entities, Number.POSITIVE_INFINITY);
}

/** "Meta", "Google Ads", "TikTok Ads" — for the sentence that says where to fix something. */
export function platformName(entity: EntityNounSource | null | undefined): string {
  if (isMetaEntity(entity)) return 'Meta';
  return PLATFORM_NAME[entity?.platform ?? ''] ?? 'the ad platform';
}

/** What reports a conversion on that platform. Meta's answer stays the one its copy always gave. */
export function conversionTracking(entity: EntityNounSource | null | undefined): string {
  if (isMetaEntity(entity)) return 'the pixel / CAPI';
  return `${platformName(entity)} conversion tracking`;
}
