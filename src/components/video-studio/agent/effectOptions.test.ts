import { describe, expect, test } from 'bun:test';
import { VIDEO_HOUSE_EFFECTS } from '@continuum/contracts';
import { effectOptions } from './effectOptions';

describe('effectOptions', () => {
  test('offers every house effect with its description when nothing is saved', () => {
    const options = effectOptions([]);
    expect(options.map((option) => option.slug)).toEqual(VIDEO_HOUSE_EFFECTS.map((e) => e.slug));
    expect(options[0]).toMatchObject({
      group: 'Effects',
      label: VIDEO_HOUSE_EFFECTS[0]?.description,
    });
  });

  test('saved workflows come first and shadow the house effect of the same slug', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const options = effectOptions([
      { id, name: 'Hook Pop', prompt: 'ours' },
      { id, name: 'hook pop', prompt: 'duplicate slug' },
      { id, name: '!!!', prompt: 'no slug' },
    ]);
    expect(options[0]).toEqual({ slug: 'hook-pop', label: 'Hook Pop', group: 'Saved' });
    expect(options.filter((option) => option.slug === 'hook-pop')).toHaveLength(1);
    expect(options).toHaveLength(VIDEO_HOUSE_EFFECTS.length);
  });
});
