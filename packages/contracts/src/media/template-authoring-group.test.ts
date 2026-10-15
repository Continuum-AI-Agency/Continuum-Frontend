import { describe, expect, test } from 'bun:test';
import { templateAuthoringGroupCreateRequestSchema, templateAuthoringGroupCreateResponseSchema } from './template-authoring-group';

const request = { schema: 'forge_template_authoring_group_create/v1', filename: 'source.zip', sourceSha256: 'a'.repeat(64), inlineBase64: 'emlw', identityMap: [],
  operation: { type: 'layer.group', draftNodeId: '11111111-1111-4111-8111-111111111111', compId: 1, name: 'Group', memberNodeIds: ['aep:1:16', 'draft:22222222-2222-4222-8222-222222222222'] } };

describe('native layer group writer protocol', () => {
  test('accepts a pinned source and stable native/draft member identities', () => {
    expect(templateAuthoringGroupCreateRequestSchema.safeParse(request).success).toBe(true);
  });

  test('rejects duplicate, foreign-shape, undersized or unrecognized group commands', () => {
    expect(templateAuthoringGroupCreateRequestSchema.safeParse({ ...request, operation: { ...request.operation, memberNodeIds: ['aep:1:16', 'aep:1:16'] } }).success).toBe(false);
    expect(templateAuthoringGroupCreateRequestSchema.safeParse({ ...request, operation: { ...request.operation, memberNodeIds: ['aep:1:16'] } }).success).toBe(false);
    expect(templateAuthoringGroupCreateRequestSchema.safeParse({ ...request, operation: { ...request.operation, type: 'layer.duplicate' } }).success).toBe(false);
  });

  test('accepts nested grouping only with exact prior generated-group and fresh-board receipts', () => {
    const priorGroup = {
      nodeId: 'draft:33333333-3333-4333-8333-333333333333', compId: 525, persistedUid: 541, sourceUid: 540,
      members: [
        { nodeId: 'draft:44444444-4444-4444-8444-444444444444', persistedUid: 537, parentUid: 541 },
        { nodeId: 'draft:55555555-5555-4555-8555-555555555555', persistedUid: 539, parentUid: 541 },
      ],
    };
    const nested = { ...request, identityMap: [priorGroup], operation: { ...request.operation, compId: 525 } };
    expect(templateAuthoringGroupCreateRequestSchema.safeParse(nested).success).toBe(false);
    const freshArtboardReceipt = { compId: 525, sourceCompId: null, name: 'Fresh board', width: 640, height: 360,
      frameRate: 30, durationSec: 4, layerUidMap: [] };
    expect(templateAuthoringGroupCreateRequestSchema.safeParse({ ...nested, freshArtboardReceipt }).success).toBe(true);
    expect(templateAuthoringGroupCreateRequestSchema.safeParse({ ...nested,
      identityMap: [{ ...priorGroup, members: [...priorGroup.members, priorGroup.members[0]] }], freshArtboardReceipt }).success).toBe(false);
    expect(templateAuthoringGroupCreateRequestSchema.safeParse({ ...nested,
      identityMap: [{ ...priorGroup, members: priorGroup.members.map((member, index) => index ? member : { ...member, parentUid: 999 }) }], freshArtboardReceipt }).success).toBe(false);
    expect(templateAuthoringGroupCreateRequestSchema.safeParse({ ...nested,
      freshArtboardReceipt: { ...freshArtboardReceipt, compId: 526 } }).success).toBe(false);
  });

  test('requires exact group UID, member parent links, save/readback proof, and AE boundary', () => {
    const response = { filename: 'group.zip', sourceSha256: 'a'.repeat(64), outputSha256: 'b'.repeat(64), inlineBase64: 'emlw',
      mapping: { draftNodeId: request.operation.draftNodeId, persistedUid: 19, compId: 1, index: 0, sourceUid: 18 },
      members: [{ nodeId: 'aep:1:16', persistedUid: 16, parentUid: 19 }, { nodeId: 'aep:1:15', persistedUid: 15, parentUid: 19 }],
      readback: { name: 'Group', position: [0, 0, 0], scale: [100, 100, 100], rotation: 0, inSec: 0, outSec: 5, index: 0, isNull: true, sourceUid: 18, sourceCompositionId: null,
        members: [16, 15].map((uid) => ({ uid, parentUid: 19, position: [1, 2, 0], scale: [100, 100, 100], rotation: 0, inSec: 0, outSec: 5 })) },
      proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', originalLayerCount: 4, outputLayerCount: 5, newLayerCount: 1,
        sourceGraphPreservedOutsideDeclaredParentLinks: true, existingSerializedLayerPayloadsPreserved: true, memberPayloadsChangedOnlyByParentLink: true, unchangedPackageDependencies: true,
        rustAndPythonReadback: true, nativeAfterEffects: { status: 'unverified', reason: 'Linux proof only' } } };
    expect(templateAuthoringGroupCreateResponseSchema.safeParse(response).success).toBe(true);
    expect(templateAuthoringGroupCreateResponseSchema.safeParse({ ...response, proof: { ...response.proof, memberPayloadsChangedOnlyByParentLink: false } }).success).toBe(false);
  });

});
