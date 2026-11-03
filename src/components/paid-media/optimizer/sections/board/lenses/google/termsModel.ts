// G07 Search terms on the adaptive board: the account's search-term spend by intent — brand,
// competitor, wrong intent and the rest — read the way the Optimizer's own detectors read it
// (packages/optimization-engine accountDetectors: V2 brand, E4 competitor, P3 wrong intent),
// each bucket split into the groups a person recognises (roots, competitor names, themes).
//
// Where each list comes from, so a bucket is never guessed:
// - brand and competitor: the account profile google_signals carries next to the terms (what the
//   team stored, or what the edge inferred from the brand name and from these same terms);
// - wrong intent: the Optimizer's intent card, whose negative lists are the only place the
//   off-intent themes reach the browser. With no card the bucket says so instead of reading 0.
// Nothing here writes.

import type { GoogleSignalsRead, PlatformCard } from '@continuum/contracts';
import { groupByRoot, type SearchTerm } from '../../../google/views/searchTermRoots';

type GoogleBlocks = NonNullable<NonNullable<GoogleSignalsRead['signals']>['google']>;
type AccountProfile = NonNullable<GoogleBlocks['profile']>;

export const TERM_BUCKETS = ['brand', 'competitor', 'wrong_intent', 'rest'] as const;
export type TermBucket = (typeof TERM_BUCKETS)[number];
export type FlaggedBucket = Exclude<TermBucket, 'rest'>;
const FLAGGED: readonly FlaggedBucket[] = ['brand', 'competitor', 'wrong_intent'];

/** Where each bucket starts to matter: the detectors' own lines (BRAND_MIN_SHARE,
 *  COMPETITOR_MIN_SHARE, INTENT_MIN_SHARE), as shares of the search-term spend. */
export const TERM_THRESHOLDS: Record<FlaggedBucket, number> = {
  brand: 0.3,
  competitor: 0.01,
  wrong_intent: 0.03,
};

export const TERM_BUCKET_LABEL: Record<TermBucket, string> = {
  brand: 'Brand',
  competitor: 'Competitor',
  wrong_intent: 'Wrong intent',
  rest: 'Other terms',
};

/** The engine's normalizeTerm: lower case, no accents, anything but letters and digits a space.
 *  Mirrored so the lens tells brand from non-brand exactly as the card that cites it did. */
export function normalizeTerm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** The engine's mentions, on normalized text: the phrase as whole words, or glued when it has
 *  five letters or more ("vivo47" mentions "vivo 47"). */
export function mentionsPhrase(term: string, phrase: string): boolean {
  if (!phrase) return false;
  if (` ${term} `.includes(` ${phrase} `)) return true;
  const glued = phrase.replace(/ /g, '');
  return glued.length >= 5 && term.replace(/ /g, '').includes(glued);
}

/** One group a bucket splits into: a root (brand, rest), a competitor or a theme. */
export type TermGroup = {
  key: string;
  label: string;
  spend: number;
  conversions: number;
  /** By spend, most first. */
  terms: SearchTerm[];
};

export type BucketFigure = {
  bucket: TermBucket;
  spend: number;
  /** Of the search-term spend, 0–1. */
  share: number;
  conversions: number;
  termCount: number;
  /** By spend, most first. */
  groups: TermGroup[];
  /** Why the bucket cannot be told; null when it can. An unknown bucket's terms read as rest. */
  unknown: string | null;
  /** Over the detector's line. Never for rest, never for an unknown bucket. */
  over: boolean;
};

/** One rectangle of the treemap: a group, or the bucket's smaller groups folded together. */
export type TermTile = {
  id: string;
  bucket: TermBucket;
  label: string;
  spend: number;
  conversions: number;
  termCount: number;
  /** The group it draws; null for the folded tile. */
  groupKey: string | null;
};

export type TermsModel =
  | { kind: 'unread'; reason: string }
  | { kind: 'empty'; window: { since: string; until: string } }
  | {
      kind: 'read';
      window: { since: string; until: string };
      total: number;
      termCount: number;
      buckets: Record<TermBucket, BucketFigure>;
      /** By spend, most first. */
      tiles: TermTile[];
      /** The flagged bucket the lens leads with: the one over its line that spent most, else
       *  brand when it can be told and spent; null when neither holds. */
      headline: FlaggedBucket | null;
      /** Every flagged bucket over its line, by spend. */
      flagged: FlaggedBucket[];
      /** The groups that spent most across the buckets. */
      topGroups: { bucket: TermBucket; group: TermGroup }[];
    };

/** The lists that tell the buckets apart, each normalized, or why it is missing. */
export type TermLists = {
  brand: { terms: string[] } | { reason: string };
  competitors: { terms: string[] } | { reason: string };
  /** Term → theme, from the intent card. */
  wrongIntent: { byTerm: Map<string, string> } | { reason: string };
  /** Term → competitor, from the competitor card: a stored list the profile no longer holds
   *  still names the terms the card counted. */
  competitorCard: Map<string, string>;
};

const PROFILE_UNREAD = "the account profile wasn't read with the terms";

/** Said when the Optimizer holds no intent card for the account. */
export const NO_INTENT_CARD =
  'no Optimizer intent card this cycle (it opens at 3% of the term spend)';

function findingCards(cards: readonly PlatformCard[] | null, idea: string) {
  return (cards ?? []).flatMap((card) =>
    card.variant === 'google_account_finding' && card.idea === idea ? [card] : [],
  );
}

/** Each negative list of the cards as term → its theme. */
function negativesByTerm(cards: ReturnType<typeof findingCards>): Map<string, string> {
  const byTerm = new Map<string, string>();
  for (const card of cards) {
    for (const list of card.negatives ?? []) {
      for (const term of list.terms) byTerm.set(normalizeTerm(term), list.theme);
    }
  }
  return byTerm;
}

/**
 * The lists the buckets are read with. `cards` is null when the Optimizer's cards could not be
 * read: wrong intent then cannot be told, and says why.
 */
export function termListsOf(
  profile: AccountProfile | undefined,
  cards: readonly PlatformCard[] | null,
  cardsUnread: string,
): TermLists {
  const intent = findingCards(cards, 'intent_negatives');
  const brandTerms = profile ? profile.brand_terms.map(normalizeTerm).filter(Boolean) : null;
  return {
    brand: !profile
      ? { reason: PROFILE_UNREAD }
      : brandTerms && brandTerms.length > 0
        ? { terms: brandTerms }
        : { reason: 'no brand terms are known for this account' },
    competitors: profile
      ? { terms: profile.competitor_terms.map(normalizeTerm).filter(Boolean) }
      : { reason: PROFILE_UNREAD },
    wrongIntent:
      cards === null
        ? { reason: cardsUnread }
        : intent.length > 0
          ? { byTerm: negativesByTerm(intent) }
          : { reason: NO_INTENT_CARD },
    competitorCard: negativesByTerm(findingCards(cards, 'competitor_terms')),
  };
}

type Classified = { term: SearchTerm; bucket: TermBucket; group: string | null };

/** Brand first, then competitor, then wrong intent: the order the detectors take terms in. */
function classify(term: SearchTerm, lists: TermLists): Classified {
  const text = normalizeTerm(term.term);
  if ('terms' in lists.brand && lists.brand.terms.some((brand) => mentionsPhrase(text, brand))) {
    return { term, bucket: 'brand', group: null };
  }
  const competitor =
    ('terms' in lists.competitors
      ? lists.competitors.terms.find((name) => mentionsPhrase(text, name))
      : undefined) ?? lists.competitorCard.get(text);
  if (competitor) return { term, bucket: 'competitor', group: competitor };
  const theme = 'byTerm' in lists.wrongIntent ? lists.wrongIntent.byTerm.get(text) : undefined;
  if (theme) return { term, bucket: 'wrong_intent', group: theme };
  return { term, bucket: 'rest', group: null };
}

function byNamedGroup(entries: readonly Classified[]): TermGroup[] {
  const groups = new Map<string, TermGroup>();
  for (const { term, group } of entries) {
    const label = group ?? term.term;
    const row = groups.get(label) ?? {
      key: label,
      label,
      spend: 0,
      conversions: 0,
      terms: [],
    };
    row.spend += term.totals.spend;
    row.conversions += term.totals.conversions;
    row.terms.push(term);
    groups.set(label, row);
  }
  const out = [...groups.values()];
  for (const group of out) group.terms.sort((a, b) => b.totals.spend - a.totals.spend);
  return out.sort((a, b) => b.spend - a.spend);
}

function groupsOf(bucket: TermBucket, entries: readonly Classified[]): TermGroup[] {
  if (bucket === 'competitor' || bucket === 'wrong_intent') return byNamedGroup(entries);
  return groupByRoot(entries.map((entry) => entry.term)).map((root) => ({
    key: root.root,
    label: root.root,
    spend: root.spend,
    conversions: root.conversions,
    terms: root.terms,
  }));
}

/** A group under this share of the term spend folds into its bucket's last tile. */
export const TILE_MIN_SHARE = 0.04;
/** At most this many groups of one bucket draw a tile of their own. */
export const TILES_PER_BUCKET = 4;

function tilesOf(figure: BucketFigure, total: number): TermTile[] {
  if (figure.spend <= 0) return [];
  const own: TermGroup[] = [];
  for (const group of figure.groups) {
    if (own.length >= TILES_PER_BUCKET || group.spend / total < TILE_MIN_SHARE) break;
    own.push(group);
  }
  const tiles: TermTile[] = own.map((group) => ({
    id: `${figure.bucket}:${group.key}`,
    bucket: figure.bucket,
    label: group.label,
    spend: group.spend,
    conversions: group.conversions,
    termCount: group.terms.length,
    groupKey: group.key,
  }));
  const folded = figure.groups.slice(own.length);
  const spend = folded.reduce((sum, group) => sum + group.spend, 0);
  if (spend > 0) {
    tiles.push({
      id: `${figure.bucket}:*`,
      bucket: figure.bucket,
      label:
        own.length === 0
          ? TERM_BUCKET_LABEL[figure.bucket]
          : `${TERM_BUCKET_LABEL[figure.bucket]} · ${folded.length} more`,
      spend,
      conversions: folded.reduce((sum, group) => sum + group.conversions, 0),
      termCount: folded.reduce((sum, group) => sum + group.terms.length, 0),
      groupKey: null,
    });
  }
  return tiles;
}

function unknownOf(bucket: TermBucket, lists: TermLists): string | null {
  if (bucket === 'brand') return 'reason' in lists.brand ? lists.brand.reason : null;
  if (bucket === 'competitor') {
    return 'reason' in lists.competitors && lists.competitorCard.size === 0
      ? lists.competitors.reason
      : null;
  }
  if (bucket === 'wrong_intent') {
    return 'reason' in lists.wrongIntent ? lists.wrongIntent.reason : null;
  }
  return null;
}

/** The read's terms with their buckets, or why there are none to show. */
export function buildTermsModel(read: GoogleSignalsRead, lists: TermLists): TermsModel {
  if (!read.signals) {
    return {
      kind: 'unread',
      reason: `The Google read came back incomplete${read.rejected.length ? `: ${read.rejected.join('; ')}` : ''}`,
    };
  }
  const window = read.signals.window;
  const terms = read.signals.google?.search_terms;
  if (!terms) {
    return {
      kind: 'unread',
      reason: read.skipped.read_failed_search_terms
        ? "Google's search-term read failed"
        : 'Search terms were not read for this account',
    };
  }
  const spent = terms.filter((term) => term.totals.spend > 0);
  const total = spent.reduce((sum, term) => sum + term.totals.spend, 0);
  if (total <= 0) return { kind: 'empty', window };

  const classified = spent.map((term) => classify(term, lists));
  const buckets = Object.fromEntries(
    TERM_BUCKETS.map((bucket) => {
      const entries = classified.filter((entry) => entry.bucket === bucket);
      const spend = entries.reduce((sum, entry) => sum + entry.term.totals.spend, 0);
      const unknown = unknownOf(bucket, lists);
      const share = spend / total;
      const figure: BucketFigure = {
        bucket,
        spend,
        share,
        conversions: entries.reduce((sum, entry) => sum + entry.term.totals.conversions, 0),
        termCount: entries.length,
        groups: groupsOf(bucket, entries),
        unknown,
        over: bucket !== 'rest' && unknown === null && share >= TERM_THRESHOLDS[bucket],
      };
      return [bucket, figure];
    }),
  ) as Record<TermBucket, BucketFigure>;

  const flagged = FLAGGED.filter((bucket) => buckets[bucket].over).sort(
    (a, b) => buckets[b].spend - buckets[a].spend,
  );
  const tiles = TERM_BUCKETS.flatMap((bucket) => tilesOf(buckets[bucket], total)).sort(
    (a, b) => b.spend - a.spend,
  );
  const topGroups = TERM_BUCKETS.flatMap((bucket) =>
    buckets[bucket].groups.map((group) => ({ bucket, group })),
  )
    .sort((a, b) => b.group.spend - a.group.spend)
    .slice(0, 6);

  return {
    kind: 'read',
    window,
    total,
    termCount: spent.length,
    buckets,
    tiles,
    headline:
      flagged[0] ?? (buckets.brand.unknown === null && buckets.brand.spend > 0 ? 'brand' : null),
    flagged,
    topGroups,
  };
}

/** The terms a selection lists: one tile's group, or a whole bucket. By spend, most first. */
export function termsOfSelection(
  model: Extract<TermsModel, { kind: 'read' }>,
  selection: { bucket: TermBucket; groupKey: string | null; folded: boolean },
): SearchTerm[] {
  const groups = model.buckets[selection.bucket].groups;
  const own = model.tiles
    .filter((tile) => tile.bucket === selection.bucket && tile.groupKey !== null)
    .map((tile) => tile.groupKey);
  const picked = selection.folded
    ? groups.filter((group) => !own.includes(group.key))
    : selection.groupKey === null
      ? groups
      : groups.filter((group) => group.key === selection.groupKey);
  return picked.flatMap((group) => group.terms).sort((a, b) => b.totals.spend - a.totals.spend);
}

// ---------------------------------------------------------------------------
// The treemap's layout: squarified (Bruls, Huizing & van Wijk), the same routine the design
// page draws with. Areas stay proportional to spend at any box size, since the box scales both
// axes by the same factor; only how square the tiles are depends on the box's shape.
// ---------------------------------------------------------------------------

export type TileRect<T> = T & { x: number; y: number; w: number; h: number };

/** Lays `items` (value > 0, largest first) into a `width` × `height` box. */
export function squarify<T extends { value: number }>(
  items: readonly T[],
  width: number,
  height: number,
): TileRect<T>[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return [];
  const scale = (width * height) / total;
  let queue = items.map((item) => ({ item, area: item.value * scale }));
  const out: TileRect<T>[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  while (queue.length > 0) {
    const side = Math.min(w, h);
    const worst = (row: readonly { area: number }[]) => {
      const sum = row.reduce((acc, entry) => acc + entry.area, 0);
      const max = Math.max(...row.map((entry) => entry.area));
      const min = Math.min(...row.map((entry) => entry.area));
      return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
    };
    const first = queue[0];
    if (!first) break;
    const row = [first];
    let next = 1;
    while (next < queue.length) {
      const candidate = queue[next];
      if (!candidate || worst([...row, candidate]) > worst(row)) break;
      row.push(candidate);
      next += 1;
    }
    const sum = row.reduce((acc, entry) => acc + entry.area, 0);
    if (w >= h) {
      const columnWidth = sum / h;
      let cursor = y;
      for (const entry of row) {
        const tileHeight = entry.area / columnWidth;
        out.push({ ...entry.item, x, y: cursor, w: columnWidth, h: tileHeight });
        cursor += tileHeight;
      }
      x += columnWidth;
      w -= columnWidth;
    } else {
      const rowHeight = sum / w;
      let cursor = x;
      for (const entry of row) {
        const tileWidth = entry.area / rowHeight;
        out.push({ ...entry.item, x: cursor, y, w: tileWidth, h: rowHeight });
        cursor += tileWidth;
      }
      y += rowHeight;
      h -= rowHeight;
    }
    queue = queue.slice(next);
  }
  return out;
}
