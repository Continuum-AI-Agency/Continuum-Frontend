import { describe, expect, it } from 'bun:test';
import { buildAppliedMediaAssetRow } from './mediaAssetRow';

describe('buildAppliedMediaAssetRow', () => {
  it('persists the byte length already known from the uploaded source', () => {
    const row = buildAppliedMediaAssetRow({
      brandProfileId: 'brand-1',
      userId: 'user-1',
      draftId: 'draft-1',
      bucket: 'brand-profile-assets',
      storagePath: 'brand-1/image.png',
      fileName: 'image.png',
      mimeType: 'image/png',
      kind: 'image',
      sizeBytes: 321,
    });

    expect(row.size_bytes).toBe(321);
  });
});
