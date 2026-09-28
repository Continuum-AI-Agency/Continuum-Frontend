import { describe, expect, it } from 'bun:test';
import { mediaAssetSchema } from './asset';
import {
  DYNAMIC_RANGES,
  MEDIA_ASSET_TECHNICAL_COLUMNS,
  mediaAssetTechnicalFieldsSchema,
  mediaInfoSchema,
  recordMediaInfoResultSchema,
} from './media-info';

// The HDR10 clip the migration test records.
const hdrClip = {
  prober: 'mediabunny@1.21.0',
  container: 'mov',
  videoCodec: 'hevc',
  frameRate: 29.97002997,
  bitRate: 12_000_000,
  videoBitRate: 11_000_000,
  colorSpace: 'bt2020nc',
  colorPrimaries: 'bt2020',
  colorTransfer: 'smpte2084',
  dynamicRange: 'hdr10',
  bitDepth: 10,
  hasAlpha: false,
  startTimecode: '01:00:00:00',
  endTimecode: '01:00:10:00',
  audioCodec: 'aac',
  audioBitRate: 192_000,
  audioChannels: 2,
  audioSampleRate: 48_000,
  width: 3840,
  height: 2160,
  durationMs: 10_000,
  hasLocation: true,
} as const;

describe('mediaInfoSchema', () => {
  it('holds a full video probe', () => {
    expect(mediaInfoSchema.parse(hdrClip)).toEqual(hdrClip);
  });

  it('holds a still, an InDesign page count, and a probe that failed part-way', () => {
    expect(
      mediaInfoSchema.safeParse({
        prober: 'sharp@0.34.2',
        width: 4000,
        height: 3000,
        colorSpace: 'srgb',
        bitDepth: 8,
        hasAlpha: true,
        hasLocation: true,
        extra: { make: 'Canon', model: 'EOS R5' },
      }).success,
    ).toBe(true);
    expect(mediaInfoSchema.safeParse({ prober: 'indd-xmp', pageCount: 12 }).success).toBe(true);
    expect(
      mediaInfoSchema.safeParse({ prober: 'mediabunny', error: 'no video track' }).success,
    ).toBe(true);
  });

  it('refuses what a column cannot hold', () => {
    for (const bad of [
      { dynamicRange: 'hdr' },
      { frameRate: 0 },
      { bitDepth: 0 },
      { audioChannels: 0 },
      { pageCount: 0 },
      { width: 1.5 },
      { rotation: 45 },
      { gps: { lat: 1, lng: 2 } },
    ]) {
      expect(mediaInfoSchema.safeParse({ prober: 'x', ...bad }).success).toBe(false);
    }
    expect(mediaInfoSchema.safeParse({ videoCodec: 'h264' }).success).toBe(false);
  });

  it('names the dynamic ranges the database CHECK allows', () => {
    expect([...DYNAMIC_RANGES]).toEqual([
      'sdr',
      'hdr10',
      'hlg',
      'dolby_vision',
      'hdr10plus',
      'unknown',
    ]);
  });
});

describe('typed head columns', () => {
  it('maps every technical field to its snake_case column', () => {
    expect(Object.keys(MEDIA_ASSET_TECHNICAL_COLUMNS).sort()).toEqual(
      Object.keys(mediaAssetTechnicalFieldsSchema.shape).sort(),
    );
    for (const [field, column] of Object.entries(MEDIA_ASSET_TECHNICAL_COLUMNS)) {
      expect<string>(column).toBe(field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
    }
  });

  it('rides on the asset contract, optional for rows read before the probe', () => {
    const asset = {
      id: 'a1',
      brandId: 'b1',
      kind: 'video',
      bucket: 'media-library',
      storagePath: 'b1/a1/f.mov',
      fileName: 'f.mov',
      mimeType: 'video/quicktime',
      source: 'upload',
      status: 'ready',
      createdAt: '2026-09-27T00:00:00Z',
      updatedAt: '2026-09-27T00:00:00Z',
    };
    expect(mediaAssetSchema.safeParse(asset).success).toBe(true);
    const probed = mediaAssetSchema.parse({
      ...asset,
      videoCodec: 'hevc',
      frameRate: 29.97,
      dynamicRange: 'hdr10',
      hasLocation: true,
      mediaProbedAt: '2026-09-27T00:00:00Z',
      notes: 'Final cut',
    });
    expect(probed.dynamicRange).toBe('hdr10');
    expect(probed.notes).toBe('Final cut');
    expect(mediaAssetSchema.safeParse({ ...asset, dynamicRange: 'hdr' }).success).toBe(false);
  });

  it("parses record_media_info's answer", () => {
    expect(
      recordMediaInfoResultSchema.parse({
        assetId: '11111111-1111-4111-8111-111111111111',
        versionId: '22222222-2222-4222-8222-222222222222',
        isHead: true,
      }).isHead,
    ).toBe(true);
  });
});
