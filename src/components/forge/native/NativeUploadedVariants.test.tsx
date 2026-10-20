/** Mounted upload lifecycle + real authenticated metadata transport. Storage,
 * SQL publication and worker leases are exercised by their separate benches. */
import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import {
  type HyperframesSceneView,
  type NativeTemplateUploadHistory,
  templateRevisionSchema,
  templateRevisionVariantSchema,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const uuid = () => crypto.randomUUID();
const BRAND = uuid(),
  ROOT = uuid(),
  ORIGINAL = uuid(),
  VERSION = uuid(),
  JOB = uuid();
const CHILD_ASSET = uuid(),
  CHILD_VERSION = uuid(),
  CHILD_REVISION = uuid();
const view: HyperframesSceneView = {
  family: 'hyperframes',
  brandId: BRAND,
  assetId: ROOT,
  sourceVersionId: VERSION,
  sourceSceneSha256: 'a'.repeat(64),
  sceneSha256: 'b'.repeat(64),
  revision: {
    templateId: ROOT,
    variantId: ORIGINAL,
    revisionId: ORIGINAL,
    resolvedEditsSha256: 'c'.repeat(64),
  },
  viewport: { width: 32, height: 24 },
  clock: { numerator: 30, denominator: 1, frameCount: 3 },
  edits: { schema: 'hyperframes.edits/1', sourceSha256: 'd'.repeat(64), operations: [] },
  capabilities: [],
  renderer: null,
};
const parent = templateRevisionSchema.parse({
  templateId: ROOT,
  variantId: ORIGINAL,
  id: ORIGINAL,
  number: 1,
  parentRevisionId: null,
  sourceAssetId: ROOT,
  sourceVersionId: VERSION,
  checksum: 'e'.repeat(64),
  edits: {},
  publications: [],
  createdAt: '2026-10-20T00:00:00Z',
  createdBy: null,
  source: {
    assetId: ROOT,
    brandId: BRAND,
    versionId: VERSION,
    family: 'hyperframes',
    parseState: 'parsed',
    createdAt: '2026-10-20T00:00:00Z',
  },
  native: {
    family: 'hyperframes',
    schemaVersion: 'hyperframes.revision/1',
    sceneSha256: view.sceneSha256,
    entrySha256: view.edits.sourceSha256,
    compiler: 'fixture/1',
    editsSha256: 'f'.repeat(64),
    edits: view.edits,
  },
});
const variant = templateRevisionVariantSchema.parse({
  templateId: ROOT,
  variantId: ORIGINAL,
  name: 'Original',
  original: true,
  parentRevisionId: null,
  draftHeadRevisionId: ORIGINAL,
  publishedHeadRevisionId: null,
  archivedAt: null,
  sourceKind: 'hyperframes',
  revisions: [parent],
});
const intent = {
  schemaVersion: 'hyperframes.upload-variant/1' as const,
  templateId: ROOT,
  variantId: ORIGINAL,
  parentRevisionId: ORIGINAL,
  sourceAssetId: ROOT,
  sourceVersionId: VERSION,
  sourceSha256: parent.checksum,
  sceneSha256: view.sceneSha256,
  name: 'Fresh source',
};
const pending = {
  family: 'hyperframes' as const,
  brandId: BRAND,
  templateId: ROOT,
  jobId: JOB,
  uploadedAssetId: CHILD_ASSET,
  uploadedVersionId: CHILD_VERSION,
  intent,
  createdAt: '2026-10-20T00:00:00Z',
  parseState: 'pending' as const,
  revisionId: null,
  ingest: {
    state: 'pending' as const,
    error: null,
    parseDurationMs: null,
    compileDurationMs: null,
    sceneSha256: null,
  },
};
const uploadBefore = { ...(await import('@/lib/library/uploadMediaAsset')) };
let upload: typeof uploadBefore.uploadMediaAsset;
mock.module('@/lib/library/uploadMediaAsset', () => ({
  ...uploadBefore,
  uploadMediaAsset: (...args: Parameters<typeof uploadBefore.uploadMediaAsset>) => upload(...args),
}));
const authBefore = { ...(await import('@/lib/auth/getBrowserAccessToken')) };
mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  ...authBefore,
  getBrowserAccessToken: async () => 'fixture-token',
}));
const { NativeUploadedVariants } = await import('./NativeUploadedVariants');
const apiBefore = process.env.NEXT_PUBLIC_API_URL;
const fetchBefore = globalThis.fetch;
let history: NativeTemplateUploadHistory;
let focused: NativeTemplateUploadHistory;
let client: QueryClient;
const saved: string[] = [],
  busy: boolean[] = [];
beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'https://native-upload-ui.test';
  saved.length = 0;
  busy.length = 0;
  history = {
    family: 'hyperframes',
    brandId: BRAND,
    templateId: ROOT,
    enabled: true,
    items: [],
    nextCursor: null,
  };
  focused = { ...history, items: [pending] };
  upload = async () => {
    throw Error('Unexpected fixture upload');
  };
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-token');
    expect(url.searchParams.get('brandId')).toBe(BRAND);
    if (url.pathname.endsWith('/scene/uploads')) return Response.json(history);
    if (url.pathname.endsWith(`/scene/uploads/${JOB}`)) return Response.json(focused);
    throw Error(`Unexpected upload metadata request: ${url.pathname}`);
  }) as typeof fetch;
});
afterEach(() => {
  cleanup();
  client.clear();
  globalThis.fetch = fetchBefore;
});
afterAll(() => {
  mock.module('@/lib/library/uploadMediaAsset', () => uploadBefore);
  mock.module('@/lib/auth/getBrowserAccessToken', () => authBefore);
  if (apiBefore === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = apiBefore;
});
function mount(extra: Partial<Parameters<typeof NativeUploadedVariants>[0]> = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NativeUploadedVariants
        view={view}
        variant={variant}
        parent={parent}
        dirty={false}
        saving={false}
        onSaved={(id) => saved.push(id)}
        onBusyChange={(value) => busy.push(value)}
        {...extra}
      />
    </QueryClientProvider>,
  );
}
async function choose() {
  const input = await screen.findByLabelText('Upload native variant');
  await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('Uploaded native variant name'), {
    target: { value: 'Fresh source' },
  });
  await act(async () => {
    fireEvent.change(input, {
      target: { files: [new File(['<html></html>'], 'source.html', { type: 'text/html' })] },
    });
  });
}
test('a registered upload freezes its real parent, shows failures, and never invents a saved variant', async () => {
  let body: Parameters<typeof upload>[0] | undefined;
  upload = async (input) => {
    body = input;
    history = { ...history, items: [pending] };
    return {
      assetId: CHILD_ASSET,
      versionId: CHILD_VERSION,
      ingestJobId: JOB,
      storagePath: 'private/source.html',
      signedUrl: 'https://private.test/source.html',
      thumbnailPath: null,
      previewState: 'unsupported',
    };
  };
  mount();
  await choose();
  await screen.findByText('Fresh source · Parsing pending');
  expect(body?.nativeVariant).toEqual(intent);
  expect(body?.brandId).toBe(BRAND);
  expect(busy).toEqual([true, false]);
  expect(saved).toEqual([]);
  expect(screen.queryByRole('link', { name: 'Open saved variant' })).toBeNull();
  focused = {
    ...focused,
    items: [
      {
        ...pending,
        parseState: 'failed',
        ingest: {
          ...pending.ingest,
          state: 'failed',
          error: 'The uploaded source has a missing dependency.',
        },
      },
    ],
  };
  await act(async () => {
    await client.invalidateQueries();
  });
  await screen.findByText('The uploaded source has a missing dependency.');
  expect(saved).toEqual([]);
  expect(screen.getByRole('link', { name: 'Upload job' }).getAttribute('href')).toContain(
    `uploadJobId=${JOB}`,
  );
});
test('lost upload acknowledgement refreshes durable history and preserves the retry diagnosis', async () => {
  upload = async () => {
    history = { ...history, items: [pending] };
    throw Error('Upload acknowledgement was interrupted.');
  };
  mount();
  await choose();
  await screen.findByText(/Upload acknowledgement was interrupted/);
  await screen.findByText('Fresh source · Parsing pending');
  expect(saved).toEqual([]);
  expect(busy).toEqual([true, false]);
});
test('only a matching compiled child selects its real saved revision', async () => {
  upload = async () => ({
    assetId: CHILD_ASSET,
    versionId: CHILD_VERSION,
    ingestJobId: JOB,
    storagePath: 'private/source.html',
    signedUrl: 'https://private.test/source.html',
    thumbnailPath: null,
    previewState: 'unsupported',
  });
  mount();
  await choose();
  await screen.findByText('Fresh source · Parsing pending');
  const compiled = {
    ...pending,
    parseState: 'parsed' as const,
    revisionId: CHILD_REVISION,
    ingest: { ...pending.ingest, state: 'compiled' as const, sceneSha256: '9'.repeat(64) },
  };
  focused = { ...focused, items: [{ ...compiled, uploadedVersionId: uuid() }] };
  await act(async () => {
    await client.invalidateQueries();
  });
  await screen.findByRole('link', { name: 'Open saved variant' });
  expect(saved).toEqual([]);
  focused = { ...focused, items: [compiled] };
  await act(async () => {
    await client.invalidateQueries();
  });
  await waitFor(() => expect(saved).toEqual([CHILD_REVISION]));
});
test('dirty or superseded revisions cannot upload, while a durable job link still reads status', async () => {
  mount({ view: { ...view, sourceSceneSha256: null }, dirty: true, initialJobId: JOB });
  await screen.findByText('Fresh source · Parsing pending');
  expect((screen.getByLabelText('Upload native variant') as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole('link', { name: 'Open saved variant' })).toBeNull();
});
