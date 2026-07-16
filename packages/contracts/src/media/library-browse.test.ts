import { describe, expect, test } from 'bun:test';
import { libraryBrowseQuerySchema } from './library-browse';

const brandId = '11111111-1111-4111-8111-111111111111';

describe('libraryBrowseQuerySchema', () => {
  test('applies stable URL defaults', () => {
    expect(libraryBrowseQuerySchema.parse({ brandId })).toMatchObject({
      mediaType: 'all',
      createdWith: [],
      placements: [],
      tags: [],
      reviewStatuses: [],
      sort: 'created_desc',
      performanceWindow: 'd30',
      layout: 'grid',
      limit: 48,
    });
  });

  test('accepts project files, Air-style facets, and performance ordering', () => {
    const query = libraryBrowseQuerySchema.parse({
      brandId,
      mediaType: 'project_file',
      createdWith: ['upload', 'figma'],
      placements: ['reel', 'ad'],
      tags: ['campaign', 'launch'],
      reviewStatuses: ['in_review'],
      sort: 'best_performing',
      performanceWindow: 'd14',
      layout: 'board',
    });

    expect(query.mediaType).toBe('project_file');
    expect(query.createdWith).toEqual(['upload', 'figma']);
    expect(query.placements).toEqual(['reel', 'ad']);
    expect(query.layout).toBe('board');
  });

  test('rejects backend provenance as a media type', () => {
    expect(libraryBrowseQuerySchema.safeParse({ brandId, mediaType: 'reel' }).success).toBe(false);
    expect(libraryBrowseQuerySchema.safeParse({ brandId, mediaType: 'hyperframe' }).success).toBe(
      false,
    );
  });
});
