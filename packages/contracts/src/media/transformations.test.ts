import { describe, expect, it } from 'bun:test';
import { registerAssetDerivativeOperationSchema } from './transformations';

const ID = (digit: number) => `${digit}1111111-1111-4111-8111-111111111111`;

describe('registerAssetDerivativeOperationSchema', () => {
  it('binds a transform to an exact source version and defaults to a derivative', () => {
    const parsed = registerAssetDerivativeOperationSchema.parse({
      action: 'register_asset_derivative',
      brandId: ID(1),
      sourceAssetId: ID(2),
      sourceVersionId: ID(3),
      outputAssetId: ID(4),
      operation: 'smart_expand',
      bucket: 'media-source',
      storagePath: `${ID(1)}/reformats/output.png`,
      fileName: 'output.png',
      mimeType: 'image/png',
      sizeBytes: 200,
      width: 1080,
      height: 1920,
      idempotencyKey: ID(5),
    });
    expect(parsed.outputMode).toBe('derivative');
    expect(parsed.sourceVersionId).toBe(ID(3));
  });

  it('rejects a transform without exact-version lineage', () => {
    expect(
      registerAssetDerivativeOperationSchema.safeParse({
        action: 'register_asset_derivative',
        brandId: ID(1),
        sourceAssetId: ID(2),
        outputAssetId: ID(4),
      }).success,
    ).toBe(false);
  });
});
