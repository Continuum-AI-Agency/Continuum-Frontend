import { describe, expect, it } from 'vitest';
import { templateAuthoringMaskCreateRequestSchema, templateAuthoringMaskCreateResponseSchema } from './template-authoring-mask';

const request = {
  schema: 'forge_template_authoring_mask_create/v1', filename: 'source.zip', sourceSha256: 'a'.repeat(64), inlineBase64: 'eA==',
  operation: { type: 'mask.create', draftMaskId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', compId: 1, layerUid: 16,
    name: 'Ellipse proof', shape: 'ellipse', center: [-106.635986328125, 132.635986328125], size: [100, 80], mode: 'subtract', opacity: 73, feather: [12, 8] },
};
const response = {
  filename: 'source-mask.zip', sourceSha256: 'a'.repeat(64), outputSha256: 'b'.repeat(64), inlineBase64: 'eA==',
  mapping: { draftMaskId: request.operation.draftMaskId, compId: 1, layerUid: 16, maskId: 2, propertyIndex: 1 },
  readback: { maskId: 2, name: 'Ellipse proof', vertices: [[-106.635986328125, 92.635986328125], [-56.635986328125, 132.635986328125], [-106.635986328125, 172.635986328125], [-156.635986328125, 132.635986328125]],
    inTangents: [[-27.614237368106842, 0], [0, -22.091389894485474], [27.614235877990723, 0], [0, 22.091388702392578]],
    outTangents: [[27.614235877990723, 0], [0, 22.091388702392578], [-27.614237368106842, 0], [0, -22.091389894485474]],
    closed: true, mode: 'subtract', opacity: 73, feather: [12, 8], keyframes: { path: 0, opacity: 0, feather: 0 },
    layerInSec: 0, layerOutSec: 268.7020353687, layerWidth: 1024, layerHeight: 1024,
    compVertices: [[405.364013671875, 604.635986328125], [455.364013671875, 644.635986328125], [405.364013671875, 684.635986328125], [355.364013671875, 644.635986328125]] },
  proof: { rustAuthority: 'aep2json-rust', rustStatus: 'ready', layerIdentityAndTimingPreserved: true,
    allUnrelatedLayerPayloadsPreserved: true, existingMaskPayloadsPreserved: true, allOriginalTargetLayerLeafChunksPreserved: true,
    dependenciesAndEssentialPropertiesPreserved: true, pythonSaveReopen: true,
    sourceGeometry: { sourceKind: 'shape-path', bounds: { x: -243.27197265625, y: -4, width: 273.27197265625, height: 273.27197265625 },
      anchor: [-106.635986328125, 132.635986328125, 0], localToComp: { matrix: [1, 0, 0, 1, 512, 512],
        corners: [[268.72802734375, 508], [542, 508], [542, 781.27197265625], [268.72802734375, 781.27197265625]], verifiedWithPyAep: true } },
    nativeAfterEffects: { status: 'unverified', reason: 'Linux fixture writer only' } },
};

describe('template authoring mask contract', () => {
  it('accepts static rectangle/ellipse mask commands and layer-local geometry', () => {
    expect(templateAuthoringMaskCreateRequestSchema.parse(request)).toEqual(request);
    expect(templateAuthoringMaskCreateRequestSchema.safeParse({ ...request, operation: { ...request.operation, center: [-1, 5] } }).success).toBe(true);
    expect(templateAuthoringMaskCreateRequestSchema.safeParse({ ...request, operation: { ...request.operation, feather: [-1, 0] } }).success).toBe(false);
    expect(templateAuthoringMaskCreateRequestSchema.safeParse({ ...request, operation: { ...request.operation, keyframes: [] } }).success).toBe(false);
  });
  it('requires native mask identity and complete static path/style/timing proof', () => {
    expect(templateAuthoringMaskCreateResponseSchema.parse(response)).toEqual(response);
    expect(templateAuthoringMaskCreateResponseSchema.safeParse({ ...response, proof: { ...response.proof, existingMaskPayloadsPreserved: false } }).success).toBe(false);
    expect(templateAuthoringMaskCreateResponseSchema.safeParse({ ...response, readback: { ...response.readback, keyframes: { path: 1, opacity: 0, feather: 0 } } }).success).toBe(false);
  });
});
