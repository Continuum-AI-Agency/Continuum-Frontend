import { describe, expect, it } from 'bun:test';
import {
  canvasDeepLink,
  canvasLibraryContextSchema,
  canvasLibraryDrift,
  canvasLibrarySource,
  completeMcpUploadIntentRequestSchema,
  recordCanvasLineageRequestSchema,
  libraryAssetRefSchema,
  libraryImageRefSchema,
  pinnedLibraryAssetRefSchema,
  pinnedLibraryImageRefSchema,
} from './library-reference';

describe('libraryImageRefSchema', () => {
  it('accepts a stable asset reference with an optional pinned version', () => {
    expect(
      libraryImageRefSchema.parse({
        asset_id: '11111111-1111-4111-8111-111111111111',
        version_id: '22222222-2222-4222-8222-222222222222',
      }),
    ).toEqual({
      asset_id: '11111111-1111-4111-8111-111111111111',
      version_id: '22222222-2222-4222-8222-222222222222',
    });

    expect(
      libraryImageRefSchema.parse({
        asset_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({
      asset_id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('rejects non-uuid identities and unknown fields', () => {
    expect(libraryImageRefSchema.safeParse({ asset_id: 'asset-1' }).success).toBe(false);
    expect(
      libraryImageRefSchema.safeParse({
        asset_id: '11111111-1111-4111-8111-111111111111',
        storage_path: 'do-not-cross-this-boundary',
      }).success,
    ).toBe(false);
  });

  it('requires a pinned version before an upload intent can complete', () => {
    expect(
      pinnedLibraryImageRefSchema.safeParse({
        asset_id: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
    expect(
      completeMcpUploadIntentRequestSchema.safeParse({
        action: 'complete_mcp_upload_intent',
        brandId: '11111111-1111-4111-8111-111111111111',
        uploadIntentId: '22222222-2222-4222-8222-222222222222',
        assetRefs: [
          {
            asset_id: '33333333-3333-4333-8333-333333333333',
            version_id: '44444444-4444-4444-8444-444444444444',
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('generic Library asset references', () => {
  it('uses the same database asset/version identity for images and videos', () => {
    const ref = {
      asset_id: '11111111-1111-4111-8111-111111111111',
      version_id: '22222222-2222-4222-8222-222222222222',
    };
    expect(libraryAssetRefSchema.parse(ref)).toEqual(ref);
    expect(pinnedLibraryAssetRefSchema.parse(ref)).toEqual(ref);
  });

  it('requires a version at durable workflow boundaries', () => {
    expect(
      pinnedLibraryAssetRefSchema.safeParse({
        asset_id: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
  });
});

const rendition = (role: string, mimeType: string) => ({
  role,
  bucket: 'media-previews',
  storagePath: `brand/asset/v1/${role}`,
  mimeType,
});
const source = (fileName: string, mimeType: string, kind: 'image' | 'video' | 'audio' | 'file') => ({
  kind,
  fileName,
  mimeType,
  bucket: 'media-library',
  storagePath: `brand/asset/${fileName}`,
});

describe('canvasLibrarySource', () => {
  it('draws a native original as itself', () => {
    expect(canvasLibrarySource({ ...source('a.png', 'image/png', 'image'), renditions: [] })).toEqual({
      nodeType: 'image',
      bucket: 'media-library',
      storagePath: 'brand/asset/a.png',
      mimeType: 'image/png',
      renditionRole: null,
    });
    expect(canvasLibrarySource({ ...source('a.mp3', 'audio/mpeg', 'audio'), renditions: [] })?.nodeType).toBe('audio');
    expect(canvasLibrarySource({ ...source('a.pdf', 'application/pdf', 'file'), renditions: [] })?.nodeType).toBe('document');
    expect(canvasLibrarySource({ ...source('a.txt', 'text/plain', 'file'), renditions: [] })?.nodeType).toBe('document');
  });

  it('draws a PSD as its flattened preview, never its bytes', () => {
    const psd = source('hero.psd', 'image/vnd.adobe.photoshop', 'file');
    expect(canvasLibrarySource({ ...psd, renditions: [] })).toBeNull();
    expect(
      canvasLibrarySource({ ...psd, renditions: [rendition('preview_image', 'image/png')] }),
    ).toMatchObject({ nodeType: 'image', bucket: 'media-previews', renditionRole: 'preview_image' });
  });

  it('plays container video and AIFF through their proxies', () => {
    const mkv = source('cut.mkv', 'video/x-matroska', 'video');
    expect(canvasLibrarySource({ ...mkv, renditions: [] })).toBeNull();
    expect(
      canvasLibrarySource({
        ...mkv,
        renditions: [rendition('proxy_540', 'video/mp4'), rendition('preview_video', 'video/mp4')],
      })?.renditionRole,
    ).toBe('preview_video');
    expect(
      canvasLibrarySource({
        ...source('bed.aiff', 'audio/aiff', 'audio'),
        renditions: [rendition('audio_proxy', 'audio/mp4')],
      }),
    ).toMatchObject({ nodeType: 'audio', renditionRole: 'audio_proxy' });
  });

  it('shows InDesign page 1 and a 3D poster as images', () => {
    expect(
      canvasLibrarySource({
        ...source('book.indd', 'application/x-indesign', 'file'),
        renditions: [rendition('page_1', 'image/jpeg')],
      })?.renditionRole,
    ).toBe('page_1');
    expect(
      canvasLibrarySource({
        ...source('shoe.glb', 'model/gltf-binary', 'file'),
        renditions: [rendition('model_poster', 'image/png')],
      })?.nodeType,
    ).toBe('image');
  });
});

describe('canvasLibraryDrift', () => {
  const asset = { headVersionId: 'v2', reviewStatus: 'approved' as const, deletedAt: null };
  it('flags a newer head and a changed decision, and nothing when in step', () => {
    expect(
      canvasLibraryDrift({ pinnedVersionId: 'v1', acknowledgedReviewStatus: 'in_review', asset }),
    ).toEqual({ newerVersion: true, decisionChanged: true, deleted: false });
    expect(
      canvasLibraryDrift({ pinnedVersionId: 'v2', acknowledgedReviewStatus: 'approved', asset }),
    ).toEqual({ newerVersion: false, decisionChanged: false, deleted: false });
  });
  it('never reports drift it cannot know', () => {
    expect(
      canvasLibraryDrift({ pinnedVersionId: undefined, acknowledgedReviewStatus: null, asset }),
    ).toEqual({ newerVersion: false, decisionChanged: false, deleted: false });
  });
});

describe('canvasLibraryContextSchema', () => {
  it('parses what media.canvas_library_context returns', () => {
    const parsed = canvasLibraryContextSchema.parse({
      assets: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'video',
          fileName: 'cut.mp4',
          mimeType: 'video/mp4',
          reviewStatus: null,
          headVersionId: '22222222-2222-4222-8222-222222222222',
          headVersionNumber: 3,
          commentCount: 4,
          openThreadCount: 2,
          frameRate: 29.97,
          videoCodec: 'avc1',
          updatedAt: '2026-09-28T00:00:00Z',
        },
      ],
      versions: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          assetId: '11111111-1111-4111-8111-111111111111',
          versionNumber: 3,
          bucket: 'media-library',
          storagePath: 'b/a/cut.mp4',
          fileName: 'cut.mp4',
          mimeType: 'video/mp4',
        },
      ],
    });
    expect(parsed.assets[0]?.reviewStatus).toBe('none');
    expect(parsed.versions[0]?.renditions).toEqual([]);
  });
});

describe('recordCanvasLineageRequestSchema', () => {
  it('requires pinned versions and a canvas operation', () => {
    const base = {
      p_brand_id: '11111111-1111-4111-8111-111111111111',
      p_derived_version_id: '22222222-2222-4222-8222-222222222222',
      p_operation: 'canvas_revision',
      p_sources: [
        {
          asset_id: '33333333-3333-4333-8333-333333333333',
          version_id: '44444444-4444-4444-8444-444444444444',
        },
      ],
    };
    expect(recordCanvasLineageRequestSchema.parse(base).p_parameters).toEqual({});
    expect(() =>
      recordCanvasLineageRequestSchema.parse({
        ...base,
        p_sources: [{ asset_id: base.p_sources[0]?.asset_id }],
      }),
    ).toThrow();
    expect(() => recordCanvasLineageRequestSchema.parse({ ...base, p_operation: 'resize' })).toThrow();
  });
});

describe('canvasDeepLink', () => {
  it('opens the room focused on the node', () => {
    expect(canvasDeepLink({ roomId: 'r1', nodeId: 'n 1' })).toBe('/ai-studio?roomId=r1&focusNodeId=n+1');
    expect(canvasDeepLink({ roomId: 'r1' })).toBe('/ai-studio?roomId=r1');
  });
});
