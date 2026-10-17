import { expect, it } from 'bun:test';
import { templateCompSchema, templateMaskSourceGeometrySchema, templateParseSchema } from './template-source';

it('keeps mask source geometry pinned, affine-verified, and separate from comp-space geometry', () => {
  const verified = {
    status: 'verified', coordinateSpace: 'layer-source-pixels', sourceKind: 'shape-path',
    sourceRef: { kind: 'native-path', id: null, name: 'Path 1' },
    bounds: { x: -243.27, y: -4, width: 80, height: 90 }, anchor: [0, 0, 0],
    position: [540, 960, 0], scale: [100, 100, 100], rotation: 0,
    localToComp: { matrix: [1, 0, 0, 1, 540, 960], corners: [[-243.27, -4], [-163.27, -4], [-163.27, 86], [-243.27, 86]], verifiedWithPyAep: true },
    measurement: 'py-aep-native', packageSha256: 'a'.repeat(64), sourceAepSha256: 'b'.repeat(64), compId: 4, layerUid: 91,
  };
  expect(templateMaskSourceGeometrySchema.parse(verified)).toEqual(verified);
  expect(() => templateMaskSourceGeometrySchema.parse({ ...verified, localToComp: { ...verified.localToComp, verifiedWithPyAep: false } })).toThrow();
  expect(templateMaskSourceGeometrySchema.parse({
    status: 'pending', reason: 'Text bounds are not measured', packageSha256: 'a'.repeat(64),
    sourceAepSha256: 'b'.repeat(64), compId: 4, layerUid: 91,
  }).status).toBe('pending');
});

it('preserves Rust structural authority, raw unsupported fields, measurement identities, and source pins', () => {
  const source = {
    parser: 'py_aep@0.14.0',
    sourceFamily: 'after_effects',
    checksum: 'a'.repeat(64),
    sourceAepChecksum: 'b'.repeat(64),
    comps: [{ id: 4, name: 'Delivery', width: 1080, height: 1920, frameRate: 29.97, durationSec: 5, layerCount: 1, isTop: true, isDelivery: true }],
    ratios: [{ ratio: '9:16', width: 1080, height: 1920, comps: ['Delivery'] }],
    structure: {
      authority: 'aep2json-rust',
      sourceAepChecksum: 'b'.repeat(64),
      sourcePackageChecksum: 'a'.repeat(64),
      raw: { depth: 'BPC_8', items: { '4': { Expressions: { source: 'unsupported expression' } } } },
      comps: [{
        id: 4,
        name: 'Delivery',
        width: 1080,
        height: 1920,
        frameRate: 29.97,
        durationSec: 5,
        containedByCompIds: [],
        pythonProjection: { isDelivery: true, isTop: true },
        clock: { frameIn: 0, frameOut: 149, cursorFramePosition: 0 },
        essentialProperties: { Name: 'nested', Properties: [{ LayerID: 91, Data: { expression: 'preserve me' } }] },
        raw: { ID: 4, ItemType: 'Composition', CompositionLayers: [{ Uid: 91 }] },
        layers: [{
          id: 91,
          compId: 4,
          index: 2,
          name: 'Logo',
          sourceId: 13,
          sourceCompositionId: null,
          nativeParentUid: null,
          parentUidKnown: true,
          parentLayerUid: null,
          trackMatteTypeRaw: 0,
          trackMatteLayerUid: null,
          trackMatteUidKnown: true,
          trackMatteLayerResolved: false,
          layerHeaderBytes: 164,
          effectsEnabled: true,
          effects: [{ Name: 'Glow', Properties: [{ Expression: 'preserve me' }] }],
          expressions: { source: 'keep' },
          raw: { Uid: 91, SourceID: 13, Effects: [{ Name: 'Glow' }], UnsupportedField: { nested: true } },
          measurement: { authority: 'py-aep', ownerCompId: 4, leafCompId: 4, layerId: 91, box: [1, 2, 3, 4], slotKey: 'logo' },
          measurements: [{ authority: 'py-aep', ownerCompId: 4, leafCompId: 4, layerId: 91, box: [1, 2, 3, 4], slotKey: 'logo' }],
        }],
      }],
      dependencies: [{ id: 13, name: 'logo.png', itemType: 'Footage', raw: { ID: 13, FilePath: 'logo.png' } }],
      essentialProperties: [{ compId: 4, Name: 'nested', Properties: [{ LayerID: 91 }] }],
      diagnostics: [{ code: 'PARSER_FEATURE_DISAGREEMENT', feature: 'frameRate', message: 'Rust and Python disagree on frameRate for composition 4; the top-level value uses Rust.', severity: 'warning', status: 'warning', compId: 4, rust: 29.97, python: 25 }],
      status: 'warning',
      python: { parser: 'py-aep', measurementCount: 1 },
    },
  };
  const parsed = templateParseSchema.parse(source);
  expect(parsed.structure?.authority).toBe('aep2json-rust');
  expect(parsed.structure?.raw.items).toEqual(source.structure.raw.items);
  expect(parsed.structure?.comps[0]?.layers[0]?.measurement).toEqual(source.structure.comps[0]?.layers[0]?.measurement);
  expect(parsed.structure?.comps[0]?.layers[0]?.raw.UnsupportedField).toEqual({ nested: true });
  expect(parsed.structure?.diagnostics).toEqual(source.structure.diagnostics);
  expect(parsed.structure?.status).toBe('warning');
  expect(parsed.comps[0]?.id).toBe(4);
  expect(parsed.ratios[0]?.width).toBe(1080);
  expect(parsed.checksum).not.toBe(parsed.sourceAepChecksum);
});

it('keeps the legacy public comp shape strict while retaining unknown Rust geometry in structure', () => {
  const legacy = { name: 'Delivery', width: 1080, height: 1920, frameRate: 29.97, durationSec: 5, layerCount: 1, isTop: true, isDelivery: true };
  expect(templateCompSchema.parse(legacy)).toEqual(legacy);
  expect(() => templateCompSchema.parse({ ...legacy, width: null })).toThrow();
  const parsed = templateParseSchema.parse({
    parser: 'aep2json-rust+py-aep', sourceFamily: 'after_effects',
    comps: [legacy],
    structure: {
      authority: 'aep2json-rust', sourceAepChecksum: 'b'.repeat(64), sourcePackageChecksum: null,
      raw: { items: { '4': { ID: 4, FootageDimensions: null } } },
      comps: [{ id: 4, name: null, width: null, height: null, frameRate: null, durationSec: null, containedByCompIds: [], clock: {}, essentialProperties: null, layers: [], raw: { ID: 4 }, supplementalGeometry: { source: 'py-aep', fields: { width: 1080, height: 1920 } } }],
      dependencies: [], essentialProperties: [], diagnostics: [{ code: 'COMPOSITION_PUBLIC_PROJECTION_PENDING', feature: 'composition-contract', message: 'unknown geometry retained', severity: 'warning', status: 'pending' }], status: 'pending', python: {},
    },
  });
  expect(parsed.structure?.comps[0]?.width).toBeNull();
  expect(parsed.structure?.comps[0]?.supplementalGeometry).toEqual({ source: 'py-aep', fields: { width: 1080, height: 1920 } });
  expect(parsed.structure?.status).toBe('pending');
});
