import { libraryBrowseQuerySchema } from '@continuum/contracts';
import { describe, expect, test } from 'bun:test';
import { libraryBrowseRpcArgs } from './browse-args';

const brandId = '11111111-1111-4111-8111-111111111111';

describe('libraryBrowseRpcArgs destinations', () => {
  test('Home sends p_destination and aspect-ratio bins by name', () => {
    const args = libraryBrowseRpcArgs(
      libraryBrowseQuerySchema.parse({
        brandId,
        destination: 'home',
        aspectRatios: ['9:16', '1:1'],
      }),
    );
    expect(args.p_destination).toBe('home');
    expect(args.p_aspect_ratios).toEqual(['9:16', '1:1']);
    expect(args.p_media_type).toBe('all');
  });

  test('omits destination and aspect when the caller is on the legacy dump', () => {
    const args = libraryBrowseRpcArgs(libraryBrowseQuerySchema.parse({ brandId }));
    expect(args.p_destination).toBeNull();
    expect(args.p_aspect_ratios).toBeNull();
  });
});
