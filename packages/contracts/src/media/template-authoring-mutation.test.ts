import { describe, expect, test } from 'bun:test';
import {
  templateAuthoringLayerMutationRequestSchema,
  templateAuthoringLayerMutationResponseSchema,
} from './template-authoring-mutation';

const sourceSha256 = 'a'.repeat(64);
const packageBase = {
  schema: 'forge_template_authoring_layer_mutation/v1' as const,
  filename: 'source.zip',
  sourceSha256,
  inlineBase64: 'UEs=',
  identityMap: [{ nodeId: 'draft:11111111-1111-4111-8111-111111111111', compId: 1, persistedUid: 17 }],
};

describe('native layer mutation writer contract', () => {
  test('accepts draft-sourced duplication and mapped deletion with distinct native identities', () => {
    expect(templateAuthoringLayerMutationRequestSchema.safeParse({
      ...packageBase,
      operation: {
        type: 'layer.duplicate', nodeId: 'draft:22222222-2222-4222-8222-222222222222',
        sourceNodeId: 'draft:11111111-1111-4111-8111-111111111111', name: 'Copy',
      },
    }).success).toBe(true);
    expect(templateAuthoringLayerMutationRequestSchema.safeParse({
      ...packageBase,
      operation: { type: 'layer.delete', nodeId: 'draft:11111111-1111-4111-8111-111111111111' },
    }).success).toBe(true);
  });

  test('requires trusted group source UID for translation-only ungroup receipts', () => {
    const group = 'draft:11111111-1111-4111-8111-111111111111';
    const request = {
      ...packageBase,
      identityMap: [{ nodeId: group, compId: 32, persistedUid: 526, sourceUid: 525 }],
      operation: { type: 'layer.ungroup', nodeId: group },
    };
    expect(templateAuthoringLayerMutationRequestSchema.safeParse(request).success).toBe(true);
    expect(templateAuthoringLayerMutationRequestSchema.safeParse({
      ...request,
      identityMap: [{ nodeId: group, compId: 32, persistedUid: 526 }],
    }).success).toBe(false);
    const nestedReceipt = {
      ...request,
      freshArtboardReceipt: { compId: 32, sourceCompId: null, name: 'Fresh', width: 640, height: 360,
        frameRate: 30, durationSec: 4, layerUidMap: [] },
      identityMap: [
        { nodeId: group, compId: 32, persistedUid: 526, sourceUid: 525,
          members: [
            { nodeId: 'draft:22222222-2222-4222-8222-222222222222', persistedUid: 527, parentUid: 526 },
            { nodeId: 'draft:33333333-3333-4333-8333-333333333333', persistedUid: 528, parentUid: 526 },
          ] },
        { nodeId: 'draft:22222222-2222-4222-8222-222222222222', compId: 32, persistedUid: 527, sourceUid: 529,
          members: [
            { nodeId: 'draft:44444444-4444-4444-8444-444444444444', persistedUid: 530, parentUid: 527 },
            { nodeId: 'draft:55555555-5555-4555-8555-555555555555', persistedUid: 531, parentUid: 527 },
          ] },
      ],
    };
    expect(templateAuthoringLayerMutationRequestSchema.safeParse(nestedReceipt).success).toBe(true);
    expect(templateAuthoringLayerMutationRequestSchema.safeParse({
      ...nestedReceipt,
      freshArtboardReceipt: { ...nestedReceipt.freshArtboardReceipt, compId: 33 },
    }).success).toBe(false);
    expect(templateAuthoringLayerMutationRequestSchema.safeParse({
      ...nestedReceipt,
      identityMap: [{ ...nestedReceipt.identityMap[0]!, members: [{ ...nestedReceipt.identityMap[0]!.members[0]!, parentUid: 999 }, nestedReceipt.identityMap[0]!.members[1]!] }],
    }).success).toBe(false);
    const response = {
      filename: 'source-layer-ungroup.zip', sourceSha256, outputSha256: 'b'.repeat(64), inlineBase64: 'UEs=',
      ungrouped: { nodeId: group, persistedUid: 526, compId: 32, removedIndex: 0, sourceUid: 525 },
      ungroupedMembers: [{ nodeId: 'aep:32:46', persistedUid: 46, compId: 32, parentUid: null }],
      readback: {
        operation: 'layer.ungroup', originalLayerCount: 58, outputLayerCount: 57, unchangedLayerPayloadCount: 57,
        groupRemoved: true, removedSourceUid: 525, ungroupedChildCount: 1,
        memberPayloadsChangedOnlyByParentAndStaticTransform: true,
        memberPayloadsChangedOnlyByParentAndStaticPosition: true, groupWasNull: true,
        groupWasGuideLayer: false, groupOpacityDefault: 0, groupSourceKind: 'SolidSource',
        children: [{ uid: 46, parentUid: null, position: [615, 511.25, 0], compId: 32, changedPositionLeafPaths: ['root[2]/LIST[5]/LIST[3]/LIST[3]'] }],
        changedItemPayloadIds: [0, 525], allowedAggregateItemIds: [0, 525],
      },
      proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', sourceGraphPreservedOutsideOperation: true,
        unchangedPackageDependencies: true, pythonSaveReopen: true,
        nativeAfterEffects: { status: 'unverified', reason: 'Native After Effects was not run.' } },
    };
    expect(templateAuthoringLayerMutationResponseSchema.safeParse(response).success).toBe(true);
    const { memberPayloadsChangedOnlyByParentAndStaticPosition: _positionOnly, ...transformReadback } = response.readback;
    expect(templateAuthoringLayerMutationResponseSchema.safeParse({
      ...response,
      readback: { ...transformReadback, memberPayloadsChangedOnlyByParentAndStaticTransform: true },
    }).success).toBe(true);
    const { memberPayloadsChangedOnlyByParentAndStaticTransform: _staticTransform, ...withoutTransformProof } = transformReadback;
    expect(templateAuthoringLayerMutationResponseSchema.safeParse({
      ...response,
      readback: withoutTransformProof,
    }).success).toBe(false);
    expect(templateAuthoringLayerMutationResponseSchema.safeParse({
      ...response,
      ungrouped: { ...response.ungrouped, sourceUid: 999 },
    }).success).toBe(true); // The application compares this value with the trusted compiler mapping.
    expect(templateAuthoringLayerMutationResponseSchema.safeParse({ ...response, proof: undefined }).success).toBe(false);
  });

  test('rejects identity fabrication, unsafe native IDs, and untyped operations', () => {
    expect(templateAuthoringLayerMutationRequestSchema.safeParse({
      ...packageBase,
      identityMap: [{ nodeId: 'draft:11111111-1111-4111-8111-111111111111', compId: 1, persistedUid: -1 }],
      operation: { type: 'layer.delete', nodeId: 'aep:1:17' },
    }).success).toBe(false);
    expect(templateAuthoringLayerMutationRequestSchema.safeParse({
      ...packageBase,
      operation: { type: 'layer.group', nodeId: 'draft:22222222-2222-4222-8222-222222222222' },
    }).success).toBe(false);
  });

  test('requires actual response mapping fields and an explicit native fidelity boundary', () => {
    const response = {
      filename: 'source-layer-duplicate.zip', sourceSha256, outputSha256: 'b'.repeat(64), inlineBase64: 'UEs=',
      mapping: { nodeId: 'draft:22222222-2222-4222-8222-222222222222', persistedUid: 18, compId: 1, index: 0,
        sourceNodeId: 'draft:11111111-1111-4111-8111-111111111111' },
      readback: { operation: 'layer.duplicate', originalLayerCount: 4, outputLayerCount: 5,
        unchangedLayerPayloadCount: 4, duplicatePayloadPreserved: true },
      proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', sourceGraphPreservedOutsideOperation: true,
        unchangedPackageDependencies: true, pythonSaveReopen: true,
        nativeAfterEffects: { status: 'unverified', reason: 'Linux writer proof only.' } },
    };
    expect(templateAuthoringLayerMutationResponseSchema.safeParse(response).success).toBe(true);
    expect(templateAuthoringLayerMutationResponseSchema.safeParse({ ...response, proof: undefined }).success).toBe(false);
  });
});


test('requires distinct complete animated-translation evidence and exact direct-child identities', () => {
  const children = [46, 47].map((uid) => ({ uid, parentUid: null, position: [47.25, 7.5, 7], compId: 32, changedPositionLeafPaths: ['parent', 'position'] }));
  const translation = { kind: 'constant_translation', offset: [37.25, -12.5],
    children: children.map(({ uid }) => ({ uid, positionKeys: [{ frame: 15, time: 0.5, value: [47.25, 7.5, 7] }, { frame: 75, time: 2.5, value: [67.25, 27.5, 7] }] })),
    positionKeyMetadataPreserved: true, nonPositionTransformPayloadsPreserved: true };
  const response = { filename: 'ungroup.zip', sourceSha256, outputSha256: 'b'.repeat(64), inlineBase64: 'UEs=',
    ungrouped: { nodeId: 'draft:11111111-1111-4111-8111-111111111111', persistedUid: 526, compId: 32, removedIndex: 0, sourceUid: 525 },
    ungroupedMembers: children.map(({ uid, compId }) => ({ nodeId: `aep:${compId}:${uid}`, persistedUid: uid, compId, parentUid: null })),
    readback: { operation: 'layer.ungroup', originalLayerCount: 3, outputLayerCount: 2, groupRemoved: true, removedSourceUid: 525, ungroupedChildCount: 2, children, animationTranslation: translation },
    proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', sourceGraphPreservedOutsideOperation: true, unchangedPackageDependencies: true, pythonSaveReopen: true,
      nativeAfterEffects: { status: 'unverified', reason: 'Package readback only.' } } };
  expect(templateAuthoringLayerMutationResponseSchema.safeParse(response).success).toBe(true);
  const invalid = (animationTranslation: unknown, extra: object = {}) => templateAuthoringLayerMutationResponseSchema.safeParse({
    ...response, readback: { ...response.readback, ...extra, animationTranslation } }).success;
  expect(invalid(undefined)).toBe(false);
  expect(invalid({ ...translation, positionKeyMetadataPreserved: false })).toBe(false);
  expect(invalid({ ...translation, nonPositionTransformPayloadsPreserved: undefined })).toBe(false);
  expect(invalid(translation, { memberPayloadsChangedOnlyByParentAndStaticTransform: true })).toBe(false);
  expect(invalid(translation, { memberPayloadsChangedOnlyByParentAndStaticPosition: true })).toBe(false);
  expect(invalid({ ...translation, children: [translation.children[0], translation.children[0]] })).toBe(false);
  expect(invalid({ ...translation, children: [{ ...translation.children[0], uid: 999 }, translation.children[1]] })).toBe(false);
  expect(invalid({ ...translation, children: translation.children.map((child) => ({ ...child, positionKeys: [...child.positionKeys].reverse() })) })).toBe(false);
  expect(invalid(translation, { operation: 'layer.delete' })).toBe(false);
  expect(invalid(translation, { ungroupedChildCount: 3 })).toBe(false);
  expect(invalid(translation, { removedSourceUid: 999 })).toBe(false);
  expect(invalid(translation, { outputLayerCount: 3 })).toBe(false);
});
