// The pure half of the `/` typeahead: where a slash fragment sits in the text, which
// options the brand's skill list offers, and what the text reads after one is picked.
// The Backend parses `/slug` tokens out of the prompt (contracts `parseShortcutTokens`),
// so picking an option only ever inserts text — nothing rides in the payload.

import {
  isShortcutSkill,
  SHORTCUT_CATEGORIES,
  SHORTCUT_CATEGORY_LABELS,
  type Skill,
  shortcutCategoryOf,
} from '@continuum/contracts';

export type SlashQuery = {
  /** Offset of the `/`. */
  start: number;
  /** End of the fragment being replaced — the caret, plus any slug characters after it. */
  end: number;
  /** What was typed between the `/` and the caret. */
  query: string;
};

export type SlashOption = {
  slug: string;
  label: string;
  group: string;
};

const MAX_QUERY_LENGTH = 40;
// The contract's token grammar: a slug, plus `:piece` for `/brand:colors`. Anything the
// Backend could not parse is never offered.
const FRAGMENT_BEFORE_CARET = /(?:^|\s)\/([a-z0-9:-]*)$/i;
const FRAGMENT_AFTER_CARET = /^[a-z0-9:-]*/i;
const INVOCABLE_SLUG = /^[a-z0-9][a-z0-9-]*$/i;

/** The slash fragment the caret is in, or null. `/` must open the text or follow whitespace. */
export function findSlashQuery(text: string, caret: number): SlashQuery | null {
  const match = FRAGMENT_BEFORE_CARET.exec(text.slice(0, caret));
  if (!match) return null;
  const query = match[1] ?? '';
  if (query.length > MAX_QUERY_LENGTH) return null;
  const tail = FRAGMENT_AFTER_CARET.exec(text.slice(caret))?.[0] ?? '';
  return { start: caret - query.length - 1, end: caret + tail.length, query };
}

export const BRAND_BOOK_GROUP = 'Brand book';
export const BRAND_SKILLS_GROUP = 'Brand skills';

const BRAND_BOOK_OPTIONS: SlashOption[] = [
  { slug: 'brand', label: 'Full brand book for this generation', group: BRAND_BOOK_GROUP },
  { slug: 'brand:colors', label: 'Brand colors only', group: BRAND_BOOK_GROUP },
  { slug: 'brand:logo', label: 'Brand logo only', group: BRAND_BOOK_GROUP },
  { slug: 'nobrand', label: 'No brand guidance for this generation', group: BRAND_BOOK_GROUP },
];

/**
 * Every option, in display order: the brand-book switches, the brand's own visual
 * skills, then the shortcut library by category. Groups are contiguous, which is what
 * lets one flat index drive both the arrow keys and the grouped list.
 */
export function buildSlashOptions(skills: readonly Skill[]): SlashOption[] {
  const usable = skills.filter(
    (skill): skill is Skill & { slug: string } =>
      skill.status === 'active' &&
      skill.surface !== 'copy' &&
      typeof skill.slug === 'string' &&
      INVOCABLE_SLUG.test(skill.slug),
  );
  const brandSkills = usable
    .filter((skill) => !skill.isTemplate && !isShortcutSkill(skill))
    .map((skill) => ({ slug: skill.slug, label: skill.name, group: BRAND_SKILLS_GROUP }));
  const shortcuts = usable.filter(isShortcutSkill);
  const byCategory = SHORTCUT_CATEGORIES.flatMap((category) =>
    shortcuts
      .filter((skill) => shortcutCategoryOf(skill) === category)
      .map((skill) => ({
        slug: skill.slug,
        label: skill.name,
        group: SHORTCUT_CATEGORY_LABELS[category],
      })),
  );

  const seen = new Set<string>();
  return [...BRAND_BOOK_OPTIONS, ...brandSkills, ...byCategory].filter((option) => {
    const key = option.slug.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterSlashOptions(options: readonly SlashOption[], query: string): SlashOption[] {
  const needle = query.toLowerCase();
  if (!needle) return [...options];
  return options.filter(
    (option) =>
      option.slug.toLowerCase().includes(needle) || option.label.toLowerCase().includes(needle),
  );
}

/** The text after picking `slug` for the fragment at `query`, and where the caret lands. */
export function applySlashOption(
  text: string,
  query: SlashQuery,
  slug: string,
): { text: string; caret: number } {
  const insert = `/${slug} `;
  // The inserted space already separates it from what follows; never leave two.
  const after = text.slice(query.end).replace(/^ /, '');
  return {
    text: `${text.slice(0, query.start)}${insert}${after}`,
    caret: query.start + insert.length,
  };
}
