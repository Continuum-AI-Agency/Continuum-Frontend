import { describe, expect, test } from 'bun:test';
import {
  templateAuthoringTextCreateRequestSchema,
  templateAuthoringTextCreateResponseSchema,
} from './template-authoring-writer';

const request = {
  schema: 'forge_template_authoring_text_create/v1',
  filename: 'pinned.aep',
  sourceSha256: 'a'.repeat(64),
  inlineBase64: 'QUVQ',
  font: { filename: 'DejaVuSans.ttf', postScriptName: 'DejaVuSans', sha256: 'b'.repeat(64), inlineBase64: 'Zm9udA==' },
  operation: {
    type: 'text.create',
    draftNodeId: '11111111-1111-4111-8111-111111111111',
    compId: 7,
    insertionIndex: 0,
    name: 'New heading',
    text: 'Hello',
    style: { fontPostScriptName: 'DejaVuSans', fontSize: 44, fillColor: [1, 1, 1] },
    position: [540, 960],
    inSec: 0,
    outSec: 3,
  },
};

describe('template text creation writer protocol', () => {
  test('accepts a pinned source, explicit face, and one strict text.create command', () => {
    expect(templateAuthoringTextCreateRequestSchema.safeParse(request).success).toBe(true);
  });

  test('rejects a missing font, reused source identity, invalid timing, and extra operations', () => {
    const { font: _font, ...withoutFont } = request;
    expect(templateAuthoringTextCreateRequestSchema.safeParse(withoutFont).success).toBe(false);
    expect(templateAuthoringTextCreateRequestSchema.safeParse({
      ...request,
      operation: { ...request.operation, type: 'layer.delete' },
    }).success).toBe(false);
    expect(templateAuthoringTextCreateRequestSchema.safeParse({
      ...request,
      operation: { ...request.operation, outSec: 0 },
    }).success).toBe(false);
    expect(templateAuthoringTextCreateRequestSchema.safeParse({ ...request, unexpected: true }).success).toBe(false);
  });

  test('requires explicit proof fields and reports native After Effects as unverified', () => {
    const response = {
      filename: 'pinned-text.zip',
      sourceSha256: 'a'.repeat(64),
      outputSha256: 'c'.repeat(64),
      inlineBase64: 'emlw',
      mapping: { draftNodeId: request.operation.draftNodeId, persistedUid: 99, compId: 7 },
      readback: {
        name: 'New heading', text: 'Hello', fontPostScriptName: 'DejaVuSans', fontSize: 44,
        fillColor: [1, 1, 1], position: [540, 960], inSec: 0, outSec: 3, index: 0,
      },
      proof: {
        rustAuthority: 'aep2json-rust', rustStatus: 'ready', originalCompositionCount: 1,
        outputCompositionCount: 1, originalEssentialPropertyCount: 4, outputEssentialPropertyCount: 4,
        originalLayerCount: 4, outputLayerCount: 5, newLayerCount: 1, sourceGraphPreserved: true,
        existingSerializedLayerPayloadsPreserved: true, unchangedPackageDependencies: true,
        pythonMeasuredNewLayer: true,
        nativeAfterEffects: { status: 'unverified', reason: 'Linux proof only' },
      },
    };
    expect(templateAuthoringTextCreateResponseSchema.safeParse(response).success).toBe(true);
    expect(templateAuthoringTextCreateResponseSchema.safeParse({
      ...response,
      proof: { ...response.proof, existingSerializedLayerPayloadsPreserved: false },
    }).success).toBe(false);
  });
});
