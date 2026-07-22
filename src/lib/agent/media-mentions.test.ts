import { describe, expect, it } from 'bun:test';
import type { MediaAsset, MediaCollection } from '@continuum/contracts';
import type { AgentMentionSuggestion } from '@/lib/agent-references';
import {
  collectionToSuggestion,
  filterSuggestionsByQuery,
  MEDIA_COLLECTION_FOLDER_PREFIX,
  MEDIA_SOURCE_FOLDER_PREFIX,
  MEDIA_SOURCE_FOLDERS,
  mediaAssetToMentionSuggestion,
  parseMediaFolderKey,
  sourceFolderToSuggestion,
} from './media-mentions';

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    brandId: 'brand-1',
    kind: 'image',
    bucket: 'brand-profile-assets',
    storagePath: 'brand-1/creatives/sunset.png',
    fileName: 'sunset.png',
    mimeType: 'image/png',
    source: 'canvas',
    status: 'ready',
    tags: ['sunset', 'warm'],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    title: 'Sunset hero',
    description: 'A warm sunset over the bay',
    signedUrl: 'https://signed.example/sunset.png',
    thumbnailUrl: null,
    ...overrides,
  } as MediaAsset;
}

function makeCollection(overrides: Partial<MediaCollection> = {}): MediaCollection {
  return {
    id: 'col-1',
    brandId: 'brand-1',
    name: 'Spring campaign',
    kind: 'manual',
    smartQuery: null,
    coverAssetId: null,
    itemCount: 0,
    createdBy: 'user-1',
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    ...overrides,
  } as MediaCollection;
}

describe('mediaAssetToMentionSuggestion', () => {
  it('maps an asset to a grabbable media_asset reference', () => {
    const suggestion = mediaAssetToMentionSuggestion(makeAsset());
    expect(suggestion.key).toBe('media:asset-1');
    expect(suggestion.label).toBe('Sunset hero');
    expect(suggestion.type).toBe('media_asset');
    expect(suggestion.reference?.id).toBe('asset-1');
    expect(suggestion.reference?.metadata).toMatchObject({
      assetId: 'asset-1',
      kind: 'image',
      mimeType: 'image/png',
      source: 'canvas',
      bucket: 'brand-profile-assets',
      storagePath: 'brand-1/creatives/sunset.png',
      previewUrl: 'https://signed.example/sunset.png',
      previewKind: 'image',
    });
    expect(suggestion.preview).toEqual({
      url: 'https://signed.example/sunset.png',
      kind: 'image',
      label: 'Sunset hero',
    });
  });

  it('falls back to the storage filename when the asset has no title', () => {
    const suggestion = mediaAssetToMentionSuggestion(makeAsset({ title: null }));
    expect(suggestion.label).toBe('sunset.png');
  });

  it('uses the thumbnail when no signed URL is present', () => {
    const suggestion = mediaAssetToMentionSuggestion(
      makeAsset({ signedUrl: null, thumbnailUrl: 'https://signed.example/thumb.png' }),
    );
    expect(suggestion.preview?.url).toBe('https://signed.example/thumb.png');
  });
});

describe('source + collection folders', () => {
  it('builds a drillable folder per source', () => {
    const folder = sourceFolderToSuggestion(MEDIA_SOURCE_FOLDERS[1]);
    expect(folder.isFolder).toBe(true);
    expect(folder.key).toBe(`${MEDIA_SOURCE_FOLDER_PREFIX}upload`);
    expect(folder.label).toBe('Uploads');
    expect(folder.childrenLabel).toBe('Browse creatives');
  });

  it('surfaces the composited orphan-bucket sources as grabber folders', () => {
    const values = MEDIA_SOURCE_FOLDERS.map((f) => f.value);
    expect(values[0]).toBe('all');
    expect(values).toContain('inspiration');
    expect(values).toContain('hyperframe');
    expect(values).toContain('chat_upload');
    // backfill stays folded into "All media" (no first-class folder).
    expect(values).not.toContain('backfill');
  });

  it('round-trips an inspiration source folder key', () => {
    const folder = MEDIA_SOURCE_FOLDERS.find((f) => f.value === 'inspiration')!;
    const suggestion = sourceFolderToSuggestion(folder);
    expect(parseMediaFolderKey(suggestion.key)).toEqual({ source: 'inspiration' });
  });

  it('labels smart vs manual collections distinctly', () => {
    expect(collectionToSuggestion(makeCollection()).childrenLabel).toBe('Collection');
    expect(collectionToSuggestion(makeCollection({ kind: 'smart' })).childrenLabel).toBe(
      'Smart collection',
    );
    expect(collectionToSuggestion(makeCollection()).key).toBe(
      `${MEDIA_COLLECTION_FOLDER_PREFIX}col-1`,
    );
  });
});

describe('parseMediaFolderKey', () => {
  it('parses a source folder key', () => {
    expect(parseMediaFolderKey(`${MEDIA_SOURCE_FOLDER_PREFIX}canvas`)).toEqual({
      source: 'canvas',
    });
  });

  it('parses a collection folder key', () => {
    expect(parseMediaFolderKey(`${MEDIA_COLLECTION_FOLDER_PREFIX}col-9`)).toEqual({
      collectionId: 'col-9',
    });
  });

  it('returns null for non-media keys', () => {
    expect(parseMediaFolderKey('folder:Skills')).toBeNull();
  });
});

describe('filterSuggestionsByQuery', () => {
  const suggestions: AgentMentionSuggestion[] = [
    mediaAssetToMentionSuggestion(makeAsset({ id: 'a', title: 'Sunset hero' })),
    mediaAssetToMentionSuggestion(
      makeAsset({ id: 'b', title: 'Mountain trail', description: null }),
    ),
  ];

  it('returns everything for an empty query', () => {
    expect(filterSuggestionsByQuery(suggestions, '  ')).toHaveLength(2);
  });

  it('matches against label and description case-insensitively', () => {
    expect(filterSuggestionsByQuery(suggestions, 'sunset').map((s) => s.label)).toEqual([
      'Sunset hero',
    ]);
    expect(filterSuggestionsByQuery(suggestions, 'MOUNTAIN').map((s) => s.label)).toEqual([
      'Mountain trail',
    ]);
  });
});
