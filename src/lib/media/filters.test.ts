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
