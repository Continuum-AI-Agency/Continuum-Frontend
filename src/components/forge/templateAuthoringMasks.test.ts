import { describe, expect, test } from 'bun:test';
import type { TemplateAuthoringNode, TemplateMaskSourceGeometry } from '@continuum/contracts';
import {
  defaultMaskDraft,
  maskCreationReason,
  maskDraftFitsSource,
  maskPreviewMatrix,
} from './templateAuthoringMasks';

const checksum = 'a'.repeat(64);
const geometry = (sourceKind: 'shape-path' | 'footage'): TemplateMaskSourceGeometry => ({
  status: 'verified', coordinateSpace: 'layer-source-pixels', sourceKind,
  sourceRef: { kind: sourceKind === 'shape-path' ? 'native-path' : 'footage-item', id: 8, name: 'Source' },
  bounds: sourceKind === 'shape-path'
    ? { x: -243.27197, y: -4, width: 273.27197, height: 273.27197 }
    : { x: 0, y: 0, width: 4001, height: 2334 },
  anchor: sourceKind === 'shape-path' ? [-106.635986, 132.635986, 0] : [2000.5, 1167, 0],
  position: sourceKind === 'shape-path' ? [512, 512, 0] : [422.2775, 82.0057, 0],
  scale: sourceKind === 'shape-path' ? [100, 100, 100] : [10, 10, 100],
  rotation: 0,
  localToComp: {
    matrix: sourceKind === 'shape-path' ? [1, 0, 0, 1, 512, 512] : [0.1, 0, 0, 0.1, 222.2275, -34.6943],
    corners: [[0, 0], [1, 0], [1, 1], [0, 1]], verifiedWithPyAep: true,
  },
  measurement: 'native test fixture', packageSha256: checksum, sourceAepSha256: 'b'.repeat(64), compId: 1, layerUid: 16,
});

const node = (sourceKind: 'shape-path' | 'footage'): TemplateAuthoringNode => ({
  nodeId: 'aep:1:16', sourceRef: { compId: 1, layerId: 16 }, sourceNodeId: null,
  sourceCompositionId: null, parentNodeId: null, name: 'Source', textContent: null,
  fontRef: null, fillColor: null, kind: sourceKind === 'shape-path' ? 'shape' : 'artwork',
  shape: null, size: null, pathPosition: null, fill: null, stroke: null,
  artworkAssetRef: null, inSec: null, outSec: null, timingReason: null, keyframeChannels: [],
  index: 0, visible: true, visibilityReason: null, textReason: null, fontReason: null,
  font: null, fontSize: null, position: geometry(sourceKind).position.slice(0, 2) as [number, number],
  rotation: 0, scale: geometry(sourceKind).scale.slice(0, 2) as [number, number], opacity: 100,
  transformLocks: {}, capabilities: {
    transform: true, visibility: true, font: false, text: false, order: true, exposure: false,
    creation: false, duplicate: false, delete: false, grouping: false, masks: true,
    artboardMutation: false, timing: false, keyframes: false,
  }, duplicateReason: null, deleteReason: null, maskReason: null, maskGeometryReason: null,
  maskSourceGeometry: geometry(sourceKind), masks: [], opaqueSourceRef: { versionId: '10000000-0000-4000-8000-000000000001', checksum },
});

describe('verified source-space mask creation', () => {
  test('centers a negative-origin shape mask in signed source bounds', () => {
    const source = node('shape-path');
    const draft = defaultMaskDraft(source)!;
    expect(draft.center).toEqual([-106.635985, 132.635985]);
    expect(draft.center[0]).not.toBe(200);
    expect(maskCreationReason(source, checksum)).toBeNull();
    expect(maskDraftFitsSource(source, checksum, draft)).toBe(true);
    expect(maskPreviewMatrix(source, checksum)).toEqual([1, 0, 0, 1, 512, 512]);
  });

  test('uses exact footage source pixels and its pinned affine', () => {
    const source = node('footage');
    const draft = defaultMaskDraft(source)!;
    expect(draft.center).toEqual([2000.5, 1167]);
    expect(draft.size).toEqual([2000.5, 1167]);
    expect(maskPreviewMatrix(source, checksum)).toEqual([0.1, 0, 0, 0.1, 222.2275, -34.6943]);
  });

  test('carries a supported later source translation through the pinned source affine once', () => {
    const source = node('shape-path');
    expect(maskPreviewMatrix({ ...source, position: [537, 492] }, checksum)).toEqual([1, 0, 0, 1, 537, 492]);
  });

  test('fails closed for pending, mismatched, parented, or out-of-source geometry', () => {
    const source = node('shape-path');
    expect(maskCreationReason({ ...source, capabilities: { ...source.capabilities, masks: false } }, checksum)).toMatch(/unavailable/);
    expect(maskCreationReason(source, 'c'.repeat(64))).toMatch(/pinned source layer/);
    expect(maskCreationReason({ ...source, sourceRef: { compId: 1, layerId: 17 } }, checksum)).toMatch(/pinned source layer/);
    expect(maskPreviewMatrix({ ...source, parentNodeId: 'aep:1:3' }, checksum)).toBeNull();
    const draft = defaultMaskDraft(source)!;
    draft.center[0] = 1000;
    expect(maskDraftFitsSource(source, checksum, draft)).toBe(false);
  });
});
