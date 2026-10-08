// `/slug` shortcuts: a skill invoked by typing its slug after a slash, the way the
// viral prompt lists do (`/goldenhour`, `/35mmfilm`). A shortcut is not a new kind of
// thing — it is a first-party template skill tagged `shortcut`, so it resolves through
// the same `skills.skills` table, the same `getSkillsBySlugs` read and the same
// creative-direction injection as any picked skill. Any brand skill is invocable the
// same way by its own slug.
//
// `/brand`, `/brand:<piece>` and `/nobrand` are not skills: they set the brand-book
// pieces for that one generation, so the brand control speaks the same `/` language.

import type { BrandBookPieceKind } from '../ai-studio/brand-enforcement';
import { brandBookPieceKindSchema } from '../ai-studio/brand-enforcement';

export const SHORTCUT_TAG = 'shortcut';

export const SHORTCUT_CATEGORIES = [
  'camera',
  'light',
  'capture',
  'weather',
  'era',
  'environment',
  'genre',
  'medium',
  'material',
  'edit',
] as const;
export type ShortcutCategory = (typeof SHORTCUT_CATEGORIES)[number];

export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  camera: 'Camera & framing',
  light: 'Light',
  capture: 'Capture & film',
  weather: 'Weather & atmosphere',
  era: 'Era & aesthetic',
  environment: 'Environment',
  genre: 'Genre & world',
  medium: 'Art medium',
  material: 'Material & FX',
  edit: 'Restyle',
};

const CATEGORY_TAG_PREFIX = 'shortcut:';
const CONFLICT_TAG_PREFIX = 'conflicts:';

export const shortcutCategoryTag = (category: ShortcutCategory): string =>
  `${CATEGORY_TAG_PREFIX}${category}`;
export const shortcutConflictTag = (slug: string): string => `${CONFLICT_TAG_PREFIX}${slug}`;

interface Tagged {
  readonly tags?: readonly string[] | null;
}

export const isShortcutSkill = (skill: Tagged): boolean =>
  skill.tags?.includes(SHORTCUT_TAG) ?? false;

export function shortcutCategoryOf(skill: Tagged): ShortcutCategory | null {
  const tag = skill.tags?.find((value) => value.startsWith(CATEGORY_TAG_PREFIX));
  const category = tag?.slice(CATEGORY_TAG_PREFIX.length);
  return (SHORTCUT_CATEGORIES as readonly string[]).includes(category ?? '')
    ? (category as ShortcutCategory)
    : null;
}

export const shortcutConflictsOf = (skill: Tagged): string[] =>
  (skill.tags ?? [])
    .filter((value) => value.startsWith(CONFLICT_TAG_PREFIX))
    .map((value) => value.slice(CONFLICT_TAG_PREFIX.length));

// A token is `/` + slug at the start of the text or after whitespace, with an optional
// `:piece` (only meaningful for `/brand`) and an optional trailing `:` (the lists print
// `/4k:`). Requiring whitespace before the slash keeps URLs, paths and "50/50" out.
const TOKEN = /(^|\s)\/([a-z0-9][a-z0-9-]*)(?::([a-z]+))?:?(?=$|[\s.,;!?)])/gi;

const BRAND_ON = 'brand';
const BRAND_OFF = 'nobrand';

export interface ShortcutTokens {
  /** Skill slugs in prompt order, lowercased and deduped. Unknown ones are the resolver's call. */
  slugs: string[];
  /**
   * Brand-book pieces the prompt asked for: `null` when it said nothing, `[]` for
   * `/nobrand`, `['full']` for `/brand`, the named pieces for `/brand:<piece>`.
   */
  brandPieces: BrandBookPieceKind[] | null;
}

export function parseShortcutTokens(text: string): ShortcutTokens {
  const slugs: string[] = [];
  let brandPieces: BrandBookPieceKind[] | null = null;
  for (const match of text.matchAll(TOKEN)) {
    const slug = (match[2] ?? '').toLowerCase();
    const piece = match[3]?.toLowerCase();
    if (slug === BRAND_OFF) {
      brandPieces = [];
    } else if (slug === BRAND_ON) {
      const parsed = brandBookPieceKindSchema.safeParse(piece ?? 'full');
      if (parsed.success) brandPieces = [...new Set([...(brandPieces ?? []), parsed.data])];
    } else if (!piece && !slugs.includes(slug)) {
      slugs.push(slug);
    }
  }
  return { slugs, brandPieces };
}

/**
 * Removes the tokens that were acted on — every brand token, and the skill slugs in
 * `resolved` — so the model never reads "/goldenhour" as words to render. A slug that
 * resolved to nothing stays, because then it was probably just text.
 */
export function stripShortcutTokens(text: string, resolved: Iterable<string>): string {
  const known = new Set([...resolved].map((slug) => slug.toLowerCase()));
  return text
    .replace(TOKEN, (whole, lead: string, slug: string, piece: string | undefined) => {
      const lower = slug.toLowerCase();
      const acted =
        lower === BRAND_OFF || lower === BRAND_ON || (piece === undefined && known.has(lower));
      return acted ? lead : whole;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * When two applied shortcuts declare a conflict (`/4k` and `/8k`), the one written
 * LATER in the prompt wins — the user's last word. Input order is prompt order.
 */
export function dropConflictingShortcuts<T extends Tagged & { readonly slug?: string | null }>(
  skills: readonly T[],
): T[] {
  const kept: T[] = [];
  for (const skill of [...skills].reverse()) {
    const conflicts = new Set(shortcutConflictsOf(skill));
    const clash = kept.some(
      (later) =>
        (later.slug && conflicts.has(later.slug)) ||
        (skill.slug && shortcutConflictsOf(later).includes(skill.slug)),
    );
    if (!clash) kept.push(skill);
  }
  return kept.reverse();
}

interface CatalogEntry extends Tagged {
  readonly slug?: string | null;
}

/**
 * The whole shortcut catalog as one compact line per category — slugs only, never the
 * fragments — so an agent knows every name for a few hundred tokens instead of carrying
 * 109 descriptions in its skill index.
 */
export function renderShortcutCatalog(skills: readonly CatalogEntry[]): string {
  const byCategory = new Map<ShortcutCategory, string[]>();
  for (const skill of skills) {
    const category = shortcutCategoryOf(skill);
    if (!skill.slug || !category || !isShortcutSkill(skill)) continue;
    byCategory.set(category, [...(byCategory.get(category) ?? []), `/${skill.slug}`]);
  }
  return SHORTCUT_CATEGORIES.filter((category) => byCategory.has(category))
    .map(
      (category) =>
        `- ${SHORTCUT_CATEGORY_LABELS[category]}: ${byCategory.get(category)?.join(' ')}`,
    )
    .join('\n');
}
