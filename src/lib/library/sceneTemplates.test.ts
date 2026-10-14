/**
 * The scene template client: each call hits its route with the brand, sends a body the contract
 * accepts, parses the answer through the contract, and reads the Backend's `{ error, detail }`
 * refusals as a code plus the sentence to show.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { blendParseSchema } from '@continuum/contracts';
import parseExample from '../../../packages/contracts/src/media/__fixtures__/blend-parse.example.json';

const API = 'https://api.scene.test';
const BRAND = '22222222-2222-4222-8222-222222222222';
const ASSET = '55555555-5555-4555-8555-555555555555';
const VERSION = '66666666-6666-4666-8666-666666666666';
const JOB = '77777777-7777-4777-8777-777777777777';
const OUTPUT_ASSET = '88888888-8888-4888-8888-888888888888';
const OUTPUT_VERSION = '99999999-9999-4999-8999-999999999999';

const originalApi = process.env.NEXT_PUBLIC_API_URL;
process.env.NEXT_PUBLIC_API_URL = API;
// Captured before the stub: mock.module rewrites the loaded module in place for the whole run.
const { getBrowserAccessToken: actualToken } = await import('@/lib/auth/getBrowserAccessToken');
mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'scene-token',
}));

const scene = await import('./sceneTemplates');
const { ApiError } = await import('@/lib/api/errors');

const parse = blendParseSchema.parse(parseExample);
const VIEW = {
  assetId: ASSET,
  versionId: VERSION,
  templateKey: `blend:${ASSET}`,
  parseState: 'parsed',
  fields: parse.fields,
  outputs: parse.outputs,
  externals: parse.externals,
};

type Sent = { url: string; method: string; body: unknown; auth: string | null };
const sent: Sent[] = [];
const originalFetch = globalThis.fetch;
function answer(payload: unknown, status = 200) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
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
  globalThis.fetch = originalFetch;
  mock.module('@/lib/auth/getBrowserAccessToken', () => ({ getBrowserAccessToken: actualToken }));
  if (originalApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApi;
});

describe('sceneTemplates', () => {
  test('fetchSceneTemplate reads the template through the contract, with the bearer', async () => {
    answer(VIEW);
    const view = await scene.fetchSceneTemplate(BRAND, ASSET);
    expect(sent[0]).toMatchObject({
      url: `${API}/api/ai-studio/templates/${ASSET}/scene?brandId=${BRAND}`,
      method: 'GET',
      auth: 'Bearer scene-token',
    });
    expect(view.fields.map((field) => field.key)).toContain('swatch.location');
    expect(view.outputs[0]?.camera).toBe('CamWide');
  });

  test('fetchSceneTemplate refuses a body that is not a scene template', async () => {
    answer({ ...VIEW, templateKey: '133' });
    await expect(scene.fetchSceneTemplate(BRAND, ASSET)).rejects.toThrow();
  });

  test('requestScenePreview posts the values and scope and parses the draft', async () => {
    answer({
      url: 'https://storage.test/draft.png',
      expiresAt: '2026-10-14T12:10:00Z',
      width: 640,
      height: 360,
      frame: 1,
      cached: true,
    });
    const draft = await scene.requestScenePreview(ASSET, {
      brandId: BRAND,
      versionId: VERSION,
      outputId: 'Main/CamWide',
      values: { headline: 'Hello', 'swatch.location': [0, 0, -2] },
      scope: 'all',
    });
    expect(sent[0]).toMatchObject({
      url: `${API}/api/ai-studio/templates/${ASSET}/scene/previews`,
      method: 'POST',
      body: {
        brandId: BRAND,
        versionId: VERSION,
        outputId: 'Main/CamWide',
        values: { headline: 'Hello', 'swatch.location': [0, 0, -2] },
        scope: 'all',
      },
    });
    expect(draft).toMatchObject({ width: 640, cached: true });
  });

  test('requestScenePreview refuses to send a body the contract rejects', async () => {
    answer({});
    await expect(
      scene.requestScenePreview(ASSET, {
        brandId: 'not-a-uuid',
        versionId: VERSION,
        outputId: 'Main/CamWide',
        values: {},
      }),
    ).rejects.toThrow();
    expect(sent).toHaveLength(0);
  });

  test('requestSceneRender posts and answers the job id', async () => {
    answer({ jobId: JOB }, 202);
    const accepted = await scene.requestSceneRender(ASSET, {
      brandId: BRAND,
      versionId: VERSION,
      outputId: 'Main/CamWide',
      values: { brand_colour: '#FF0000' },
      scope: 'all',
      requestId: JOB,
    });
    expect(accepted).toEqual({ jobId: JOB });
    expect(sent[0]?.url).toBe(`${API}/api/ai-studio/templates/${ASSET}/scene/renders`);
    expect(sent[0]?.body).toMatchObject({ scope: 'all', requestId: JOB });
  });

  test('fetchSceneRender and listSceneRenders read status and history', async () => {
    const status = {
      jobId: JOB,
      state: 'completed',
      error: null,
      outputs: [{ assetId: OUTPUT_ASSET, versionId: OUTPUT_VERSION }],
    };
    answer(status);
    expect(await scene.fetchSceneRender(BRAND, ASSET, JOB)).toEqual(status);
    expect(sent[0]?.url).toBe(
      `${API}/api/ai-studio/templates/${ASSET}/scene/renders/${JOB}?brandId=${BRAND}`,
    );
    answer({
      renders: [{ ...status, outputId: 'Main/CamWide', createdAt: '2026-10-14T12:00:00Z' }],
    });
    const history = await scene.listSceneRenders(BRAND, ASSET);
    expect(history.renders[0]?.outputId).toBe('Main/CamWide');
    expect(sent[1]?.url).toBe(
      `${API}/api/ai-studio/templates/${ASSET}/scene/renders?brandId=${BRAND}`,
    );
  });

  test('a refusal reads as its code and the fixed sentence the Backend wrote', async () => {
    answer({ error: 'scene_preview_busy', detail: 'Another preview is still drawing.' }, 429);
    const error = await scene
      .requestScenePreview(ASSET, {
        brandId: BRAND,
        versionId: VERSION,
        outputId: 'Main/CamWide',
        values: {},
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(scene.sceneProblem(error)).toEqual({
      code: 'scene_preview_busy',
      message: 'Another preview is still drawing.',
    });
  });

  test('sceneProblem falls back to the status line and to plain errors', () => {
    expect(scene.sceneProblem(new ApiError('502 Bad Gateway', 502))).toEqual({
      code: null,
      message: '502 Bad Gateway',
    });
    expect(scene.sceneProblem(new Error('offline'))).toEqual({ code: null, message: 'offline' });
  });

  test('isTerminalSceneRender and sceneErrorSentence', () => {
    expect(
      ['completed', 'failed', 'cancelled', 'superseded'].every(scene.isTerminalSceneRender),
    ).toBe(true);
    expect(scene.isTerminalSceneRender('claimed')).toBe(false);
    expect(scene.sceneErrorSentence('scene_render_failed')).toBe('Scene render failed');
  });
});
