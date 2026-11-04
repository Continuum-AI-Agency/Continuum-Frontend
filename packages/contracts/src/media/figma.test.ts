import { describe, expect, it } from 'bun:test';
import {
  FIGMA_IMPORT_MAX_FRAMES,
  figmaImportedAssetSchema,
  importFigmaFramesRequestSchema,
  parseFigmaLink,
  registerFigmaImportOperationSchema,
} from './figma';

const BRAND = '11111111-1111-4111-8111-111111111111';

describe('Figma Library contracts', () => {
  it('bounds multi-frame imports', () => {
    expect(importFigmaFramesRequestSchema.parse({ brandId: BRAND, fileKey: 'abc', nodeIds: ['1:2'] }).scale).toBe(2);
    expect(importFigmaFramesRequestSchema.safeParse({ brandId: BRAND, fileKey: 'abc', nodeIds: [] }).success).toBe(false);
    const tooMany = Array.from({ length: FIGMA_IMPORT_MAX_FRAMES + 1 }, (_, i) => `1:${i}`);
    expect(importFigmaFramesRequestSchema.safeParse({ brandId: BRAND, fileKey: 'abc', nodeIds: tooMany }).success).toBe(false);
  });

  it('reads the file and node out of the links Figma hands out', () => {
    expect(parseFigmaLink('https://www.figma.com/design/AbC123/Launch-kit?node-id=12-34&t=x')).toEqual({ fileKey: 'AbC123', nodeId: '12:34' });
    expect(parseFigmaLink('https://figma.com/file/AbC123/Launch?node-id=12%3A34')).toEqual({ fileKey: 'AbC123', nodeId: '12:34' });
    expect(parseFigmaLink('https://www.figma.com/design/AbC123/branch/Br4nch/Launch')).toEqual({ fileKey: 'Br4nch', nodeId: null });
    expect(parseFigmaLink('https://www.figma.com/proto/AbC123/Flow?node-id=I1-2;3-4')).toEqual({ fileKey: 'AbC123', nodeId: 'I1:2;3:4' });
    expect(parseFigmaLink('https://www.figma.com/board/AbC123/Jam')).toBeNull();
    expect(parseFigmaLink('https://evil-figma.com/design/AbC123/x')).toBeNull();
    expect(parseFigmaLink('not a link')).toBeNull();
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
