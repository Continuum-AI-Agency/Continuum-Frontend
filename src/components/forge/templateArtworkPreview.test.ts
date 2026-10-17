import { describe, expect, test } from 'bun:test';
import { mediaAssetVersionSchema } from '@continuum/contracts';
import { resolvePinnedArtworkVersion } from './templateArtworkPreview';

const assetId = '10000000-0000-4000-8000-000000000001';
const oldVersionId = '10000000-0000-4000-8000-000000000002';
const currentHeadVersionId = '10000000-0000-4000-8000-000000000003';
const sha256 = 'a'.repeat(64);
const version = (id: string, checksum: string, signedUrl: string | null = `https://library.test/${id}`) =>
  mediaAssetVersionSchema.parse({
    id, brandId: '10000000-0000-4000-8000-000000000004', assetId,
    versionNumber: id === oldVersionId ? 1 : 2, bucket: 'media', storagePath: `images/${id}.png`,
    fileName: 'image.png', mimeType: 'image/png', checksum, signedUrl,
    width: 320, height: 180, isHead: id === currentHeadVersionId, createdAt: '2026-10-12T00:00:00.000Z',
  });

describe('resolvePinnedArtworkVersion', () => {
  test('returns the exact requested historical version and never promotes to the current head', () => {
    const versions = [version(currentHeadVersionId, 'b'.repeat(64)), version(oldVersionId, sha256)];
    expect(resolvePinnedArtworkVersion(versions, { assetId, versionId: oldVersionId, sha256 }).id).toBe(oldVersionId);
  });

  test('rejects missing versions, checksum drift, unsupported formats, and missing exact previews', () => {
    const pin = { assetId, versionId: oldVersionId, sha256 };
    expect(() => resolvePinnedArtworkVersion([], pin)).toThrow('version or checksum');
    expect(() => resolvePinnedArtworkVersion([version(oldVersionId, 'b'.repeat(64))], pin)).toThrow('version or checksum');
    expect(() => resolvePinnedArtworkVersion([mediaAssetVersionSchema.parse({
      ...version(oldVersionId, sha256), mimeType: 'image/webp',
    })], pin)).toThrow('PNG and JPEG');
    expect(() => resolvePinnedArtworkVersion([version(oldVersionId, sha256, null)], pin)).toThrow('private preview');
  });
});
