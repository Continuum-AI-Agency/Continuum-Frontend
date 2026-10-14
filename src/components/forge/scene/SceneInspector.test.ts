/**
 * Where a Blender field sits in the inspector: copy and pictures under Content, an object's
 * visibility and transform under Objects, the picked output's camera under Camera, lights under
 * Lights, and another output's camera and anything hidden under Advanced.
 */

import { describe, expect, test } from 'bun:test';
import { type BlendField, blendParseSchema } from '@continuum/contracts';
import parseExample from '../../../../packages/contracts/src/media/__fixtures__/blend-parse.example.json';
import { groupSceneFields, sceneFieldGroup, sceneFieldLabel } from './SceneInspector';

const fields = blendParseSchema.parse(parseExample).fields;
const field = (key: string) => fields.find((candidate) => candidate.key === key) as BlendField;
const transform = (idName: string, path: 'transform.rotation' | 'camera.lens'): BlendField => ({
  key: `${idName.toLowerCase()}.${path}`,
  name: `${idName} · ${path}`,
  kind: path === 'camera.lens' ? 'number' : 'vector3',
  target: { idCode: 'OB', idName, path },
  default: path === 'camera.lens' ? 50 : [0, 0, 0],
  exposed: false,
  origin: 'discovered',
});

describe('sceneFieldGroup', () => {
  const cameras = new Set(['CamWide', 'CamTall']);

  test('content, objects, lights and the picked camera', () => {
    expect(sceneFieldGroup(field('headline'), 'CamWide', cameras)).toBe('content');
    expect(sceneFieldGroup(field('logo.image'), 'CamWide', cameras)).toBe('content');
    expect(sceneFieldGroup(field('brand_colour'), 'CamWide', cameras)).toBe('content');
    expect(sceneFieldGroup(field('hide_badge'), 'CamWide', cameras)).toBe('objects');
    expect(sceneFieldGroup(field('swatch.location'), 'CamWide', cameras)).toBe('objects');
    expect(sceneFieldGroup(field('key.energy'), 'CamWide', cameras)).toBe('lights');
    expect(sceneFieldGroup(field('camwide.ortho_scale'), 'CamWide', cameras)).toBe('camera');
  });

  test("another output's camera is advanced, not an object", () => {
    expect(sceneFieldGroup(field('camwide.ortho_scale'), 'CamTall', cameras)).toBe('advanced');
    expect(sceneFieldGroup(transform('CamTall', 'transform.rotation'), 'CamWide', cameras)).toBe(
      'advanced',
    );
    expect(sceneFieldGroup(transform('CamTall', 'transform.rotation'), 'CamTall', cameras)).toBe(
      'camera',
    );
  });

  test('a hidden field outside objects, cameras and lights is advanced', () => {
    const hiddenColour: BlendField = { ...field('brand_colour'), key: 'x', exposed: false };
    expect(sceneFieldGroup(hiddenColour, 'CamWide', cameras)).toBe('advanced');
  });
});

test('groupSceneFields keeps the inspector order and drops empty groups', () => {
  const groups = groupSceneFields(fields, 'CamWide', new Set(['CamWide']));
  expect(groups.map((entry) => entry.group)).toEqual(['content', 'objects', 'camera', 'lights']);
  expect(groups[1]?.fields.map((entry) => entry.key)).toEqual(['hide_badge', 'swatch.location']);
});

test('sceneFieldLabel reads the name without separators', () => {
  expect(sceneFieldLabel(field('swatch.location'))).toBe('Swatch location');
});
