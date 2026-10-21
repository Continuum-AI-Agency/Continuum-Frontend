import { describe, expect, test } from 'bun:test';
import { MOTION_GRAPHIC_RECIPES, motionGraphicParamsSchema } from './motion-timeline';
import { VIDEO_EDITOR_OPS } from './video-editor';
import {
  hasEffectTokens,
  resolveVideoEffects,
  VIDEO_HOUSE_EFFECTS,
  videoHouseEffectSchema,
  workflowSlug,
} from './video-effects';

describe('house video effects', () => {
  test('every effect parses and has a unique slug', () => {
    for (const effect of VIDEO_HOUSE_EFFECTS) videoHouseEffectSchema.parse(effect);
    const slugs = VIDEO_HOUSE_EFFECTS.map((effect) => effect.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test('every op an effect names is a real editor op', () => {
    const ops = new Set(Object.keys(VIDEO_EDITOR_OPS));
    for (const effect of VIDEO_HOUSE_EFFECTS) {
      for (const named of effect.prompt.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) {
        const isRecipe = (MOTION_GRAPHIC_RECIPES as readonly string[]).includes(named);
        const isArgument =
          /^(stat_callout|hook_title|cta_end_card|punch_in|jump_cuts|switch_shots|film_grain|light_leaks)$/.test(
            named,
          );
        if (!isRecipe && !isArgument) expect(ops.has(named), `${effect.slug}: ${named}`).toBe(true);
      }
    }
  });

  test('every graphics recipe has a house effect', () => {
    for (const recipe of MOTION_GRAPHIC_RECIPES)
      expect(VIDEO_HOUSE_EFFECTS.some((effect) => effect.prompt.includes(`recipe ${recipe}`))).toBe(
        true,
      );
  });
});

describe('resolveVideoEffects', () => {
  test('resolves house slugs in typed order and leaves unknown ones', () => {
    const { applied, unknown } = resolveVideoEffects('/word-lock then /nope and /hook-pop', []);
    expect(applied.map((effect) => effect.slug)).toEqual(['word-lock', 'hook-pop']);
    expect(unknown).toEqual(['nope']);
  });

  test('a saved workflow wins over the house effect of the same slug', () => {
    const { applied } = resolveVideoEffects('/hook-pop', [
      { name: 'Hook Pop', prompt: 'our own hook' },
    ]);
    expect(applied).toEqual([{ slug: 'hook-pop', name: 'Hook Pop', prompt: 'our own hook' }]);
  });

  test('ignores URLs, fractions and the brand switches', () => {
    expect(resolveVideoEffects('see https://x.co/word-lock or 50/50 /brand', []).applied).toEqual(
      [],
    );
    expect(hasEffectTokens('cut the pauses')).toBe(false);
    expect(hasEffectTokens('/glass-graph please')).toBe(true);
  });
});

describe('workflowSlug', () => {
  test('kebab-cases names, drops accents and edge dashes', () => {
    expect(workflowSlug('  Mi Corte Rápido! ')).toBe('mi-corte-rapido');
    expect(workflowSlug('Intro / Outro v2')).toBe('intro-outro-v2');
    expect(workflowSlug('!!!')).toBe('');
  });
});

describe('motionGraphicParamsSchema', () => {
  test('holds each recipe to its own fields', () => {
    expect(() =>
      motionGraphicParamsSchema.parse({ recipe: 'word_lock', keyword: 'Claude' }),
    ).toThrow();
    expect(
      motionGraphicParamsSchema.parse({ recipe: 'glass_graph', label: 'Retention', value: 37 }),
    ).toEqual({ recipe: 'glass_graph', label: 'Retention', value: 37, unit: '' });
  });
});
