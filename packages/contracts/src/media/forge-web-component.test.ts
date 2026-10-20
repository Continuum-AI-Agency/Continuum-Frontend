import { expect, test } from 'bun:test';
import { classifyZipEntries, webComponentManifestPath } from './asset-formats';
import {
  isWebTemplateKey,
  webComponentPathSchema,
  webComponentProjectSchema,
  webTemplateKey,
} from './forge-web-component';

const project = {
  schemaVersion: 1,
  framework: 'three',
  name: 'Cube',
  entry: 'main.ts',
  files: { 'main.ts': 'export default () => {}' },
  width: 720,
  height: 1280,
  fps: 30,
  durationSec: 2,
};
test('validates component entry, assets and safe package paths', () => {
  expect(webComponentProjectSchema.parse(project).overrides).toEqual([]);
  for (const path of ['../secret', '/absolute', 'x/../y', 'https:evil', 'a\\b', 'a//b'])
    expect(webComponentPathSchema.safeParse(path).success).toBe(false);
  expect(webComponentProjectSchema.safeParse({ ...project, entry: 'missing.ts' }).success).toBe(
    false,
  );
  expect(
    webComponentProjectSchema.safeParse({
      ...project,
      assets: [{ path: 'main.ts', contentType: 'text/plain', base64: '' }],
    }).success,
  ).toBe(false);
});
test('rejects duplicate overrides and nonfinite values', () => {
  const override = { nodeId: 'cube', property: 'x', value: 2 };
  expect(
    webComponentProjectSchema.safeParse({ ...project, overrides: [override, override] }).success,
  ).toBe(false);
  expect(
    webComponentProjectSchema.safeParse({
      ...project,
      overrides: [{ ...override, value: Number.NaN }],
    }).success,
  ).toBe(false);
});
test('a forge-component.json makes a zip a web component, ahead of its index.html', () => {
  expect(classifyZipEntries(['forge-component.json', 'src/scene.ts', 'index.html'])).toBe(
    'web_component',
  );
  expect(classifyZipEntries(['card/forge-component.json', 'card/src/scene.ts'])).toBe(
    'web_component',
  );
  expect(webComponentManifestPath(['card/forge-component.json', 'card/a.ts'])).toBe(
    'card/forge-component.json',
  );
  expect(classifyZipEntries(['forge-component.json', 'comp.aep'])).toBe('ambiguous');
  expect(classifyZipEntries(['a/b/forge-component.json', 'a/b/scene.ts', 'c/x.ts'])).toBe(
    'archive',
  );
});
test('stillSec must fall inside the duration', () => {
  expect(webComponentProjectSchema.safeParse({ ...project, stillSec: 3 }).success).toBe(false);
  expect(webComponentProjectSchema.parse({ ...project, stillSec: 1 }).stillSec).toBe(1);
});
test('web template keys round-trip', () => {
  expect(isWebTemplateKey(webTemplateKey('a1'))).toBe(true);
  expect(isWebTemplateKey('1234')).toBe(false);
});
