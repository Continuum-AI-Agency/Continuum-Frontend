/** Mounted editor + real browser transport against explicit HTTP fixtures; excludes hosted/auth/renderer proof. */
import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import {
  type HyperframesSceneRenderStatus,
  type HyperframesSceneView,
  templateRevisionSchema,
  templateRevisionVariantSchema,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { LayerDraftState } from '@/components/forge/layerDraft';
import { useForgeExitGuard } from '@/components/forge/useForgeExitGuard';

const BRAND = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
const VERSION = '33333333-3333-4333-8333-333333333333';
const ORIGINAL = '44444444-4444-4444-8444-444444444444';
const CHILD = '55555555-5555-4555-8555-555555555555';
const VARIANT = '66666666-6666-4666-8666-666666666666';
const JOB = '77777777-7777-4777-8777-777777777777';
const OTHER_JOB = '88888888-8888-4888-8888-888888888888';
const base: HyperframesSceneView = {
  family: 'hyperframes',
  brandId: BRAND,
  assetId: ASSET,
  sourceVersionId: VERSION,
  revision: {
    templateId: ASSET,
    variantId: ORIGINAL,
    revisionId: ORIGINAL,
    resolvedEditsSha256: 'a'.repeat(64),
  },
  sceneSha256: 'b'.repeat(64),
  viewport: { width: 32, height: 24 },
  clock: { numerator: 30, denominator: 1, frameCount: 3 },
  edits: { schema: 'hyperframes.edits/1', sourceSha256: 'c'.repeat(64), operations: [] },
  capabilities: [
    {
      nodeId: 'copy',
      fieldId: 'copy:text',
      operation: 'text',
      state: 'editable',
      text: {
        value: 'Just use',
        reveal: {
          adapter: 'gsap-prefix/1',
          ticksPerSecond: 10000000,
          checkpoints: [
            { tick: 0, graphemes: 1 },
            { tick: 700000, graphemes: 8 },
          ],
        },
      },
    },
    {
      nodeId: 'script',
      fieldId: 'script:text',
      operation: 'text',
      state: 'runtime-controlled',
      reason: 'Script changes this field',
    },
  ],
  renderer: {
    engine: { implementation: 'hyperframes-native/4+resvg-0.48.1', sha256: 'd'.repeat(64) },
    tools: { encoderSha256: 'e'.repeat(64), probeSha256: 'f'.repeat(64) },
  },
};
const saved = templateRevisionSchema.parse({
  templateId: ASSET,
  variantId: VARIANT,
  id: CHILD,
  number: 1,
  parentRevisionId: ORIGINAL,
  sourceAssetId: ASSET,
  sourceVersionId: VERSION,
  checksum: 'c'.repeat(64),
  edits: {},
  publications: [],
  createdAt: '2026-10-20T00:00:00Z',
  createdBy: null,
  source: {
    assetId: ASSET,
    brandId: BRAND,
    versionId: VERSION,
    family: 'hyperframes',
    parseState: 'parsed',
    createdAt: '2026-10-20T00:00:00Z',
  },
  native: {
    family: 'hyperframes',
    schemaVersion: 'hyperframes.revision/1',
    sceneSha256: '9'.repeat(64),
    entrySha256: base.edits.sourceSha256,
    compiler: 'pinned/1',
    editsSha256: '8'.repeat(64),
    edits: base.edits,
  },
});
const childView: HyperframesSceneView = {
  ...base,
  revision: { ...base.revision, variantId: VARIANT, revisionId: CHILD },
  sceneSha256: saved.native!.sceneSha256,
  capabilities: [{ ...base.capabilities[0]!, text: { value: 'A longer headline' } }],
};
const originalVariant = templateRevisionVariantSchema.parse({
  templateId: ASSET,
  variantId: ORIGINAL,
  name: 'Original',
  original: true,
  parentRevisionId: null,
  draftHeadRevisionId: ORIGINAL,
  publishedHeadRevisionId: null,
  archivedAt: null,
  sourceKind: 'hyperframes',
  revisions: [{ ...saved, id: ORIGINAL, variantId: ORIGINAL, parentRevisionId: null }],
});
const childVariant = templateRevisionVariantSchema.parse({
  ...originalVariant,
  variantId: VARIANT,
  name: 'Native copy',
  original: false,
  parentRevisionId: ORIGINAL,
  draftHeadRevisionId: CHILD,
  revisions: [saved],
});
const apiBefore = process.env.NEXT_PUBLIC_API_URL;
process.env.NEXT_PUBLIC_API_URL = 'https://native-editor.test';
const authBefore = { ...(await import('@/lib/auth/getBrowserAccessToken')) };
mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  ...authBefore,
  getBrowserAccessToken: async () => 'editor-fixture-token',
}));
const { NativeHyperframesEditor } = await import('./NativeHyperframesEditor');
const fetchBefore = globalThis.fetch;
const posts: { path: string; body: Record<string, unknown> }[] = [];
let failSave = true;
let failRender = false;
let acceptedSave = false;
let sceneFailure = false;
let sceneOverride: HyperframesSceneView | undefined;
let draft: LayerDraftState | null = null;
let status: HyperframesSceneRenderStatus;
let queryClient: QueryClient;

beforeEach(() => {
  posts.length = 0;
  failSave = true;
  failRender = false;
  acceptedSave = false;
  sceneFailure = false;
  sceneOverride = undefined;
  draft = null;
  status = {
    family: 'hyperframes',
    brandId: BRAND,
    assetId: ASSET,
    jobId: JOB,
    revision: base.revision,
    state: 'rendering',
    error: null,
    outputs: [],
  };
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input), 'https://native-editor.test');
    const respond = (value: unknown, code = 200) =>
      new Response(JSON.stringify(value), {
        status: code,
        headers: { 'content-type': 'application/json' },
      });
    if (url.pathname === '/api/library/sign') {
      posts.push({ path: url.pathname, body: JSON.parse(String(init?.body)) });
      return respond({ signedUrl: 'https://private-output.test/exact-saved-frame.png' });
    }
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer editor-fixture-token');
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({ path: url.pathname, body });
      if (url.pathname.endsWith('/revisions')) {
        if (failSave) {
          failSave = false;
          return respond(
            { code: 'runtime-controlled-edit', message: 'The source script overwrites this copy.' },
            422,
          );
        }
        acceptedSave = true;
        return respond(saved);
      }
      if (url.pathname.endsWith('/cancel')) {
        status = { ...status, state: 'cancelled' };
        return respond(status);
      }
      if (failRender) {
        failRender = false;
        return respond({ message: 'The request acknowledgement was interrupted.' }, 502);
      }
      return respond(status, 202);
    }
    if (url.pathname.endsWith('/revision-variants'))
      return respond({ items: acceptedSave ? [originalVariant, childVariant] : [originalVariant] });
    if (url.pathname.endsWith('/scene')) {
      if (sceneFailure)
        return respond(
          { code: 'native_source_pending', message: 'Source compilation is pending.' },
          409,
        );
      return respond(
        url.searchParams.get('revisionId') === CHILD ? childView : (sceneOverride ?? base),
      );
    }
    if (url.pathname.endsWith('/renders')) return respond({ family: 'hyperframes', jobs: [] });
    if (url.pathname.endsWith(`/renders/${JOB}`)) return respond(status);
    if (url.pathname.endsWith(`/renders/${OTHER_JOB}`))
      return respond({
        ...status,
        jobId: OTHER_JOB,
        revision: childView.revision,
        state: 'cancelled',
      });
    throw Error(`Unexpected native editor fixture request: ${url.pathname}`);
  }) as typeof globalThis.fetch;
});
afterEach(() => {
  cleanup();
  queryClient?.clear();
  globalThis.fetch = fetchBefore;
});
afterAll(() => {
  mock.module('@/lib/auth/getBrowserAccessToken', () => authBefore);
  if (apiBefore === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = apiBefore;
});
function mount(pins: { initialRevisionId?: string; initialJobId?: string } = {}) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NativeHyperframesEditor
        brandId={BRAND}
        assetId={ASSET}
        {...pins}
        onDraftChange={(next) => {
          draft = next;
        }}
      />
    </QueryClientProvider>,
  );
}

test('native editor loads full copy, keeps refused edits, retries the exact save, and opens the saved branch under its parent', async () => {
  mount();
  const copy = await screen.findByLabelText('Text 1');
  expect((copy as HTMLTextAreaElement).value).toBe('Just use');
  expect(screen.queryByLabelText('Text 2')).toBeNull();
  fireEvent.change(copy, { target: { value: 'A longer headline' } });
  await waitFor(() => expect(draft?.dirty).toBe(true));
  expect(
    (screen.getByRole('button', { name: 'Preview frame' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save variant' }));
  await screen.findByText('Variant was not saved');
  expect((screen.getByLabelText('Text 1') as HTMLTextAreaElement).value).toBe('A longer headline');
  expect(draft?.dirty).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save variant' }));
  await waitFor(() =>
    expect(
      screen.getByRole('link', { name: 'Saved revision link' }).getAttribute('href'),
    ).toContain(CHILD),
  );
  expect(posts.filter((post) => post.path.endsWith('/revisions'))).toHaveLength(2);
  expect(posts[0]!.body).toEqual(posts[1]!.body);
  expect(posts[0]!.body).toMatchObject({
    family: 'hyperframes',
    parentRevisionId: ORIGINAL,
    expectedParentSceneSha256: base.sceneSha256,
    expectedSourceSceneSha256: base.sceneSha256,
    expectedHeadRevisionId: null,
    edits: { operations: [{ op: 'text', fieldId: 'copy:text', value: 'A longer headline' }] },
  });
  expect(posts[0]!.body.variantId).toBeUndefined();
  await screen.findByText('Native copy');
  expect(draft?.dirty).toBe(false);
});

test('native preview retries preserve submission identity, validates the frame, pins the saved scene, and cancels its real job route', async () => {
  failRender = true;
  mount();
  await screen.findByLabelText('Text 1');
  const frame = screen.getByLabelText('Preview frame (0–2)');
  fireEvent.change(frame, { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview frame' }));
  await waitFor(() => expect(frame.getAttribute('aria-invalid')).toBe('true'));
  expect(posts).toHaveLength(0);
  fireEvent.change(frame, { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview frame' }));
  await screen.findByText('Render request failed');
  fireEvent.click(screen.getByRole('button', { name: 'Preview frame' }));
  await screen.findByText('Job: rendering');
  expect(posts[0]!.body).toEqual(posts[1]!.body);
  expect(posts[0]).toMatchObject({
    path: `/api/ai-studio/templates/${ASSET}/scene/previews`,
    body: {
      family: 'hyperframes',
      revisionId: ORIGINAL,
      sceneSha256: base.sceneSha256,
      outputs: [{ file: 'png', frame: 2 }],
    },
  });
  expect(posts[0]!.body.engine).toEqual(base.renderer!.engine);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel render' }));
  await screen.findByText('Job: cancelled');
  expect(posts[2]!.path).toEndWith(`/scene/renders/${JOB}/cancel`);
  expect(screen.getByRole('link', { name: 'Saved job link' }).getAttribute('href')).toContain(
    `jobId=${JOB}`,
  );
});

test('pending native ingestion shows its diagnosis and never mounts an AE editor or submits a render', async () => {
  sceneFailure = true;
  mount();
  await screen.findByText('Source compilation is pending.');
  expect(screen.queryByRole('button', { name: 'Render MP4' })).toBeNull();
  expect(screen.queryByLabelText('Text 1')).toBeNull();
  expect(posts).toHaveLength(0);
});

test('client navigation to another saved revision and job remounts on the full link pin', async () => {
  const mounted = mount({ initialJobId: JOB });
  await screen.findByText('Job: rendering');
  mounted.rerender(
    <QueryClientProvider client={queryClient}>
      <NativeHyperframesEditor
        brandId={BRAND}
        assetId={ASSET}
        initialRevisionId={CHILD}
        initialJobId={OTHER_JOB}
      />
    </QueryClientProvider>,
  );
  await screen.findByText('Job: cancelled');
  expect(screen.getByRole('link', { name: 'Saved revision link' }).getAttribute('href')).toContain(
    CHILD,
  );
  expect(screen.getByRole('link', { name: 'Saved job link' }).getAttribute('href')).toContain(
    `jobId=${OTHER_JOB}`,
  );
  expect((screen.getByLabelText('Text 1') as HTMLTextAreaElement).value).toBe('A longer headline');
  expect(posts).toHaveLength(0);
});

test('completed output displays only its signed Library version and keeps the exact job link', async () => {
  status = {
    ...status,
    state: 'completed',
    outputs: [
      {
        file: 'png',
        assetId: CHILD,
        versionId: VERSION,
        sha256: 'a'.repeat(64),
        bytes: 120,
        mimeType: 'image/png',
      },
    ],
  };
  mount({ initialJobId: JOB });
  const image = await screen.findByRole('img', { name: 'Render of saved Hyperframes revision' });
  expect(image.getAttribute('src')).toBe('https://private-output.test/exact-saved-frame.png');
  expect(posts).toEqual([
    { path: '/api/library/sign', body: { brandId: BRAND, assetId: CHILD, versionId: VERSION } },
  ]);
  expect(screen.getByRole('link', { name: 'Saved job link' }).getAttribute('href')).toContain(
    `jobId=${JOB}`,
  );
  expect(screen.getByRole('link', { name: 'Open in Library' }).getAttribute('href')).toContain(
    CHILD,
  );
});

function GuardedNativeEditor() {
  const guard = useForgeExitGuard();
  const [open, setOpen] = useState(true);
  return (
    <>
      {open ? (
        <NativeHyperframesEditor
          brandId={BRAND}
          assetId={ASSET}
          onDraftChange={guard.onDraftChange}
          onBack={() => guard.runGuarded(() => setOpen(false))}
        />
      ) : (
        <p>Template gallery</p>
      )}
      {guard.dialog}
    </>
  );
}

test('the native editor protects dirty copy through the existing Forge exit guard', async () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GuardedNativeEditor />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText('Text 1'), {
    target: { value: 'Keep this draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Back to templates' }));
  await screen.findByRole('alertdialog');
  expect(screen.queryByText('Template gallery')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
  expect((screen.getByLabelText('Text 1') as HTMLTextAreaElement).value).toBe('Keep this draft');
  fireEvent.click(screen.getByRole('button', { name: 'Back to templates' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Discard', exact: true }));
  await screen.findByText('Template gallery');
  expect(posts).toHaveLength(0);
});

test('text pagination bounds mounted controls and preserves changes across pages in one saved snapshot', async () => {
  sceneOverride = {
    ...base,
    capabilities: Array.from({ length: 21 }, (_, index) => ({
      nodeId: `run-${index}`,
      fieldId: `run-${index}:text`,
      operation: 'text',
      state: 'editable',
      text: { value: `Run ${index}` },
    })),
  };
  mount();
  fireEvent.change(await screen.findByLabelText('Text 1'), { target: { value: 'First edit' } });
  expect(screen.getAllByRole('textbox')).toHaveLength(21);
  fireEvent.click(screen.getByRole('button', { name: 'Next text fields' }));
  const last = screen.getByLabelText('Text 21');
  expect(screen.queryByLabelText('Text 1')).toBeNull();
  fireEvent.change(last, { target: { value: 'Last edit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Previous text fields' }));
  expect((screen.getByLabelText('Text 1') as HTMLTextAreaElement).value).toBe('First edit');
  fireEvent.click(screen.getByRole('button', { name: 'Save variant' }));
  await screen.findByText('Variant was not saved');
  expect(posts[0]!.body.edits).toMatchObject({
    operations: [
      { op: 'text', fieldId: 'run-0:text', value: 'First edit' },
      { op: 'text', fieldId: 'run-20:text', value: 'Last edit' },
    ],
  });
});
