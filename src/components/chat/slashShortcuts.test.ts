import { describe, expect, it } from 'bun:test';
import { parseShortcutTokens, type Skill } from '@continuum/contracts';
import {
  applySlashOption,
  BRAND_BOOK_GROUP,
  BRAND_SKILLS_GROUP,
  buildSlashOptions,
  filterSlashOptions,
  findSlashQuery,
} from './slashShortcuts';

const skill = (slug: string, overrides: Partial<Skill> = {}): Skill => ({
  id: `id-${slug}`,
  brandId: 'brand-1',
  isTemplate: false,
  name: `Name ${slug}`,
  slug,
  description: null,
  kind: 'creative_direction',
  surface: 'visual',
  directives: 'Do it.',
  tags: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});
const shortcut = (slug: string, category: string): Skill =>
  skill(slug, { isTemplate: true, brandId: null, tags: ['shortcut', `shortcut:${category}`] });

describe('findSlashQuery', () => {
  it('opens on a slash at the start of the text', () => {
    expect(findSlashQuery('/', 1)).toEqual({ start: 0, end: 1, query: '' });
    expect(findSlashQuery('/gold', 5)).toEqual({ start: 0, end: 5, query: 'gold' });
  });

  it('opens on a slash after whitespace, including a newline', () => {
    expect(findSlashQuery('a cat /no', 9)).toEqual({ start: 6, end: 9, query: 'no' });
    expect(findSlashQuery('a cat\n/no', 9)).toEqual({ start: 6, end: 9, query: 'no' });
  });

  it('stays shut for a slash inside a word, a fraction or a URL', () => {
    expect(findSlashQuery('50/50', 5)).toBeNull();
    expect(findSlashQuery('and/or', 6)).toBeNull();
    expect(findSlashQuery('see https://x.co/a', 18)).toBeNull();
  });

  it('closes once the fragment holds a space or the caret leaves it', () => {
    expect(findSlashQuery('/gold hour', 10)).toBeNull();
    expect(findSlashQuery('/gold then', 0)).toBeNull();
  });

  it('keeps the brand piece colon in the query', () => {
    expect(findSlashQuery('/brand:co', 9)).toEqual({ start: 0, end: 9, query: 'brand:co' });
  });

  it('extends the replaced span over slug characters after the caret', () => {
    // Caret between "gol" and "den": picking must swallow "den", not leave it dangling.
    expect(findSlashQuery('x /golden y', 6)).toEqual({ start: 2, end: 9, query: 'gol' });
  });

  it('gives up on a fragment too long to be a slug', () => {
    const long = `/${'a'.repeat(41)}`;
    expect(findSlashQuery(long, long.length)).toBeNull();
  });
});

describe('buildSlashOptions', () => {
  it('orders brand book, brand skills, then shortcuts by category', () => {
    const options = buildSlashOptions([
      shortcut('noir', 'genre'),
      skill('bold-light'),
      shortcut('goldenhour', 'light'),
    ]);

    expect(options.map((option) => option.slug)).toEqual([
      'brand',
      'brand:colors',
      'brand:logo',
      'nobrand',
      'bold-light',
      'goldenhour',
      'noir',
    ]);
    expect(options.map((option) => option.group)).toEqual([
      BRAND_BOOK_GROUP,
      BRAND_BOOK_GROUP,
      BRAND_BOOK_GROUP,
      BRAND_BOOK_GROUP,
      BRAND_SKILLS_GROUP,
      'Light',
      'Genre & world',
    ]);
  });

  it('leaves out copy, archived, slugless, unparseable and non-shortcut library skills', () => {
    const options = buildSlashOptions([
      skill('copy-only', { surface: 'copy' }),
      skill('old', { status: 'archived' }),
      skill('none', { slug: null }),
      skill('under_score'),
      skill('library-template', { isTemplate: true, brandId: null }),
    ]);

    expect(options.every((option) => option.group === BRAND_BOOK_GROUP)).toBe(true);
  });

  it('offers a slug once even when a brand skill shares it with a shortcut', () => {
    const options = buildSlashOptions([skill('noir'), shortcut('noir', 'genre')]);
    expect(options.filter((option) => option.slug === 'noir')).toHaveLength(1);
    expect(options.find((option) => option.slug === 'noir')?.group).toBe(BRAND_SKILLS_GROUP);
  });
});

describe('filterSlashOptions', () => {
  const options = buildSlashOptions([
    shortcut('goldenhour', 'light'),
    shortcut('noir', 'genre'),
    skill('bold-light', { name: 'Golden retail light' }),
  ]);

  it('returns everything for an empty query', () => {
    expect(filterSlashOptions(options, '')).toHaveLength(options.length);
  });

  it('matches the slug or the name, case-insensitively, keeping group order', () => {
    expect(filterSlashOptions(options, 'GOLD').map((option) => option.slug)).toEqual([
      'bold-light',
      'goldenhour',
    ]);
  });

  it('narrows the brand pieces by their colon form', () => {
    expect(filterSlashOptions(options, 'brand:').map((option) => option.slug)).toEqual([
      'brand:colors',
      'brand:logo',
    ]);
  });
});

describe('applySlashOption', () => {
  it('replaces the fragment with the token and a trailing space', () => {
    const text = 'a cat /gol';
    const query = findSlashQuery(text, text.length);
    expect(query).not.toBeNull();
    expect(applySlashOption(text, query!, 'goldenhour')).toEqual({
      text: 'a cat /goldenhour ',
      caret: 18,
    });
  });

  it('swallows the rest of the word and never doubles the space', () => {
    const query = findSlashQuery('x /golden y', 6);
    expect(applySlashOption('x /golden y', query!, 'goldenhour')).toEqual({
      text: 'x /goldenhour y',
      caret: 14,
    });
  });

  it('writes a token the Backend parser reads back', () => {
    const query = findSlashQuery('hero shot /brand:c', 18);
    const { text } = applySlashOption('hero shot /brand:c', query!, 'brand:colors');
    expect(parseShortcutTokens(text).brandPieces).toEqual(['colors']);

    const second = findSlashQuery(`${text}/gold`, text.length + 5);
    const done = applySlashOption(`${text}/gold`, second!, 'goldenhour');
    expect(parseShortcutTokens(done.text)).toEqual({
      slugs: ['goldenhour'],
      brandPieces: ['colors'],
    });
  });
});
