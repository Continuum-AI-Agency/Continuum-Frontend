import { describe, expect, test } from 'bun:test';
import { libraryBrowseQuerySchema } from '@continuum/contracts';
import { librarySearchPath, withReviewStates } from './libraryHref';

const brandId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
const commentId = '33333333-3333-4333-8333-333333333333';

describe('librarySearchPath', () => {
  test('keeps Home + Story frame and overlays a comment', () => {
    const query = libraryBrowseQuerySchema.parse({
      brandId,
      destination: 'home',
      previewFrame: 'story',
    });
    const path = librarySearchPath(query, {
      assetId,
      deepLink: { commentId, timeMs: 1500, endMs: 4000 },
    });
    expect(path).toContain('destination=home');
    expect(path).toContain('frame=story');
    expect(path).toContain(`assetId=${assetId}`);
    expect(path).toContain(`comment=${commentId}`);
    expect(path).toContain('t=1500');
    expect(path).toContain('end=4000');
    expect(path.startsWith('/library?')).toBe(true);
  });

  test('drops overlay when the detail closes', () => {
    const query = libraryBrowseQuerySchema.parse({ brandId, destination: 'home' });
    expect(librarySearchPath(query)).toBe('/library?destination=home');
  });
});

describe('withReviewStates — the custom-state and base-status filters never drop each other', () => {
  const LEGAL = '44444444-4444-4444-8444-444444444444';
  const RUN = 'bench-review-run';
  // Picking "Approved" pushes this; picking "Legal" lands while that push is still pending.
  const approvedPush = librarySearchPath(
    libraryBrowseQuerySchema.parse({
      brandId,
      tags: [RUN],
      reviewStatuses: ['approved'],
      layout: 'grid',
    }),
  );

  test('a custom state set on the pending push keeps the base status and every other filter', () => {
    const params = new URL(withReviewStates(approvedPush, [LEGAL]), 'http://x').searchParams;
    expect(params.get('reviewStatuses')).toBe('approved');
    expect(params.get('tags')).toBe(RUN);
    expect(params.get('reviewStates')).toBe(LEGAL);
  });

  test('a base status pushed after a custom state keeps the custom state', () => {
    // pushFilters builds its path from the new query, then re-applies the chosen states.
    const nextPush = librarySearchPath(
      libraryBrowseQuerySchema.parse({ brandId, tags: [RUN], reviewStatuses: ['needs_changes'] }),
    );
    const params = new URL(withReviewStates(nextPush, [LEGAL]), 'http://x').searchParams;
    expect(params.get('reviewStates')).toBe(LEGAL);
    expect(params.get('reviewStatuses')).toBe('needs_changes');
    expect(params.get('tags')).toBe(RUN);
  });

  test('clearing the custom states removes only them', () => {
    const cleared = withReviewStates(withReviewStates(approvedPush, [LEGAL]), []);
    expect(cleared).toBe(approvedPush);
    expect(withReviewStates('/library?reviewStates=' + LEGAL, [])).toBe('/library');
  });
});
