/**
 * A Blender template's sheet: it names the template (renamable, removable) and links to the
 * Library and the editor, shows the picked output's last final render — or, before there is one,
 * a draft at the file's own values (no changes, `scope: 'all'`) —
 * summarises the fields by inspector group, lists recent renders with their files, and waits on
 * the parse instead of asking for a scene the forge has not read yet.
 */

import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import {
  blendParseSchema,
  type ScenePreviewRequest,
  type TemplateSourceSummary,
  templateSourceSummarySchema,
} from '@continuum/contracts';
import parseExample from '../../../packages/contracts/src/media/__fixtures__/blend-parse.example.json';

const BRAND = '22222222-2222-4222-8222-222222222222';
const ASSET = '55555555-5555-4555-8555-555555555555';
const VERSION = '66666666-6666-4666-8666-666666666666';
const DONE = '77777777-7777-4777-8777-777777777777';
const FAILED = '77777777-7777-4777-8777-777777777778';
const OUT_ASSET = '88888888-8888-4888-8888-888888888888';
const OUT_VERSION = '99999999-9999-4999-8999-999999999999';

const parse = blendParseSchema.parse(parseExample);
const VIEW = {
  assetId: ASSET,
  versionId: VERSION,
  templateKey: `blend:${ASSET}`,
  parseState: 'parsed',
  fields: parse.fields,
  outputs: parse.outputs,
  externals: [],
};
const HOUSE_BRAND = '33333333-3333-4333-8333-333333333333';
const source = (parseState: string, house = false): TemplateSourceSummary =>
  templateSourceSummarySchema.parse({
    assetId: ASSET,
    brandId: house ? HOUSE_BRAND : BRAND,
    versionId: VERSION,
    family: 'blender',
    parseState,
    displayName: 'Summer Scene',
    createdAt: '2026-10-14T00:00:00Z',
    house,
  });

const fetchSceneTemplate = mock(async () => VIEW);
const requestScenePreview = mock(async (_assetId: string, _body: ScenePreviewRequest) => ({
  url: 'https://storage.test/defaults.png',
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  width: 640,
  height: 360,
  frame: 1,
  cached: true,
}));
const listSceneRenders = mock(async () => ({
  renders: [
    {
      jobId: DONE,
      state: 'completed',
      error: null,
      outputs: [{ assetId: OUT_ASSET, versionId: OUT_VERSION }],
      outputId: 'Main/CamWide',
      createdAt: new Date().toISOString(),
    },
    {
      jobId: FAILED,
      state: 'failed',
      error: 'scene_render_failed',
      outputs: [],
      outputId: 'Main/CamWide',
      createdAt: new Date().toISOString(),
    },
  ],
}));
const signLibraryAsset = mock(async () => 'https://signed.test/render.png');

// Process-wide stubs: take the real exports first and hand them back after.
const realScene = { ...(await import('@/lib/library/sceneTemplates')) };
const realElements = { ...(await import('@/lib/ai-studio/elements')) };
mock.module('@/lib/library/sceneTemplates', () => ({
  ...realScene,
  fetchSceneTemplate,
  requestScenePreview,
  listSceneRenders,
}));
mock.module('@/lib/ai-studio/elements', () => ({ ...realElements, signLibraryAsset }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SceneTemplateDetail } from './SceneTemplateDetail';

afterEach(() => {
  cleanup();
  for (const fn of [fetchSceneTemplate, requestScenePreview, listSceneRenders, signLibraryAsset])
    fn.mockClear();
});

afterAll(() => {
  mock.module('@/lib/library/sceneTemplates', () => realScene);
  mock.module('@/lib/ai-studio/elements', () => realElements);
});

function mount(
  parseState = 'parsed',
  handlers: { onBack?: () => void; onRename?: (title: string) => void; onRemove?: () => void } = {},
  house = false,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SceneTemplateDetail
        brandId={BRAND}
        source={source(parseState, house)}
        onBack={handlers.onBack ?? (() => {})}
        onRename={handlers.onRename ?? (() => {})}
        onRemove={handlers.onRemove ?? (() => {})}
      />
    </QueryClientProvider>,
  );
}

describe('SceneTemplateDetail', () => {
  test('header: name, Back, the Library and the editor', async () => {
    const onBack = mock(() => {});
    mount('parsed', { onBack });
    expect(screen.getByRole('heading', { level: 2, name: 'Summer Scene' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open in Library/ })).toBeTruthy();
    const editor = await screen.findByRole('link', { name: 'Open editor' });
    expect(editor.getAttribute('href')).toBe(`/forge/scene/${ASSET}`);
    await screen.findByText(/7 fields · 2 outputs/);
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('renames through the title and removes through the workbench', async () => {
    const onRename = mock((_title: string) => {});
    const onRemove = mock(() => {});
    mount('parsed', { onRename, onRemove });
    fireEvent.click(screen.getByRole('button', { name: 'Rename Summer Scene' }));
    const input = screen.getByRole('textbox', { name: 'Rename Summer Scene' });
    fireEvent.change(input, { target: { value: 'Winter Scene' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename.mock.calls).toEqual([['Winter Scene']]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('a house scene is labelled, and offers neither rename nor remove', async () => {
    mount('parsed', {}, true);
    expect(screen.getByText('House scene')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Summer Scene' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rename Summer Scene' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    // Still renders from the brand looking at it: the editor opens and the scene reads.
    expect(await screen.findByRole('link', { name: 'Open editor' })).toBeTruthy();
  });

  test("shows the picked output's last final render and asks for no draft", async () => {
    mount();
    const stage = await screen.findByRole('group', { name: 'Scene preview' });
    const finished = (await within(stage).findByAltText(
      'Render of Main · CamWide · 640×360',
    )) as HTMLImageElement;
    expect(finished.src).toBe('https://signed.test/render.png');
    expect(within(stage).getByText(/^Rendered · /)).toBeTruthy();
    const chips = within(screen.getByRole('group', { name: 'Format' })).getAllByRole('button');
    expect(chips).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(requestScenePreview).not.toHaveBeenCalled();
  });

  test('an output with no final render draws a draft at the file values', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Motion · CamWide · 320×180' }));
    const image = (await screen.findByAltText(/^Draft preview of /, undefined, {
      timeout: 3_000,
    })) as HTMLImageElement;
    expect(image.src).toBe('https://storage.test/defaults.png');
    expect(requestScenePreview.mock.calls.map((call) => call[1])).toEqual([
      { brandId: BRAND, scope: 'all', versionId: VERSION, outputId: 'Motion/CamWide', values: {} },
    ]);
    expect(screen.getByText('Draft · 640×360 · cached')).toBeTruthy();
  });

  test('summarises the fields by group', async () => {
    mount();
    const fields = await screen.findByRole('region', { name: 'Fields' });
    for (const line of ['Content · 3', 'Objects · 2', 'Camera · 1', 'Lights · 1'])
      expect(within(fields).getByText(line)).toBeTruthy();
  });

  test('lists recent renders with their files and readable failures', async () => {
    mount();
    const recent = await screen.findByRole('region', { name: 'Recent renders' });
    const finished = (await within(recent).findByAltText(/^Render of /)) as HTMLImageElement;
    expect(finished.src).toBe('https://signed.test/render.png');
    expect(signLibraryAsset).toHaveBeenCalledWith(BRAND, OUT_ASSET, OUT_VERSION);
    expect(within(recent).getByText('Completed')).toBeTruthy();
    expect(within(recent).getByText('Failed')).toBeTruthy();
    expect(within(recent).getByText('Scene render failed')).toBeTruthy();
  });

  test('a .blend still being read asks for no scene', async () => {
    mount('pending');
    expect(screen.getByText('Reading the .blend…')).toBeTruthy();
    await waitFor(() => expect(fetchSceneTemplate).not.toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Open editor' })).toBeNull();
  });
});
