import { expect, test } from 'bun:test';
import { hyperframesAepSceneSchema } from './scene';

const legacy = {
  version: 1 as const,
  source: 'hyperframes' as const,
  title: 'Legacy flat scene',
  width: 320,
  height: 180,
  fps: 25,
  durationSec: 1,
  scenes: [],
  assets: [],
  fonts: [],
  layers: [{
    id: 'box', name: 'box', sceneId: null, kind: 'shape' as const, inSec: 0, outSec: 1,
    box: { x: 1, y: 2, w: 30, h: 20 }, opacity: 1, rotationDeg: 0, blendMode: 'normal' as const,
    clip: null, filters: null, keys: {}, variable: null,
    shape: { fill: '#ffffff', fillOpacity: 1, radiusPx: 0, stroke: null },
  }],
  audio: [],
  shaderStack: null,
  unmapped: [],
  flattened: [],
};

test('legacy flat scenes remain valid while hierarchy/provenance stay optional', () => {
  expect(hyperframesAepSceneSchema.parse(legacy).layers[0]?.id).toBe('box');
});

test('hierarchy and source provenance validate as additive scene metadata', () => {
  const parsed = hyperframesAepSceneSchema.parse({
    ...legacy,
    sourceRevisionId: 'fixture-revision-1',
    sourceHtmlSha256: 'a'.repeat(64),
    extractedSceneSha256: 'b'.repeat(64),
    targetTemplateAssetId: 'fixture-template-1',
    baseVersionId: 'fixture-version-1',
    hierarchyVersion: 1,
    fullyEditable: true,
    groups: [{ id: 'group-main', parentId: null, x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 }],
    layers: [{ ...legacy.layers[0], parentId: 'group-main' }],
  });
  expect(parsed.layers[0]?.parentId).toBe('group-main');
  expect(parsed.sourceHtmlSha256).toBe('a'.repeat(64));
  expect(parsed.groups?.[0]?.id).toBe('group-main');
});
