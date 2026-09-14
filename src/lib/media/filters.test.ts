import { describe, expect, test } from 'bun:test';
import { libraryBrowseQuerySchema } from '@continuum/contracts';
import {
  buildLibraryBrowseParams,
  kindToMediaType,
  mediaTypeToKind,
  parseTagsParam,
} from './filters';

const brandId = '11111111-1111-4111-8111-111111111111';

describe('Library browse URL', () => {
  test('round-trips canonical facet and display state', () => {
    const query = libraryBrowseQuerySchema.parse({
      brandId,
      mediaType: 'video',
      createdWith: ['reel', 'hyperframe'],
      placements: ['reel'],
      tags: ['spring', 'winning'],
      reviewStatuses: ['in_review'],
      used: true,
      sort: 'best_performing',
      performanceWindow: 'd7',
      layout: 'board',
    });

    expect(buildLibraryBrowseParams(query).toString()).toBe(
      `brandId=${brandId}&mediaType=video&createdWith=reel%2Chyperframe&placements=reel&tags=spring%2Cwinning&reviewStatuses=in_review&used=true&sort=best_performing&performanceWindow=d7&layout=board`,
    );
  });

  test('carries Elements and Sources destinations', () => {
    expect(
      buildLibraryBrowseParams(
        libraryBrowseQuerySchema.parse({ brandId, destination: 'elements' }),
      ).get('destination'),
    ).toBe('elements');
    expect(
      buildLibraryBrowseParams(
        libraryBrowseQuerySchema.parse({
          brandId,
          destination: 'sources',
          mediaType: 'project_file',
        }),
      ).toString(),
    ).toBe(`brandId=${brandId}&mediaType=project_file&destination=sources`);
  });

  test('carries a Story preview frame without colliding with ad placements', () => {
    const query = libraryBrowseQuerySchema.parse({
      brandId,
      destination: 'home',
      previewFrame: 'story',
      placements: ['reel'],
    });
    const params = buildLibraryBrowseParams(query);
    expect(params.get('frame')).toBe('story');
    expect(params.get('placements')).toBe('reel');
  });

  test('carries Home destination and creative aspect-ratio shelves', () => {
    const query = libraryBrowseQuerySchema.parse({
      brandId,
      destination: 'home',
      aspectRatios: ['9:16', '1:1'],
    });
    expect(buildLibraryBrowseParams(query).toString()).toBe(
      `brandId=${brandId}&destination=home&aspectRatios=9%3A16%2C1%3A1`,
    );
  });

  test('keeps legacy kinds mappable without treating Reel as a kind', () => {
    expect(kindToMediaType('file')).toBe('project_file');
    expect(mediaTypeToKind('project_file')).toBe('file');
    expect(mediaTypeToKind('carousel')).toBeNull();
  });

  test('normalizes hand-edited comma lists', () => {
    expect(parseTagsParam(' launch,Launch, ,winning,launch ')).toEqual([
      'launch',
      'Launch',
      'winning',
    ]);
  });
});
