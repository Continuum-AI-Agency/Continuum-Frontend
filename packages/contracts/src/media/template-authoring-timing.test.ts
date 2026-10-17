import { describe, expect, it } from 'vitest';
import {
  templateAuthoringTimingReasonSchema,
  templateAuthoringTimingRequestSchema,
  templateAuthoringTimingResponseSchema,
} from './template-authoring-timing';

const hash = 'a'.repeat(64);
const request = {
  schema: 'forge_template_authoring_layer_timing/v1', filename: 'source.zip', sourceSha256: hash, inlineBase64: 'c291cmNl',
  operation: { type: 'layer.timing', compId: 48, layerUid: 515, inSec: 2.25, outSec: 12.5 },
};
const response = {
  filename: 'source-timing.zip', sourceSha256: hash, outputSha256: 'b'.repeat(64), inlineBase64: 'b3V0cHV0',
  mapping: { compId: 48, layerUid: 515 },
  readback: { compId: 48, layerUid: 515, previous: { inSec: 0, outSec: 15 }, inSec: 2.25, outSec: 12.5 },
  proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', exactLdtaByteOffsets: [23, 26, 27],
    targetNonTimingChunksPreserved: true, layerIdentitiesAndOrderPreserved: true,
    dependenciesAndEssentialPropertiesPreserved: true, pythonSaveReopen: true, generatedGroupReceiptVerified: false,
    nativeAfterEffects: { status: 'unverified', reason: 'Linux fixture proof only.' } },
};

describe('template authoring timing contract', () => {
  it('accepts the exact pinned native timing request and receipt', () => {
    expect(templateAuthoringTimingRequestSchema.parse(request)).toEqual(request);
    expect(templateAuthoringTimingResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects invalid timing intervals and distinguishes pending from eligible metadata', () => {
    expect(templateAuthoringTimingRequestSchema.safeParse({ ...request, operation: { ...request.operation, outSec: 2 } }).success).toBe(false);
    expect(templateAuthoringTimingReasonSchema.parse(undefined)).toBeUndefined();
    expect(templateAuthoringTimingReasonSchema.parse(null)).toBeNull();
    expect(templateAuthoringTimingReasonSchema.parse('layer has an active matte')).toBe('layer has an active matte');
  });

  it('requires exact paired fresh-artboard identity context for generated-group targets', () => {
    const context = {
      identityMap: [{ nodeId: 'draft:00000000-0000-4000-8000-000000000011', compId: 48, persistedUid: 515,
        sourceUid: 514, members: [{ nodeId: 'draft:00000000-0000-4000-8000-000000000012', persistedUid: 516, parentUid: 515 },
          { nodeId: 'draft:00000000-0000-4000-8000-000000000013', persistedUid: 517, parentUid: 515 }] }],
      freshArtboardReceipt: { compId: 48, sourceCompId: null, name: 'Fresh', width: 640, height: 360,
        frameRate: 30, durationSec: 4, layerUidMap: [] },
    };
    expect(templateAuthoringTimingRequestSchema.safeParse({ ...request, ...context }).success).toBe(true);
    expect(templateAuthoringTimingResponseSchema.parse({ ...response, proof: { ...response.proof, generatedGroupReceiptVerified: true } }).proof.generatedGroupReceiptVerified).toBe(true);
    expect(templateAuthoringTimingRequestSchema.safeParse({ ...request, identityMap: context.identityMap }).success).toBe(false);
    expect(templateAuthoringTimingRequestSchema.safeParse({ ...request, ...context,
      freshArtboardReceipt: { ...context.freshArtboardReceipt, compId: 49 } }).success).toBe(false);
  });
});
