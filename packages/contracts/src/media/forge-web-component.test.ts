import { expect, test } from 'bun:test';
import { webComponentPathSchema, webComponentProjectSchema } from './forge-web-component';

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
