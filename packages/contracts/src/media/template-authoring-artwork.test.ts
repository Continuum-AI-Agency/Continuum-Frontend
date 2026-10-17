import { describe, expect, test } from 'bun:test';
import { templateAuthoringArtworkCreateRequestSchema, templateAuthoringArtworkCreateResponseSchema } from './template-authoring-artwork';

const request = {
  schema: 'forge_template_authoring_artwork_create/v1', filename: 'pinned.aep', sourceSha256: 'a'.repeat(64), inlineBase64: 'QUVQ',
  asset: { filename: 'art.png', sha256: 'b'.repeat(64), inlineBase64: 'iVBORw0KGgo=' },
  operation: { type: 'artwork.create', draftNodeId: '11111111-1111-4111-8111-111111111111', compId: 7, name: 'Logo', position: [540, 960], size: [240, 120], inSec: 0, outSec: 3 },
};

describe('native artwork creation writer protocol', () => {
  test('accepts one pinned source, exact safe image asset and strict artwork.create operation', () => {
    expect(templateAuthoringArtworkCreateRequestSchema.safeParse(request).success).toBe(true);
  });

  test('rejects unsafe asset names, unsupported operations, and invalid timing', () => {
    expect(templateAuthoringArtworkCreateRequestSchema.safeParse({ ...request, asset: { ...request.asset, filename: '../art.png' } }).success).toBe(false);
    expect(templateAuthoringArtworkCreateRequestSchema.safeParse({ ...request, operation: { ...request.operation, type: 'shape.create' } }).success).toBe(false);
    expect(templateAuthoringArtworkCreateRequestSchema.safeParse({ ...request, operation: { ...request.operation, outSec: 0 } }).success).toBe(false);
    expect(templateAuthoringArtworkCreateRequestSchema.safeParse({ ...request, extra: true }).success).toBe(false);
  });

  test('requires native UID and footage mapping, hash-pinned path, and honest render boundary', () => {
    const response = {
      filename: 'pinned-artwork.zip', sourceSha256: 'a'.repeat(64), outputSha256: 'c'.repeat(64), inlineBase64: 'emlw',
      mapping: { draftNodeId: request.operation.draftNodeId, persistedUid: 99, compId: 7, index: 0, footageItemId: 100 },
      readback: { name: 'Logo', position: [540, 960], scale: [100, 100, 100], size: [240, 120], inSec: 0, outSec: 3, index: 0,
        sourceUid: 100, footageWidth: 24, footageHeight: 12, format: 'PNG', dependencyPath: 'Footage/authoring/art.png', dependencySha256: 'b'.repeat(64) },
      proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', originalLayerCount: 4, outputLayerCount: 5, newLayerCount: 1,
        sourceGraphPreserved: true, existingSerializedLayerPayloadsPreserved: true, unchangedPackageDependencies: true, suppliedAssetHashVerified: true,
        rustAndPythonReadback: true, nativeAfterEffects: { status: 'unverified', reason: 'Linux save/reopen proof only' } },
    };
    expect(templateAuthoringArtworkCreateResponseSchema.safeParse(response).success).toBe(true);
    expect(templateAuthoringArtworkCreateResponseSchema.safeParse({ ...response, proof: { ...response.proof, suppliedAssetHashVerified: false } }).success).toBe(false);
  });
});
