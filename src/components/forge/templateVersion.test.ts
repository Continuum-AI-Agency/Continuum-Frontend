import { describe, expect, test } from 'bun:test';
import {
  revisionLabel,
  shortSha,
  templateVersionOf,
  templateVersionTitle,
} from '@/components/forge/templateVersion';

const SHA = 'a1b2c3d4e5'.repeat(6) + 'f1b2';
// Midday UTC, so the day reads the same in every timezone the suite runs in.
const AT = '2026-09-10T12:00:00.000Z';

describe('templateVersionOf', () => {
  test('reads the source revision a render used, and the day it ran', () => {
    const view = templateVersionOf({
      createdAt: AT,
      templateSource: { assetId: 'asset-1', versionId: 'ver-1', sha256: SHA, versionNumber: 2 },
      templateVariant: { commitSha: 'c'.repeat(64), ref: 'inyogo/9:16/base' },
    });
    expect(view).toEqual({
      state: 'pinned',
      sha: SHA,
      short: 'a1b2c3d4e5…',
      label: 'Rev 2 · Sep 10',
      assetId: 'asset-1',
      versionId: 'ver-1',
      variant: '9:16/base',
    });
    // The full digest stays one hover away, and the variant is named beside it.
    expect(templateVersionTitle(view)).toBe(`Template version ${SHA} — variant 9:16/base`);
  });

  // Older rows, and a server before the field, have the bytes but not the revision number. The
  // digest is shown rather than a number invented from the job row.
  test('falls back to the short digest when the revision number was not read back', () => {
    const view = templateVersionOf({
      createdAt: AT,
      templateSource: { assetId: 'asset-1', versionId: 'ver-1', sha256: SHA, versionNumber: null },
      templateVariant: null,
    });
    expect(view.state === 'pinned' && view.label).toBe('a1b2c3d4e5…');
  });

  // A pin the version tree could not name is UNCHECKED. Reporting it as clean — or inventing a
  // variant from the digest — is the one thing a provenance record must not do.
  test('leaves the variant unchecked rather than clean when no ref was recorded', () => {
    const view = templateVersionOf({
      createdAt: AT,
      templateSource: { assetId: 'asset-1', versionId: 'ver-1', sha256: SHA, versionNumber: 2 },
      templateVariant: null,
    });
    expect(view.state === 'pinned' && view.variant).toBeNull();
    expect(templateVersionTitle(view)).toContain('variant unchecked');
  });

  // An unnamed head is a real commit with no readable name. Showing the commit sha where a
  // variant name goes would read as a variant called "c0ffee…".
  test('shows no variant for a commit that carries no ref', () => {
    const view = templateVersionOf({
      createdAt: AT,
      templateSource: { assetId: 'asset-1', versionId: 'ver-1', sha256: SHA, versionNumber: 2 },
      templateVariant: { commitSha: 'd'.repeat(64), ref: null },
    });
    expect(view.state === 'pinned' && view.variant).toBeNull();
  });

  // A render with no recorded source can never be traced back to the bytes it used. That gap is
  // permanent, not pending, so the UI names it rather than showing an empty cell that reads like
  // "nothing to see".
  test('names a render whose source was never recorded', () => {
    expect(
      templateVersionOf({ createdAt: AT, templateSource: null, templateVariant: null }),
    ).toEqual({ state: 'unrecorded' });
    expect(templateVersionTitle({ state: 'unrecorded' })).toContain('cannot be established');
  });
});

describe('revisionLabel', () => {
  test('reads as a revision and a short day', () => {
    expect(revisionLabel(12, '2026-01-03T12:00:00.000Z')).toBe('Rev 12 · Jan 3');
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
