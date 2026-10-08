import { describe, expect, test } from 'bun:test';
import {
  dropConflictingShortcuts,
  parseShortcutTokens,
  renderShortcutCatalog,
  shortcutCategoryTag,
  shortcutConflictTag,
  stripShortcutTokens,
} from './shortcuts';

describe('parseShortcutTokens', () => {
  test('reads slugs in prompt order, deduped and lowercased, including the /4k: list form', () => {
    expect(
      parseShortcutTokens('/GoldenHour woman running /35mmfilm, /4k: /goldenhour').slugs,
    ).toEqual(['goldenhour', '35mmfilm', '4k']);
  });

  test('ignores URLs, paths and fractions', () => {
    expect(
      parseShortcutTokens('see https://x.com/cinematic and ~/Users/me 50/50 a/b').slugs,
    ).toEqual([]);
  });

  test('brand tokens set pieces and never land in slugs', () => {
    expect(parseShortcutTokens('shoe /brand').brandPieces).toEqual(['full']);
    expect(parseShortcutTokens('/brand:colors /brand:logo shoe').brandPieces).toEqual([
      'colors',
      'logo',
    ]);
    expect(parseShortcutTokens('shoe /nobrand /noir')).toEqual({
      slugs: ['noir'],
      brandPieces: [],
    });
    expect(parseShortcutTokens('shoe').brandPieces).toBeNull();
  });
});

describe('stripShortcutTokens', () => {
  test('removes resolved and brand tokens, keeps unknown ones as text', () => {
    expect(
      stripShortcutTokens('/goldenhour a runner /brand on a pier /unknown', ['goldenhour']),
    ).toBe('a runner on a pier /unknown');
  });
});

describe('dropConflictingShortcuts', () => {
  test('the later of two conflicting shortcuts wins', () => {
    const fourK = { slug: '4k', tags: ['shortcut', shortcutConflictTag('8k')] };
    const eightK = { slug: '8k', tags: ['shortcut'] };
    const noir = { slug: 'noir', tags: ['shortcut'] };
    expect(dropConflictingShortcuts([fourK, noir, eightK]).map((s) => s.slug)).toEqual([
      'noir',
      '8k',
    ]);
    expect(dropConflictingShortcuts([eightK, fourK]).map((s) => s.slug)).toEqual(['4k']);
  });
});

describe('renderShortcutCatalog', () => {
  test('one line per category, shortcut-tagged skills only', () => {
    const catalog = renderShortcutCatalog([
      { slug: 'goldenhour', tags: ['shortcut', shortcutCategoryTag('light')] },
      { slug: 'droneview', tags: ['shortcut', shortcutCategoryTag('camera')] },
      { slug: 'bluehour', tags: ['shortcut', shortcutCategoryTag('light')] },
      { slug: 'hooks', tags: ['copy'] },
    ]);
    expect(catalog).toBe('- Camera & framing: /droneview\n- Light: /goldenhour /bluehour');
  });
});
