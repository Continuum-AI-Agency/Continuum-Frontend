import { describe, expect, it } from 'bun:test';
import {
  figmaImportedAssetSchema,
  importFigmaFramesRequestSchema,
  registerFigmaImportOperationSchema,
} from './figma';

const BRAND = '11111111-1111-4111-8111-111111111111';

describe('Figma Library contracts', () => {
  it('bounds multi-frame imports', () => {
    expect(importFigmaFramesRequestSchema.parse({ brandId: BRAND, fileKey: 'abc', nodeIds: ['1:2'] }).scale).toBe(2);
    expect(importFigmaFramesRequestSchema.safeParse({ brandId: BRAND, fileKey: 'abc', nodeIds: [] }).success).toBe(false);
  });

  it('requires immutable Figma provenance at registration', () => {
    expect(
      registerFigmaImportOperationSchema.safeParse({
        action: 'register_figma_import',
        brandId: BRAND,
        assetId: '21111111-1111-4111-8111-111111111111',
        bucket: 'media-library',
        storagePath: `${BRAND}/figma/file/node.png`,
        fileName: 'frame.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        width: 100,
        height: 100,
        figmaFileKey: 'file',
        figmaNodeId: '1:2',
        figmaFileName: 'Campaign',
        figmaNodeName: 'Hero',
        sourceUpdatedAt: new Date().toISOString(),
        idempotencyKey: 'figma:file:1:2',
      }).success,
    ).toBe(true);
  });

  it('distinguishes created, refreshed, and unchanged snapshots', () => {
    for (const status of ['created', 'updated', 'exists'] as const) {
      expect(
        figmaImportedAssetSchema.parse({
          assetId: '21111111-1111-4111-8111-111111111111',
          versionId: '31111111-1111-4111-8111-111111111111',
          figmaNodeId: '1:2',
          status,
        }).status,
      ).toBe(status);
    }
  });
});
