import { describe, expect, test } from 'bun:test';
import {
  templateAuthoringGroupTransformRequestSchema,
  templateAuthoringGroupTransformResponseSchema,
} from './template-authoring-group-transform';

const draftNodeId = '11111111-1111-4111-8111-111111111111';
const sourceSha256 = 'a'.repeat(64);
const request = {
  schema: 'forge_template_authoring_group_transform/v1',
  filename: 'group.zip', sourceSha256, inlineBase64: 'UEs=',
  receipt: {
    mapping: { draftNodeId, persistedUid: 526, compId: 32, index: 0, sourceUid: 525 },
    members: [
      { nodeId: 'aep:32:46', persistedUid: 46, parentUid: 526 },
      { nodeId: 'aep:32:49', persistedUid: 49, parentUid: 526 },
    ],
  },
  operation: { type: 'layer.group.transform', nodeId: `draft:${draftNodeId}`, compId: 32, transform: { position: [75, 40], scale: [130, 130], rotation: 25 } },
};

describe('native group transform writer contract', () => {
  test('pins target and members to the prior exact group receipt', () => {
    expect(templateAuthoringGroupTransformRequestSchema.safeParse(request).success).toBe(true);
    expect(templateAuthoringGroupTransformRequestSchema.safeParse({
      ...request, operation: { ...request.operation, nodeId: 'aep:32:526' },
    }).success).toBe(false);
    expect(templateAuthoringGroupTransformRequestSchema.safeParse({
      ...request, receipt: { ...request.receipt, members: [{ ...request.receipt.members[0], parentUid: 19 }, request.receipt.members[1]] },
    }).success).toBe(false);
    expect(templateAuthoringGroupTransformRequestSchema.safeParse({
      ...request, operation: { ...request.operation, transform: { scale: [0, 100] } },
    }).success).toBe(false);
    expect(templateAuthoringGroupTransformRequestSchema.safeParse({
      ...request, operation: { ...request.operation, transform: { rotation: 25, nativeUid: 526 } },
    }).success).toBe(false);
  });

  test('requires a Rust/Python readback and explicit native After Effects boundary', () => {
    const response = {
      filename: 'group-group.zip', sourceSha256, outputSha256: 'b'.repeat(64), inlineBase64: 'UEs=',
      mapping: request.receipt.mapping,
      members: request.receipt.members,
      readback: { position: [75, 40, 0], scale: [130, 130, 100], rotation: 25, index: 0, memberUids: [46, 49] },
      proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', exactPriorReceiptMatched: true,
        childAndUnrelatedLayerPayloadsPreserved: true, unchangedPackageDependencies: true, rustAndPythonReadback: true,
        nativeAfterEffects: { status: 'unverified', reason: 'Linux writer proof only.' } },
    };
    expect(templateAuthoringGroupTransformResponseSchema.safeParse(response).success).toBe(true);
    expect(templateAuthoringGroupTransformResponseSchema.safeParse({
      ...response, proof: { ...response.proof, exactPriorReceiptMatched: false },
    }).success).toBe(false);
    expect(templateAuthoringGroupTransformResponseSchema.safeParse({
      ...response, readback: { ...response.readback, rotation: Infinity },
    }).success).toBe(false);
  });
});
