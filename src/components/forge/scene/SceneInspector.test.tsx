/**
 * Where a Blender field sits in the inspector: copy and pictures under Content, an object's
 * visibility and transform under Objects, the picked output's camera under Camera, lights under
 * Lights, and another output's camera and anything hidden under Advanced. A real scene carries
 * thousands of transform fields, so Objects starts closed, each object opens on its own, and a
 * search lists matching fields flat, capped.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { type BlendField, blendParseSchema } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import parseExample from '../../../../packages/contracts/src/media/__fixtures__/blend-parse.example.json';
import {
  groupSceneFields,
  SceneInspector,
  SEARCH_LIMIT,
  sceneFieldGroup,
  sceneFieldLabel,
  searchSceneFields,
} from './SceneInspector';

afterEach(cleanup);

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

/** A big scene: every object offers location, rotation, scale and a render switch. */
function objectSheet(objects: number): BlendField[] {
  return Array.from({ length: objects }, (_, n): BlendField[] => {
    const idName = `Obj ${n}`;
    const transforms = (['location', 'rotation', 'scale'] as const).map(
      (part): BlendField => ({
        key: `obj_${n}.${part}`,
        name: `${idName} · ${part}`,
        kind: 'vector3',
        target: { idCode: 'OB', idName, path: `transform.${part}` },
        default: [0, 0, 0],
        exposed: false,
        origin: 'discovered',
      }),
    );
    return [
      ...transforms,
      {
        key: `obj_${n}.hide`,
        name: `${idName} · hide in render`,
        kind: 'boolean',
        target: { idCode: 'OB', idName, path: 'hide_render' },
        default: false,
        exposed: false,
        origin: 'discovered',
      },
    ];
  }).flat();
}

function mount(sheet: readonly BlendField[]) {
  const noop = () => {};
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SceneInspector
        brandId="22222222-2222-4222-8222-222222222222"
        fields={sheet}
        camera="CamWide"
        cameras={new Set(['CamWide'])}
        changes={{}}
        selectedKey={null}
        onSelect={noop}
        onChange={noop}
        onReset={noop}
      />
    </QueryClientProvider>,
  );
}

const search = (query: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: 'Search fields' }), {
    target: { value: query },
  });

describe('SceneInspector', () => {
  test('Objects starts closed and opening one object mounts only its rows', () => {
    const { container } = mount(fields);
    expect(screen.getByRole('textbox', { name: 'Title text default' })).toBeTruthy();
    expect(screen.queryByLabelText('Swatch location X')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Objects/ }));
    const objects = screen.getByRole('region', { name: 'Objects' });
    expect(within(objects).getByRole('button', { name: 'Badge' })).toBeTruthy();
    expect(objects.querySelectorAll('[data-field]')).toHaveLength(0);

    fireEvent.click(within(objects).getByRole('button', { name: 'Swatch' }));
    expect(screen.getByLabelText('Swatch location X')).toBeTruthy();
    expect(
      [...objects.querySelectorAll('[data-field]')].map((row) => row.getAttribute('data-field')),
    ).toEqual(['swatch.location']);
    expect(container.querySelector('[data-field="hide_badge"]')).toBeNull();
  });

  test('a search lists matching fields flat, by name or object, and says when none match', async () => {
    mount(fields);
    search('swatch location');
    const results = await screen.findByRole('region', { name: 'Matching fields' });
    expect(within(results).getByLabelText('Swatch location X')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Objects/ })).toBeNull();

    search('BADGE');
    await within(results).findByText('Badge · hide in render');
    expect(results.querySelectorAll('[data-field]')).toHaveLength(1);

    search('nothing like this');
    await screen.findByText('No field matches “nothing like this”.');

    search('');
    await screen.findByRole('button', { name: /^Objects/ });
  });

  test('searchSceneFields matches the name, the spoken label and the object, ignoring case', () => {
    const keys = (query: string) => searchSceneFields(fields, query).map((entry) => entry.key);
    expect(keys('swatch · loc')).toEqual(['swatch.location']);
    expect(keys('Swatch location')).toEqual(['swatch.location']);
    expect(keys('title')).toEqual(['headline']);
    expect(keys('  ')).toEqual([]);
  });

  test('a big scene mounts small, and a broad search is capped', async () => {
    const sheet = [...fields, ...objectSheet(1_250)];
    const { container } = mount(sheet);
    // Before the fix this sheet mounted every row: ~41 nodes per vector, ~180k in all.
    expect(container.querySelectorAll('*').length).toBeLessThan(1_000);

    fireEvent.click(screen.getByRole('button', { name: /^Objects/ }));
    // Opening Objects mounts one closed toggle per object, not its rows.
    expect(container.querySelectorAll('[data-field]').length).toBeLessThan(10);
    expect(container.querySelectorAll('*').length).toBeLessThan(1_251 * 10);

    search('location');
    const results = await screen.findByRole('region', { name: 'Matching fields' });
    expect(results.querySelectorAll('[data-field]')).toHaveLength(SEARCH_LIMIT);
    expect(
      within(results).getByText(`${1_251 - SEARCH_LIMIT} more — refine the search`),
    ).toBeTruthy();
  });
});
