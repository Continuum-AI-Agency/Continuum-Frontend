import { describe, expect, it } from 'bun:test';
import {
  JAINA_OPTIMIZER_HYPERFRAME_DELTA_SOURCE,
  jainaHyperframeSetSchema,
} from './jaina-hyperframe';

const set = () =>
  jainaHyperframeSetSchema.parse({
    read_id: 'read-abc',
    read_day: '2026-09-21',
    frames: [
      {
        candidate_id: 'dead_tail:acct',
        detector: 'dead_tail',
        composition: 'figure-top',
        bucket: 'hyperframes-compositions',
        path: 'b1/cards/abc.html',
        width: 1080,
        height: 1080,
        duration_seconds: 6,
      },
    ],
  });

describe('a compiled card is a pointer, not a figure', () => {
  it('names its own state.delta source', () => {
    expect(JAINA_OPTIMIZER_HYPERFRAME_DELTA_SOURCE).toBe('optimizer_hyperframe');
  });

  it('refuses a signed url and a fourth frame', () => {
    expect(() =>
      jainaHyperframeSetSchema.parse({ ...set(), signed_url: 'https://example.com' }),
    ).toThrow();
    const four = set();
    four.frames = Array.from({ length: 4 }, () => four.frames[0]);
    expect(() => jainaHyperframeSetSchema.parse(four)).toThrow();
  });

  it('refuses a frame with no path', () => {
    const broken = set();
    broken.frames[0].path = '';
    expect(() => jainaHyperframeSetSchema.parse(broken)).toThrow();
  });
});
