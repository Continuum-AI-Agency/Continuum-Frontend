import { describe, expect, test } from 'bun:test';
import {
  shortSha,
  templateVersionOf,
  templateVersionTitle,
} from '@/components/forge/templateVersion';

const SHA = 'a1b2c3d4e5'.repeat(6) + 'f1b2';

describe('templateVersionOf', () => {
  test('reads the exact bytes a render used', () => {
    const view = templateVersionOf({
      templateSource: { assetId: 'asset-1', versionId: 'ver-1', sha256: SHA },
    });
    expect(view).toEqual({
      state: 'pinned',
      sha: SHA,
      short: 'a1b2c3d4e5…',
      assetId: 'asset-1',
      versionId: 'ver-1',
    });
  });

  // A render with no recorded source can never be traced back to the bytes it used. That gap is
  // permanent, not pending, so the UI names it rather than showing an empty cell that reads like
  // "nothing to see".
  test('names a render whose source was never recorded', () => {
    expect(templateVersionOf({ templateSource: null })).toEqual({ state: 'unrecorded' });
    expect(templateVersionTitle({ state: 'unrecorded' })).toContain('cannot be established');
  });
});

describe('shortSha', () => {
  test('elides the same way the lineage panel does, so one version reads alike in both', () => {
    expect(shortSha(SHA)).toBe('a1b2c3d4e5…');
  });

  test('answers an em dash for nothing, never "undefined…"', () => {
    expect(shortSha(null)).toBe('—');
    expect(shortSha(undefined)).toBe('—');
  });
});
