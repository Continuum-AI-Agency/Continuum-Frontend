import { describe, expect, it } from 'bun:test';
import {
  latestVersionPatch,
  libraryNodeRef,
  libraryTechnicalFacts,
  pinnedUpstreamSources,
} from './libraryNodeRef';

describe('libraryNodeRef', () => {
  it('reads a reference, an output, and a document entry', () => {
    expect(libraryNodeRef({ assetId: 'a1', assetVersionId: 'v1' })).toEqual({
      assetId: 'a1',
      versionId: 'v1',
      isOutput: false,
      documentIndex: null,
    });
    expect(
      libraryNodeRef({
        renderOutputAssetId: 'o1',
        renderOutputAssetVersionId: 'ov1',
        assetId: 'a1',
      }),
    ).toMatchObject({ assetId: 'o1', versionId: 'ov1', isOutput: true });
    expect(
      libraryNodeRef({
        documents: [{ name: 'x' }, { name: 'brief', assetId: 'd1', assetVersionId: 'dv1' }],
      }),
    ).toEqual({ assetId: 'd1', versionId: 'dv1', isOutput: false, documentIndex: 1 });
    expect(libraryNodeRef({ image: 'data:...' })).toBeNull();
  });
});

describe('pinnedUpstreamSources', () => {
  it('collects every pinned reference upstream, skipping unpinned seeds and other outputs', () => {
    const nodes = [
      { id: 'ref', data: { assetId: 'a1', assetVersionId: 'v1' } },
      { id: 'seed', data: { libraryAssetId: 'a2' } },
      { id: 'gen1', data: { renderOutputAssetId: 'o1', renderOutputAssetVersionId: 'ov1' } },
      { id: 'audio', data: { assetId: 'a3', assetVersionId: 'v3' } },
      { id: 'gen2', data: { renderOutputAssetId: 'o2', renderOutputAssetVersionId: 'ov2' } },
      { id: 'elsewhere', data: { assetId: 'a4', assetVersionId: 'v4' } },
    ];
    const edges = [
      { source: 'ref', target: 'gen1' },
      { source: 'seed', target: 'gen1' },
      { source: 'gen1', target: 'gen2' },
      { source: 'audio', target: 'gen2' },
    ];
    expect(pinnedUpstreamSources(nodes, edges, 'gen2')).toEqual([
      { asset_id: 'a3', version_id: 'v3' },
      { asset_id: 'a1', version_id: 'v1' },
    ]);
    expect(pinnedUpstreamSources(nodes, edges, 'elsewhere')).toEqual([]);
  });
});

describe('libraryTechnicalFacts', () => {
  it('says what the Library knows and nothing it does not', () => {
    expect(
      libraryTechnicalFacts({
        width: 3840,
        height: 2160,
        durationMs: 12_345,
        videoCodec: 'hevc',
        frameRate: 29.97,
        dynamicRange: 'hdr10',
        bitDepth: 10,
        hasAlpha: false,
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 48_000,
      }),
    ).toEqual(['3840×2160', '12.3 s', 'hevc', '29.97 fps', 'HDR10', '10-bit', 'aac stereo 48 kHz']);
    expect(libraryTechnicalFacts({ pageCount: 1 })).toEqual(['1 page']);
    expect(libraryTechnicalFacts({})).toEqual([]);
  });
});

describe('latestVersionPatch', () => {
  const head = {
    id: 'v2',
    assetId: 'a1',
    versionNumber: 2,
    bucket: 'media-library',
    storagePath: 'b/a1/v2.psd',
    fileName: 'hero-v2.psd',
    mimeType: 'image/vnd.adobe.photoshop',
    renditions: [
      {
        role: 'preview_image',
        bucket: 'media-previews',
        storagePath: 'b/a1/v2/preview.png',
        mimeType: 'image/png',
      },
    ],
  };

  it('moves a reference node onto the head, drawing its rendition', () => {
    expect(
      latestVersionPatch({
        data: { assetId: 'a1', assetVersionId: 'v1', image: 'https://old' },
        ref: { assetId: 'a1', versionId: 'v1', isOutput: false, documentIndex: null },
        asset: { kind: 'file', reviewStatus: 'approved' },
        head,
      }),
    ).toEqual({
      libraryAckReviewStatus: 'approved',
      assetVersionId: 'v2',
      bucket: 'media-previews',
      sourcePath: 'b/a1/v2/preview.png',
      fileName: 'hero-v2.psd',
      renditionRole: 'preview_image',
      sourceUrl: undefined,
    });
  });

  it('refuses a head the canvas cannot draw yet', () => {
    expect(
      latestVersionPatch({
        data: {},
        ref: { assetId: 'a1', versionId: 'v1', isOutput: false, documentIndex: null },
        asset: { kind: 'file', reviewStatus: 'none' },
        head: { ...head, renditions: [] },
      }),
    ).toBeNull();
  });

  it('updates the document entry that holds the pointer', () => {
    const patch = latestVersionPatch({
      data: {
        documents: [{ name: 'brief.pdf', type: 'pdf', assetId: 'a1', assetVersionId: 'v1' }],
      },
      ref: { assetId: 'a1', versionId: 'v1', isOutput: false, documentIndex: 0 },
      asset: { kind: 'file', reviewStatus: 'draft' },
      head: {
        ...head,
        fileName: 'brief-v2.pdf',
        mimeType: 'application/pdf',
        storagePath: 'b/a1/brief-v2.pdf',
        renditions: [],
      },
    });
    expect(patch?.documents).toEqual([
      {
        name: 'brief-v2.pdf',
        type: 'pdf',
        assetId: 'a1',
        assetVersionId: 'v2',
        bucket: 'media-library',
        storagePath: 'b/a1/brief-v2.pdf',
        sourceUrl: undefined,
      },
    ]);
  });
});
