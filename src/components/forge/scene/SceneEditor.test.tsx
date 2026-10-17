/**
 * The scene editor end to end against its data layer: the file's fields load into the inspector,
 * an edit settles into ONE draft request carrying only the change and `scope: 'all'` (a newer edit
 * aborts the draft it made stale), and Render final posts, polls the job to completion and shows
 * the finished file with its Library link. An output with a frame range offers Still or Animation;
 * the pick rides on Render final as `overrides.mediaType`.
 */

import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import {
  blendParseSchema,
  type ScenePreview,
  type ScenePreviewRequest,
  type SceneRenderRequest,
  type SceneRenderStatus,
} from '@continuum/contracts';
import parseExample from '../../../../packages/contracts/src/media/__fixtures__/blend-parse.example.json';

const BRAND = '22222222-2222-4222-8222-222222222222';
const ASSET = '55555555-5555-4555-8555-555555555555';
const VERSION = '66666666-6666-4666-8666-666666666666';
const JOB = '77777777-7777-4777-8777-777777777777';
const OUT_ASSET = '88888888-8888-4888-8888-888888888888';
const OUT_VERSION = '99999999-9999-4999-8999-999999999999';

const parse = blendParseSchema.parse(parseExample);
type View = {
  assetId: string;
  versionId: string;
  templateKey: string;
  parseState: string;
  fields: typeof parse.fields;
  outputs: typeof parse.outputs;
  externals: never[];
};
const VIEW: View = {
  assetId: ASSET,
  versionId: VERSION,
  templateKey: `blend:${ASSET}`,
  parseState: 'parsed',
  fields: parse.fields,
  outputs: parse.outputs,
  externals: [],
};

const draft = (n: number): ScenePreview => ({
  url: `https://storage.test/draft-${n}.png`,
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  width: 640,
  height: 360,
  frame: 1,
  cached: false,
});

let view = VIEW;
const previewSignals: AbortSignal[] = [];
let hangFirstPreview = false;
const requestScenePreview = mock(
  async (_assetId: string, body: ScenePreviewRequest, signal?: AbortSignal) => {
    previewSignals.push(signal as AbortSignal);
    if (hangFirstPreview && previewSignals.length === 1) return new Promise<ScenePreview>(() => {});
    return draft(requestScenePreview.mock.calls.length + Object.keys(body.values ?? {}).length);
  },
);
const requestSceneRender = mock(async (_assetId: string, _body: SceneRenderRequest) => ({
  jobId: JOB,
}));
let jobReads = 0;
const fetchSceneRender = mock(async (): Promise<SceneRenderStatus> => {
  jobReads += 1;
  return jobReads === 1
    ? { jobId: JOB, state: 'claimed', error: null, outputs: [] }
    : {
        jobId: JOB,
        state: 'completed',
        error: null,
        outputs: [{ assetId: OUT_ASSET, versionId: OUT_VERSION }],
      };
});
const listSceneRenders = mock(async () => ({ renders: [] }));
const signLibraryAsset = mock(async () => 'https://signed.test/final.png');

// Module stubs are process-wide in Bun: each takes the real exports first and hands them back.
const realScene = { ...(await import('@/lib/library/sceneTemplates')) };
const realSources = { ...(await import('@/lib/library/templateSources')) };
const realElements = { ...(await import('@/lib/ai-studio/elements')) };
mock.module('@/lib/library/sceneTemplates', () => ({
  ...realScene,
  fetchSceneTemplate: async () => view,
  requestScenePreview,
  requestSceneRender,
  fetchSceneRender,
  listSceneRenders,
}));
mock.module('@/lib/library/templateSources', () => ({
  ...realSources,
  fetchTemplateSources: async () => [{ assetId: ASSET, displayName: 'Summer Scene', parse: null }],
}));
mock.module('@/lib/ai-studio/elements', () => ({ ...realElements, signLibraryAsset }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SceneEditor } from './SceneEditor';
import { PREVIEW_DEBOUNCE_MS } from './useScenePreview';

afterEach(() => {
  cleanup();
  view = VIEW;
  previewSignals.length = 0;
  hangFirstPreview = false;
  jobReads = 0;
  for (const fn of [requestScenePreview, requestSceneRender, fetchSceneRender, signLibraryAsset])
    fn.mockClear();
});

afterAll(() => {
  mock.module('@/lib/library/sceneTemplates', () => realScene);
  mock.module('@/lib/library/templateSources', () => realSources);
  mock.module('@/lib/ai-studio/elements', () => realElements);
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SceneEditor brandId={BRAND} assetId={ASSET} />
    </QueryClientProvider>,
  );
}

const settle = () => new Promise((resolve) => setTimeout(resolve, PREVIEW_DEBOUNCE_MS + 150));

describe('SceneEditor', () => {
  test('loads the fields, names the template and draws the file as it is', async () => {
    mount();
    await screen.findByRole('heading', { level: 1, name: 'Summer Scene' });
    expect(screen.getByText('As in the file')).toBeTruthy();
    for (const section of ['Content', 'Objects', 'Camera', 'Lights'])
      expect(screen.getByRole('button', { name: new RegExp(`^${section}`) })).toBeTruthy();
    await waitFor(() => expect(requestScenePreview).toHaveBeenCalledTimes(1));
    expect(requestScenePreview.mock.calls[0]?.[1]).toEqual({
      brandId: BRAND,
      scope: 'all',
      versionId: VERSION,
      outputId: 'Main/CamWide',
      values: {},
    });
    const image = (await screen.findByAltText(/^Draft preview of /)) as HTMLImageElement;
    expect(image.src).toBe('https://storage.test/draft-1.png');
  });

  test('an edit settles into one draft with only the change, aborting the stale one', async () => {
    hangFirstPreview = true;
    mount();
    const box = (await screen.findByRole('textbox', {
      name: 'Title text default',
    })) as HTMLInputElement;
    await waitFor(() => expect(requestScenePreview).toHaveBeenCalledTimes(1));

    for (const typed of ['B', 'Bl', 'Black Friday'])
      fireEvent.change(box, { target: { value: typed } });
    expect(screen.getByText('1 changed')).toBeTruthy();
    await settle();

    await waitFor(() => expect(requestScenePreview).toHaveBeenCalledTimes(2));
    expect(requestScenePreview.mock.calls[1]?.[1]).toEqual({
      brandId: BRAND,
      scope: 'all',
      versionId: VERSION,
      outputId: 'Main/CamWide',
      values: { headline: 'Black Friday' },
    });
    expect(previewSignals[0]?.aborted).toBe(true);
    await screen.findByAltText(/^Draft preview of /);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('As in the file')).toBeTruthy();
    expect(box.value).toBe('Summer Sale');
  });

  test('Render final posts the changes, polls the job and shows the finished file', async () => {
    mount();
    const box = await screen.findByRole('textbox', { name: 'Title text default' });
    fireEvent.change(box, { target: { value: 'Black Friday' } });
    fireEvent.click(screen.getByRole('button', { name: 'Render final' }));

    await waitFor(() => expect(requestSceneRender).toHaveBeenCalledTimes(1));
    const [, body] = requestSceneRender.mock.calls[0] ?? [];
    expect(body).toMatchObject({
      brandId: BRAND,
      versionId: VERSION,
      outputId: 'Main/CamWide',
      values: { headline: 'Black Friday' },
      scope: 'all',
      overrides: { mediaType: 'image' },
    });
    expect(body?.requestId).toMatch(/^[0-9a-f-]{36}$/);

    const panel = await screen.findByRole('region', { name: 'This render' });
    await within(panel).findByText('Rendering');
    const finished = (await within(panel).findByAltText(/^Render of /, undefined, {
      timeout: 5_000,
    })) as HTMLImageElement;
    expect(finished.src).toBe('https://signed.test/final.png');
    expect(fetchSceneRender.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(signLibraryAsset).toHaveBeenCalledWith(BRAND, OUT_ASSET, OUT_VERSION);
    expect(within(panel).getByText('Completed')).toBeTruthy();
    expect(within(panel).getByRole('link', { name: /Open in Library/ })).toBeTruthy();
  });

  test('a one-frame output offers no choice; a range picks its parsed type and sends the pick', async () => {
    mount();
    await screen.findByRole('heading', { level: 1, name: 'Summer Scene' });
    expect(screen.queryByRole('radiogroup', { name: 'Render as' })).toBeNull();

    const motion = screen.getByRole('button', { name: 'Motion · CamWide · 320×180' });
    fireEvent.click(motion);
    const still = await screen.findByRole('radio', { name: 'Still · frame 1' });
    const animation = screen.getByRole('radio', { name: 'Animation · 12 frames' });
    expect(animation.getAttribute('aria-checked')).toBe('true');
    expect(still.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(still);
    await waitFor(() => expect(still.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Render final' }));
    await waitFor(() => expect(requestSceneRender).toHaveBeenCalledTimes(1));
    expect(requestSceneRender.mock.calls[0]?.[1]).toMatchObject({
      outputId: 'Motion/CamWide',
      overrides: { mediaType: 'image' },
    });

    // Another output and back: the pick starts over from the output's own type.
    fireEvent.click(screen.getByRole('button', { name: 'Main · CamWide · 640×360' }));
    fireEvent.click(motion);
    expect(
      (await screen.findByRole('radio', { name: 'Animation · 12 frames' })).getAttribute(
        'aria-checked',
      ),
    ).toBe('true');
  });

  test('a range longer than a render takes defaults to a still and says why', async () => {
    view = {
      ...VIEW,
      outputs: VIEW.outputs.map((output) =>
        output.id === 'Motion/CamWide' ? { ...output, frameStart: 1, frameEnd: 1_000 } : output,
      ),
    };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Motion · CamWide · 320×180' }));
    const still = await screen.findByRole('radio', { name: 'Still · frame 1' });
    const animation = screen.getByRole('radio', { name: 'Animation · 1000 frames' });
    expect(still.getAttribute('aria-checked')).toBe('true');
    expect(animation.hasAttribute('data-disabled')).toBe(true);
    expect(
      screen.getByText("Blender's range is 1000 frames; renders take at most 600"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Render final' }));
    await waitFor(() => expect(requestSceneRender).toHaveBeenCalledTimes(1));
    expect(requestSceneRender.mock.calls[0]?.[1]?.overrides).toEqual({ mediaType: 'image' });
  });
});
