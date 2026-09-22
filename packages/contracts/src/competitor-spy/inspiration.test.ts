import { describe, expect, test } from 'bun:test';
import { competitorPostVideoDescriptionSchema } from './analysis';
import {
  COMPETITOR_POST_FORMAT_LABELS,
  competitorPostFormat,
  competitorPostFormatSchema,
} from './inspiration';

describe('competitorPostFormat', () => {
  test('every describer video format is a post format with a label', () => {
    for (const format of competitorPostVideoDescriptionSchema.shape.format.options) {
      expect(competitorPostFormatSchema.options).toContain(format);
      expect(COMPETITOR_POST_FORMAT_LABELS[format]).toBeTruthy();
    }
  });

  test('an analysed video takes the describer format; everything else falls back on kind', () => {
    const video = competitorPostVideoDescriptionSchema.parse({
      transcript: '',
      scene_beats: [],
      hook_first_3s: 'x',
      audio_kind: 'silent',
      format: 'split_screen',
      visual_hook: 'x',
    });
    expect(competitorPostFormat('reel', { video })).toBe('split_screen');
    expect(competitorPostFormat('reel', null)).toBe('reel');
    expect(competitorPostFormat('carousel', {})).toBe('photo_carousel');
    expect(competitorPostFormat('post', null)).toBe('photo');
  });
});
