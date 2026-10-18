import { describe, expect, it } from 'bun:test';
import { templateAuthoringKeyframesInventorySchema, templateAuthoringKeyframesRequestSchema, templateAuthoringKeyframesResponseSchema } from './template-authoring-keyframes';

const id = (n: string) => `draft:00000000-0000-4000-8000-${n.padStart(12, '0')}`;
const request = {
  schema: 'forge_template_authoring_layer_keyframes/v1', filename: 'source.zip', sourceSha256: 'a'.repeat(64), inlineBase64: 'YQ==',
  operation: { type: 'layer.keyframes.replace', compId: 48, layerUid: 515, channel: 'opacity', keyframes: [
    { keyframeId: id('1'), timeSec: 0, value: 100, inInterpolation: 'BEZIER', outInterpolation: 'BEZIER', outEase: [{ speed: 12, influence: 40 }] },
    { keyframeId: id('2'), timeSec: 1, value: 40, inInterpolation: 'BEZIER', outInterpolation: 'BEZIER', inEase: [{ speed: 14, influence: 50 }] },
  ] },
};

describe('template authoring keyframes DTO', () => {
  it('accepts bounded 2D channel replacement and draft-to-native frame receipts', () => {
    expect(templateAuthoringKeyframesRequestSchema.safeParse(request).success).toBe(true);
    expect(templateAuthoringKeyframesResponseSchema.safeParse({
      filename: 'source-keyframes.zip', sourceSha256: 'a'.repeat(64), outputSha256: 'b'.repeat(64), inlineBase64: 'YQ==',
      mapping: [{ draftKeyframeId: id('1'), channelId: 'aep:48:515:ADBE Opacity', nativeFrameIndex: 0, nativeFrame: 0, timeSec: 0 },
        { draftKeyframeId: id('2'), channelId: 'aep:48:515:ADBE Opacity', nativeFrameIndex: 1, nativeFrame: 30, timeSec: 1.001 }],
      readback: { compId: 48, layerUid: 515, channelId: 'aep:48:515:ADBE Opacity', channel: 'opacity', frameRate: 29.97, keyframes: [
        { keyframeId: id('1'), nativeFrameIndex: 0, nativeFrame: 0, timeSec: 0, value: 100, inInterpolation: 'BEZIER', outInterpolation: 'BEZIER', inEase: [{ speed: 0, influence: 0 }], outEase: [{ speed: 12, influence: 40 }] },
        { keyframeId: id('2'), nativeFrameIndex: 1, nativeFrame: 30, timeSec: 1.001, value: 40, inInterpolation: 'BEZIER', outInterpolation: 'BEZIER', inEase: [{ speed: 14, influence: 50 }], outEase: [{ speed: 0, influence: 0 }] },
      ] },
      proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', pythonSaveReopen: true, targetChannelChunkExact: true,
        unchangedTargetTopLevelChunkCount: 3, unchangedTransformSiblingChunkCount: 27, unchangedUnrelatedLayerCount: 56,
        targetPropertyChunkPathBefore: [2, 5, 25], targetPropertyChunkPathAfter: [2, 5, 21],
        dependenciesAndEssentialPropertiesPreserved: true, generatedGroupReceiptVerified: false, nativeAfterEffects: { status: 'unverified', reason: 'Linux writer bench only' } },
    }).success).toBe(true);
  });
  it('requires exact paired fresh-artboard identity context for generated-group channels', () => {
    const context = {
      identityMap: [{ nodeId: id('11'), compId: 48, persistedUid: 515, sourceUid: 514,
        members: [{ nodeId: id('12'), persistedUid: 516, parentUid: 515 }, { nodeId: id('13'), persistedUid: 517, parentUid: 515 }] }],
      freshArtboardReceipt: { compId: 48, sourceCompId: null, name: 'Fresh', width: 640, height: 360,
        frameRate: 30, durationSec: 4, layerUidMap: [] },
    };
    expect(templateAuthoringKeyframesRequestSchema.safeParse({ ...request, ...context }).success).toBe(true);
    expect(templateAuthoringKeyframesRequestSchema.safeParse({ ...request, identityMap: context.identityMap }).success).toBe(false);
    expect(templateAuthoringKeyframesRequestSchema.safeParse({ ...request, ...context,
      freshArtboardReceipt: { ...context.freshArtboardReceipt, compId: 49 } }).success).toBe(false);
    const groupedResponse = templateAuthoringKeyframesResponseSchema.parse({
      filename: 'group-keyframes.zip', sourceSha256: 'a'.repeat(64), outputSha256: 'b'.repeat(64), inlineBase64: 'YQ==',
      mapping: [], readback: { compId: 48, layerUid: 515, channelId: 'aep:48:515:ADBE Position', channel: 'position', frameRate: 30, keyframes: [] },
      proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', pythonSaveReopen: true, targetChannelChunkExact: true,
        unchangedTargetTopLevelChunkCount: 3, unchangedTransformSiblingChunkCount: 11,
        targetPropertyChunkPathBefore: [2, 5, 5], targetPropertyChunkPathAfter: [2, 5, 5],
        unchangedUnrelatedLayerCount: 2, dependenciesAndEssentialPropertiesPreserved: true,
        generatedGroupReceiptVerified: true, generatedGroupOpacityLocked: true,
        generatedGroupTransformChannels: ['position', 'scale', 'rotation'],
        nativeAfterEffects: { status: 'unverified', reason: 'Linux fixture only' } },
    });
    const { generatedGroupOpacityLocked: _opacityLock, generatedGroupTransformChannels: _groupChannels, ...childProof } = groupedResponse.proof;
    const childResponse = { ...groupedResponse, proof: { ...childProof, generatedChildReceiptVerified: true } };
    expect(templateAuthoringKeyframesResponseSchema.safeParse(childResponse).success).toBe(true);
    expect(templateAuthoringKeyframesResponseSchema.safeParse({ ...childResponse,
      proof: { ...childResponse.proof, generatedGroupReceiptVerified: false } }).success).toBe(false);
    expect(templateAuthoringKeyframesResponseSchema.safeParse({ ...groupedResponse,
      proof: { ...groupedResponse.proof, generatedChildReceiptVerified: true } }).success).toBe(false);
    expect(groupedResponse.proof.generatedGroupTransformChannels).toEqual(['position', 'scale', 'rotation']);
    expect(templateAuthoringKeyframesResponseSchema.safeParse({ ...groupedResponse,
      proof: { ...groupedResponse.proof, generatedGroupReceiptVerified: false } }).success).toBe(false);
  });
  it('rejects duplicate draft identities and vectors on scalar channels', () => {
    const duplicate = structuredClone(request);
    duplicate.operation.keyframes[1].keyframeId = duplicate.operation.keyframes[0].keyframeId;
    expect(templateAuthoringKeyframesRequestSchema.safeParse(duplicate).success).toBe(false);
    const vector = structuredClone(request);
    vector.operation.keyframes[0].value = [100, 0, 0] as never;
    expect(templateAuthoringKeyframesRequestSchema.safeParse(vector).success).toBe(false);
  });
  it('accepts a single preroll key and an empty replacement to clear the native channel', () => {
    const single = structuredClone(request);
    single.operation.keyframes = [{ keyframeId: id('3'), timeSec: -15 / 29.970001220703125, value: 100,
      inInterpolation: 'LINEAR', outInterpolation: 'LINEAR' }];
    expect(templateAuthoringKeyframesRequestSchema.safeParse(single).success).toBe(true);
    const clear = structuredClone(request);
    clear.operation.keyframes = [];
    expect(templateAuthoringKeyframesRequestSchema.safeParse(clear).success).toBe(true);
    expect(templateAuthoringKeyframesResponseSchema.safeParse({
      filename: 'source-keyframes.zip', sourceSha256: 'a'.repeat(64), outputSha256: 'b'.repeat(64), inlineBase64: 'YQ==',
      mapping: [], readback: { compId: 48, layerUid: 515, channelId: 'aep:48:515:ADBE Position', channel: 'position', frameRate: 29.97, keyframes: [] },
      proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', pythonSaveReopen: true, targetChannelChunkExact: true,
        unchangedTargetTopLevelChunkCount: 3, unchangedTransformSiblingChunkCount: 11,
        targetPropertyChunkPathBefore: [2, 5, 5], targetPropertyChunkPathAfter: [2, 5, 5],
        unchangedUnrelatedLayerCount: 56, dependenciesAndEssentialPropertiesPreserved: true, generatedGroupReceiptVerified: false,
        nativeAfterEffects: { status: 'unverified', reason: 'Linux writer bench only' } },
    }).success).toBe(true);
  });
  it('distinguishes missing eligibility from verified channel metadata', () => {
    expect(templateAuthoringKeyframesInventorySchema.safeParse(undefined).success).toBe(true);
    expect(templateAuthoringKeyframesInventorySchema.safeParse({ keyframeReasons: { position: null, scale: '3D layer', rotation: null, opacity: null },
      keyframeChannels: { position: { channelId: 'aep:48:515:ADBE Position', matchName: 'ADBE Position', frameRate: 29.97,
        dimensions: 3, separated: false, keyframes: [{ nativeFrameIndex: 0, nativeFrame: 0, timeSec: 0, value: [1, 2, 0],
          inInterpolation: 'LINEAR', outInterpolation: 'LINEAR', inEase: [{ speed: 0, influence: 0 }], outEase: [{ speed: 0, influence: 0 }] }] } } }).success).toBe(true);
  });
});
