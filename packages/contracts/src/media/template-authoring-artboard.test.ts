import { describe, expect, it } from 'vitest';
import { templateAuthoringArtboardCreateRequestSchema, templateAuthoringArtboardCreateResponseSchema, templateAuthoringArtboardDuplicateRequestSchema, templateAuthoringArtboardDuplicateResponseSchema, templateAuthoringArtboardResizeRequestSchema, templateAuthoringArtboardResizeResponseSchema } from './template-authoring-artboard';

const request = {
  schema: 'forge_template_authoring_artboard_resize/v1', filename: 'source.zip', sourceSha256: 'a'.repeat(64), inlineBase64: 'eA==',
  operation: { type: 'artboard.resize', compId: 48, width: 1200, height: 280 },
};
const response = {
  filename: 'source-artboard.zip', sourceSha256: 'a'.repeat(64), outputSha256: 'b'.repeat(64), inlineBase64: 'eA==',
  mapping: { compId: 48, width: 1200, height: 280 },
  readback: { compId: 48, previous: { width: 1080, height: 150 }, width: 1200, height: 280, frameRate: 29.97, durationSec: 15, layerCount: 4 },
  affectedCompositionRefs: [{ compId: 1, layerUid: 47, sourceCompositionId: 48 }],
  proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', exactTargetDimensionsOnly: true, existingLayerPayloadsPreserved: true,
    otherCompositionFieldsPreserved: true, dependenciesAndEssentialPropertiesPreserved: true, pythonSaveReopen: true,
    nativeAfterEffects: { status: 'unverified', reason: 'Linux writer fixture only' } },
};

describe('template authoring artboard resize contract', () => {
  it('accepts only a pinned source and bounded existing-comp dimension operation', () => {
    expect(templateAuthoringArtboardResizeRequestSchema.parse(request)).toEqual(request);
    expect(templateAuthoringArtboardResizeRequestSchema.safeParse({ ...request, operation: { ...request.operation, width: 3 } }).success).toBe(false);
    expect(templateAuthoringArtboardResizeRequestSchema.safeParse({ ...request, operation: { ...request.operation, scaleLayers: true } }).success).toBe(false);
  });

  it('requires explicit native readback, affected comp references and bounded preservation proof', () => {
    expect(templateAuthoringArtboardResizeResponseSchema.parse(response)).toEqual(response);
    expect(templateAuthoringArtboardResizeResponseSchema.safeParse({ ...response, proof: { ...response.proof, exactTargetDimensionsOnly: false } }).success).toBe(false);
    expect(templateAuthoringArtboardResizeResponseSchema.safeParse({ ...response, affectedCompositionRefs: [{ compId: 1, layerUid: 47, sourceCompositionId: 0 }] }).success).toBe(false);
  });
});

describe('template authoring artboard creation contracts', () => {
  const common = { filename: 'source.zip', sourceSha256: 'a'.repeat(64), inlineBase64: 'eA==' };
  const created = {
    ...common, schema: 'forge_template_authoring_artboard_create/v1',
    operation: { type: 'artboard.create', name: 'New', width: 1080, height: 1920, frameRate: 29.97, durationSec: 15 },
  };
  const duplicated = {
    ...common, schema: 'forge_template_authoring_artboard_duplicate/v1',
    operation: { type: 'artboard.duplicate', sourceCompId: 48, name: 'Copy' },
  };
  const shape = { compId: 99, sourceCompId: null, name: 'New', width: 1080, height: 1920, frameRate: 29.97, durationSec: 15, layerUidMap: [] };
  const proof = {
    rustAuthority: 'aep2json-rust', rustStatus: 'ready', singleNewComposition: true,
    existingCompositionAndLayerPayloadsPreserved: true, existingLayerPayloadsPreserved: true,
    duplicateLayerChunksVerified: false, dependenciesAndEssentialPropertiesPreserved: true,
    allocatedNativeUidCount: 1, completeNativeIdReferenceMapVerified: false, nativeIdsFreshlyAllocated: true,
    unchangedPackageDependencies: true, pythonSaveReopen: true,
    nativeAfterEffects: { status: 'unverified', reason: 'Linux writer fixture only' },
  };
  const createResponse = {
    filename: 'source-artboard.zip', sourceSha256: 'a'.repeat(64), outputSha256: 'b'.repeat(64), inlineBase64: 'eA==',
    operation: 'artboard.create', mapping: shape, readback: { ...shape, layerCount: 0 }, proof,
  };
  const duplicateShape = { ...shape, sourceCompId: 48, name: 'Copy', layerUidMap: [{ sourceLayerUid: 1, layerUid: 100 }] };
  const duplicateResponse = {
    ...createResponse, operation: 'artboard.duplicate', mapping: duplicateShape, readback: { ...duplicateShape, layerCount: 1 },
    proof: { ...proof, duplicateLayerChunksVerified: true, completeNativeIdReferenceMapVerified: true },
  };

  it('pins create and duplicate requests to explicit operations and native source identities', () => {
    expect(templateAuthoringArtboardCreateRequestSchema.parse(created)).toEqual(created);
    expect(templateAuthoringArtboardCreateRequestSchema.safeParse({ ...created, operation: { ...created.operation, durationSec: 0 } }).success).toBe(false);
    expect(templateAuthoringArtboardDuplicateRequestSchema.parse(duplicated)).toEqual(duplicated);
    expect(templateAuthoringArtboardDuplicateRequestSchema.safeParse({ ...duplicated, operation: { ...duplicated.operation, sourceArtboardId: '10000000-0000-4000-8000-000000000001' } }).success).toBe(false);
  });

  it('requires empty-create or complete duplicate native mapping proof', () => {
    expect(templateAuthoringArtboardCreateResponseSchema.parse(createResponse)).toEqual(createResponse);
    expect(templateAuthoringArtboardCreateResponseSchema.safeParse({ ...createResponse, proof: { ...proof, existingLayerPayloadsPreserved: false } }).success).toBe(false);
    expect(templateAuthoringArtboardDuplicateResponseSchema.parse(duplicateResponse)).toEqual(duplicateResponse);
    expect(templateAuthoringArtboardDuplicateResponseSchema.safeParse({ ...duplicateResponse, proof: { ...duplicateResponse.proof, completeNativeIdReferenceMapVerified: false } }).success).toBe(false);
    const emptyDuplicate = { ...duplicateResponse, mapping: { ...shape, sourceCompId: 48, name: 'Empty copy' },
      readback: { ...shape, sourceCompId: 48, name: 'Empty copy', layerCount: 0 } };
    expect(templateAuthoringArtboardDuplicateResponseSchema.parse(emptyDuplicate)).toEqual(emptyDuplicate);
  });
});
