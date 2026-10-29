import { describe, expect, it } from 'bun:test';

import { isStaleBuildError } from './version';

describe('isStaleBuildError — a tab running a build that is no longer deployed', () => {
  it('recognises a chunk the new deployment no longer serves', () => {
    const chunk = new Error(
      'Loading chunk 4821 failed.\n(error: https://app.trycontinuum.ai/_next/static/chunks/4821.js)',
    );
    chunk.name = 'ChunkLoadError';
    expect(isStaleBuildError(chunk)).toBe(true);
    expect(
      isStaleBuildError(
        new Error('Failed to fetch dynamically imported module: /_next/static/chunks/a.js'),
      ),
    ).toBe(true);
    expect(isStaleBuildError(new Error('Loading CSS chunk 12 failed.'))).toBe(true);
  });

  it('recognises a Server Action id the new deployment does not know', () => {
    expect(
      isStaleBuildError(
        new Error(
          'Failed to find Server Action "7f3a". This request might be from an older or newer deployment.',
        ),
      ),
    ).toBe(true);
    expect(isStaleBuildError('Server action not found.')).toBe(true);
  });

  it('leaves every other error alone', () => {
    expect(isStaleBuildError(new Error('Could not ask Jaina.'))).toBe(false);
    expect(isStaleBuildError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError({ message: 42 })).toBe(false);
  });
});
