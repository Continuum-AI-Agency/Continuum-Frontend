import { describe, expect, test } from 'bun:test';
import { smartCollectionQuerySchema } from './collections';
import {
  audioCodecFamily,
  formatLibraryThenBy,
  libraryBrowseQuerySchema,
  libraryBrowseRpcQuery,
  libraryBrowseSortSpecs,
  libraryFormatGroupOf,
  libraryTrashItemSchema,
  parseLibraryThenBy,
  videoCodecFamily,
} from './library-browse';

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

  test('carries project ids, and refuses a non-uuid the RPC would reject as a cast error', () => {
    const projectId = '22222222-2222-4222-8222-222222222222';
    expect(libraryBrowseQuerySchema.parse({ brandId }).projectIds).toEqual([]);
    expect(libraryBrowseQuerySchema.parse({ brandId, projectIds: [projectId] }).projectIds).toEqual(
      [projectId],
    );
    expect(libraryBrowseQuerySchema.safeParse({ brandId, projectIds: ['UGC focus'] }).success).toBe(
      false,
    );
  });

  test('rejects backend provenance as a media type', () => {
    expect(libraryBrowseQuerySchema.safeParse({ brandId, mediaType: 'reel' }).success).toBe(false);
    expect(libraryBrowseQuerySchema.safeParse({ brandId, mediaType: 'hyperframe' }).success).toBe(
      false,
    );
  });

  test('accepts Home destinations and creative aspect-ratio shelves', () => {
    const query = libraryBrowseQuerySchema.parse({
      brandId,
      destination: 'home',
      aspectRatios: ['9:16', '1:1'],
    });
    expect(query.destination).toBe('home');
    expect(query.aspectRatios).toEqual(['9:16', '1:1']);
    expect(libraryBrowseQuerySchema.safeParse({ brandId, destination: 'jobs' }).success).toBe(
      false,
    );
    expect(libraryBrowseQuerySchema.safeParse({ brandId, aspectRatios: ['1.91:1'] }).success).toBe(
      false,
    );
  });
});

describe('layouts and trash', () => {
  test('accepts every layout the Library renders, and nothing else', () => {
    for (const layout of ['grid', 'list', 'board', 'reel']) {
      expect(libraryBrowseQuerySchema.parse({ brandId, layout }).layout).toBe(layout);
    }
    expect(libraryBrowseQuerySchema.safeParse({ brandId, layout: 'table' }).success).toBe(false);
  });

  test('a trash item needs its deletion time beside the asset', () => {
    expect(libraryTrashItemSchema.safeParse({ asset: {} }).success).toBe(false);
  });
});

describe('format groups', () => {
  test('a playable kind is its own group; files go by the registry', () => {
    expect(libraryFormatGroupOf({ kind: 'video', fileName: 'spot' })).toBe('video');
    expect(libraryFormatGroupOf({ kind: 'file', fileName: 'Brief.PDF' })).toBe('document');
    expect(libraryFormatGroupOf({ kind: 'file', fileName: 'deck.pptx' })).toBe('document');
    expect(libraryFormatGroupOf({ kind: 'file', fileName: 'poster.psd' })).toBe('design');
    expect(libraryFormatGroupOf({ kind: 'file', fileName: 'scene.glb' })).toBe('model_3d');
    expect(libraryFormatGroupOf({ kind: 'file', fileName: 'notes.rar' })).toBe('archive');
    expect(libraryFormatGroupOf({ kind: 'file', fileName: 'mystery.xyz' })).toBe('other');
    expect(libraryFormatGroupOf({ kind: 'file', fileName: 'x', mimeType: 'application/pdf' })).toBe(
      'document',
    );
  });

  test('a zip is decided by what ingest found inside it', () => {
    expect(libraryFormatGroupOf({ kind: 'file', fileName: 'site.zip', zip: 'html_bundle' })).toBe(
      'html',
    );
    expect(libraryFormatGroupOf({ kind: 'file', fileName: 'pkg.zip', zip: 'aep_package' })).toBe(
      'design',
    );
    expect(libraryFormatGroupOf({ kind: 'file', fileName: 'backup.zip' })).toBe('archive');
  });
});

describe('codec families', () => {
  test('the probe labels and prober aliases fold to one family', () => {
    expect(videoCodecFamily('H.264')).toBe('h264');
    expect(videoCodecFamily('avc1')).toBe('h264');
    expect(videoCodecFamily('ProRes')).toBe('prores');
    expect(videoCodecFamily('prores_ks')).toBe('prores');
    expect(audioCodecFamily('E-AC-3')).toBe('eac3');
    expect(audioCodecFamily('mp4a.40.2')).toBe('aac');
    expect(audioCodecFamily('pcm-s24')).toBe('pcm');
    expect(audioCodecFamily('Speex')).toBe('speex');
    expect(videoCodecFamily(null)).toBeNull();
  });
});

describe('ranges and technical filters', () => {
  test('accept open-ended ranges and refuse empty or inverted ones', () => {
    const query = libraryBrowseQuerySchema.parse({
      brandId,
      families: ['video'],
      ranges: { resolution: { min: 2160 }, durationMs: { min: 30_001, max: 60_000 } },
      technical: { videoCodecs: ['ProRes'], dynamicRanges: ['hdr10', 'hlg'] },
    });
    expect(query.technical?.videoCodecs).toEqual(['prores']);
    expect(
      libraryBrowseQuerySchema.safeParse({ brandId, ranges: { sizeBytes: {} } }).success,
    ).toBe(false);
    expect(
      libraryBrowseQuerySchema.safeParse({ brandId, ranges: { frameRate: { min: 60, max: 24 } } })
        .success,
    ).toBe(false);
    expect(libraryBrowseQuerySchema.safeParse({ brandId, families: ['pdf'] }).success).toBe(false);
  });

  test('a smart collection cannot save a date bound that is not a timestamp', () => {
    expect(
      smartCollectionQuerySchema.safeParse({ brandId, ranges: { createdAt: { after: 'x' } } })
        .success,
    ).toBe(false);
    expect(
      smartCollectionQuerySchema.safeParse({
        brandId,
        ranges: { createdAt: { after: '2026-09-20T00:00:00.000Z' } },
      }).success,
    ).toBe(true);
  });

  test('the RPC query carries filters only, empties dropped, false kept where it filters', () => {
    const query = libraryBrowseQuerySchema.parse({
      brandId,
      families: ['audio'],
      used: false,
      leadingOnly: false,
      tags: [],
      layout: 'list',
    });
    expect(libraryBrowseRpcQuery(query)).toEqual({
      families: ['audio'],
      used: false,
      performanceWindow: 'd30',
    });
  });
});

describe('sort', () => {
  const fieldId = '44444444-4444-4444-8444-444444444444';

  test('every key sorts both ways, and the named sorts stay valid', () => {
    for (const sort of ['size_asc', 'duration_asc', 'frame_rate_desc', 'most_used', 'manual']) {
      expect(libraryBrowseQuerySchema.safeParse({ brandId, sort }).success).toBe(true);
    }
    expect(libraryBrowseQuerySchema.safeParse({ brandId, sort: 'size' }).success).toBe(false);
  });

  test('sort then thenBy become ordered keys, each key once', () => {
    expect(
      libraryBrowseSortSpecs({
        sort: 'duration_desc',
        sortFieldId: null,
        thenBy: [
          { key: 'duration', dir: 'asc' },
          { key: 'name', dir: 'asc' },
        ],
      }),
    ).toEqual([
      { key: 'duration', dir: 'desc' },
      { key: 'name', dir: 'asc' },
    ]);
    expect(libraryBrowseSortSpecs({ sort: 'field_asc', sortFieldId: fieldId, thenBy: [] })).toEqual(
      [{ key: `field:${fieldId}`, dir: 'asc' }],
    );
    expect(libraryBrowseSortSpecs({ sort: 'field_asc', sortFieldId: null, thenBy: [] })).toEqual([
      { key: 'created', dir: 'desc' },
    ]);
  });

  test('thenBy round-trips through its URL form and drops what it cannot read', () => {
    const specs = [
      { key: 'size', dir: 'asc' },
      { key: `field:${fieldId}`, dir: 'desc' },
    ] as const;
    expect(parseLibraryThenBy(formatLibraryThenBy(specs))).toEqual([...specs]);
    expect(parseLibraryThenBy('size:sideways,bogus:asc,name:asc')).toEqual([
      { key: 'name', dir: 'asc' },
    ]);
  });
});
