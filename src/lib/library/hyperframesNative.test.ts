import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import type {
  HyperframesSceneRenderRequest,
  HyperframesSceneRenderStatus,
} from '@continuum/contracts';

const API = 'https://api.native.test';
const BRAND = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
const VARIANT = '33333333-3333-4333-8333-333333333333';
const REVISION = '44444444-4444-4444-8444-444444444444';
const VERSION = '55555555-5555-4555-8555-555555555555';
const JOB = '66666666-6666-4666-8666-666666666666';
const nextRevision = '77777777-7777-4777-8777-777777777777';
const apiBefore = process.env.NEXT_PUBLIC_API_URL;
process.env.NEXT_PUBLIC_API_URL = API;
const { getBrowserAccessToken: tokenBefore } = await import('@/lib/auth/getBrowserAccessToken');
mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'native-token',
}));
const native = await import('./hyperframesNative');
const fetchBefore = globalThis.fetch;
const sent: { url: string; method: string; body: unknown; auth: string | null }[] = [];
const revision = {
  templateId: ASSET,
  variantId: VARIANT,
  revisionId: REVISION,
  resolvedEditsSha256: 'a'.repeat(64),
};
const edits = {
  schema: 'hyperframes.edits/1' as const,
  sourceSha256: 'b'.repeat(64),
  operations: [],
};
const view = {
  family: 'hyperframes',
  brandId: BRAND,
  assetId: ASSET,
  sourceVersionId: VERSION,
  revision,
  sceneSha256: 'c'.repeat(64),
  viewport: { width: 32, height: 24 },
  clock: { numerator: 30, denominator: 1, frameCount: 3 },
  edits,
  capabilities: [],
  renderer: null,
};
const intent: HyperframesSceneRenderRequest = {
  family: 'hyperframes',
  brandId: BRAND,
  revisionId: REVISION,
  sceneSha256: view.sceneSha256,
  submissionId: '88888888-8888-4888-8888-888888888888',
  engine: { implementation: 'hyperframes-native/4+resvg-0.48.1', sha256: 'd'.repeat(64) },
  tools: { encoderSha256: 'e'.repeat(64), probeSha256: 'f'.repeat(64) },
  outputs: [{ file: 'png', frame: 2 }],
};
const job: HyperframesSceneRenderStatus = {
  family: 'hyperframes',
  brandId: BRAND,
  assetId: ASSET,
  jobId: JOB,
  revision,
  state: 'ready',
  error: null,
  outputs: [],
};
function answer(payload: unknown, status = 200) {
  globalThis.fetch = (async (input, init) => {
    sent.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: new Headers(init?.headers).get('authorization'),
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
}
beforeEach(() => {
  sent.length = 0;
});
afterAll(() => {
  globalThis.fetch = fetchBefore;
  mock.module('@/lib/auth/getBrowserAccessToken', () => ({ getBrowserAccessToken: tokenBefore }));
  if (apiBefore === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = apiBefore;
});

test('native scene reads keep the selected revision and authenticated family route', async () => {
  answer(view);
  expect(await native.fetchNativeHyperframesScene(BRAND, ASSET, REVISION)).toEqual(view);
  expect(sent[0]).toMatchObject({
    url: `${API}/api/ai-studio/templates/${ASSET}/scene?brandId=${BRAND}&family=hyperframes&revisionId=${REVISION}`,
    auth: 'Bearer native-token',
    method: 'GET',
  });
  answer({ ...view, revision: { ...revision, revisionId: nextRevision } });
  const mismatch = await native.fetchNativeHyperframesScene(BRAND, ASSET, REVISION).then(
    () => null,
    (error) => error,
  );
  expect(mismatch?.message).toContain('identity differs');
});

test('native preview/render transport preserves immutable intent and caller replay identity', async () => {
  answer(job, 202);
  expect(await native.requestNativeHyperframesPreview(ASSET, intent)).toEqual(job);
  expect(sent[0]).toMatchObject({
    url: `${API}/api/ai-studio/templates/${ASSET}/scene/previews`,
    method: 'POST',
    body: intent,
  });
  await native.requestNativeHyperframesRender(ASSET, intent);
  await native.requestNativeHyperframesRender(ASSET, intent);
  expect(
    sent
      .slice(1)
      .every(
        (item) => (item.body as HyperframesSceneRenderRequest).submissionId === intent.submissionId,
      ),
  ).toBe(true);
  expect(sent.every((item) => item.auth === 'Bearer native-token')).toBe(true);
  const before = sent.length;
  const invalid = await native
    .requestNativeHyperframesPreview(ASSET, { ...intent, outputs: [{ file: 'mp4', crf: 18 }] })
    .then(
      () => null,
      (error) => error,
    );
  expect(invalid?.message).toContain('exactly one frame');
  expect(sent.length).toBe(before);
  answer({ ...job, revision: { ...revision, revisionId: nextRevision } }, 202);
  expect(
    (
      await native.requestNativeHyperframesRender(ASSET, intent).then(
        () => null,
        (error) => error,
      )
    )?.message,
  ).toContain('different source revision');
});

test('native failures remain native without another request or fallback', async () => {
  answer({ error: 'native_unsupported', detail: 'This effect is not qualified.' }, 422);
  const error = await native.requestNativeHyperframesRender(ASSET, intent).then(
    () => null,
    (cause) => cause,
  );
  expect(error?.status).toBe(422);
  expect(sent).toHaveLength(1);
  expect(sent[0]!.url).toEndWith(`/templates/${ASSET}/scene/renders`);
});

test('native history, polling and cancellation reject unrelated jobs and private fields', async () => {
  answer({ family: 'hyperframes', jobs: [job] });
  expect((await native.listNativeHyperframesRenders(BRAND, ASSET)).jobs).toEqual([job]);
  answer(job);
  expect(await native.fetchNativeHyperframesRender(BRAND, ASSET, JOB)).toEqual(job);
  answer({ ...job, state: 'cancelled' });
  expect((await native.cancelNativeHyperframesRender(BRAND, ASSET, JOB)).state).toBe('cancelled');
  expect(sent.at(-1)).toMatchObject({ method: 'POST', body: { brandId: BRAND } });
  answer({ family: 'hyperframes', jobs: [{ ...job, assetId: VERSION }] });
  expect(
    (
      await native.listNativeHyperframesRenders(BRAND, ASSET).then(
        () => null,
        (error) => error,
      )
    )?.message,
  ).toContain('another template');
  answer({ ...job, execution_spec: { private: true } });
  expect(
    await native.fetchNativeHyperframesRender(BRAND, ASSET, JOB).then(
      () => false,
      () => true,
    ),
  ).toBe(true);
});

test('native saves preserve parent pins and idempotency, and refuse an AE revision response', async () => {
  const { templateRevisionSchema } = await import('@continuum/contracts');
  const saved = templateRevisionSchema.parse({
    templateId: ASSET,
    variantId: VARIANT,
    id: nextRevision,
    number: 2,
    parentRevisionId: REVISION,
    sourceAssetId: ASSET,
    sourceVersionId: VERSION,
    checksum: 'b'.repeat(64),
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
      sceneSha256: 'd'.repeat(64),
      entrySha256: edits.sourceSha256,
      compiler: 'pinned/1',
      editsSha256: 'e'.repeat(64),
      edits,
    },
  });
  const body = {
    family: 'hyperframes' as const,
    brandId: BRAND,
    parentRevisionId: REVISION,
    expectedParentSceneSha256: view.sceneSha256,
    expectedSourceSceneSha256: view.sceneSha256,
    expectedHeadRevisionId: null,
    name: 'Native branch',
    idempotencyKey: 'stable-save-request',
    edits,
  };
  answer(saved);
  expect(await native.saveNativeHyperframesRevision(ASSET, body)).toEqual(saved);
  await native.saveNativeHyperframesRevision(ASSET, body);
  expect(sent.map((item) => item.body)).toEqual([body, body]);
  expect(sent[0]!.url).toEndWith(`/templates/${ASSET}/revisions`);
  const { native: _native, ...ae } = saved;
  answer(ae);
  expect(
    (
      await native.saveNativeHyperframesRevision(ASSET, body).then(
        () => null,
        (error) => error,
      )
    )?.message,
  ).toContain('Expected a saved native');
  const variant = {
    templateId: ASSET,
    variantId: VARIANT,
    name: 'Native branch',
    original: false,
    parentRevisionId: REVISION,
    draftHeadRevisionId: nextRevision,
    publishedHeadRevisionId: null,
    archivedAt: null,
    tags: [],
    sourceKind: 'hyperframes',
    revisions: [saved],
  };
  answer({ items: [variant] });
  expect(await native.fetchNativeHyperframesVariants(BRAND, ASSET)).toEqual([variant]);
  answer({ items: [{ ...variant, revisions: [ae] }] });
  expect(
    (await native.fetchNativeHyperframesVariants(BRAND, ASSET).catch((error) => error)).message,
  ).toContain('Expected native revisions');
});
