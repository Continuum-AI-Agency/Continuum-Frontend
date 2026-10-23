import { describe, expect, test } from 'bun:test';
import { textEffectAt } from './composition';

describe('textEffectAt', () => {
  test('type reveals a character at a time', () => {
    expect(textEffectAt('type', 'SHIP', undefined, 0, 0)).toBe('');
    expect(textEffectAt('type', 'SHIP', undefined, 0.5, 9)).toBe('SH');
    expect(textEffectAt('type', 'SHIP', undefined, 1, 9)).toBe('SHIP');
  });

  test('scramble fixes from the typo, settling left to right, deterministic at a time', () => {
    expect(textEffectAt('scramble', 'SECONDS', 'SEC0MDS', 0, 0)).toBe('SEC0MDS');
    expect(textEffectAt('scramble', 'SECONDS', 'SEC0MDS', 1, 3)).toBe('SECONDS');
    const mid = textEffectAt('scramble', 'SECONDS', 'SEC0MDS', 0.3, 1.27);
    // Letters the typo already has right never flip; the two wrong ones still do.
    expect(mid.slice(0, 3)).toBe('SEC');
    expect(mid.slice(5)).toBe('DS');
    expect(mid).toBe(textEffectAt('scramble', 'SECONDS', 'SEC0MDS', 0.3, 1.27));
  });

  test('scramble with no typo starts from glyphs and keeps spaces', () => {
    const start = textEffectAt('scramble', 'GO NOW', undefined, 0, 0);
    expect(start).toHaveLength(6);
    expect(start[2]).toBe(' ');
    expect(start).not.toBe('GO NOW');
  });
});
