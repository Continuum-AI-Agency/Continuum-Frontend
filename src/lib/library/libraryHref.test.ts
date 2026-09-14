import { describe, expect, test } from 'bun:test';
import { libraryBrowseQuerySchema } from '@continuum/contracts';
import { librarySearchPath } from './libraryHref';

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
