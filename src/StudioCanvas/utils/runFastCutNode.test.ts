import { beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock((_options: unknown): Promise<unknown> => Promise.resolve(undefined));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

import {
  CANVAS_FAST_CUT_ROUTE,
  type CanvasFastCutResponse,
  canvasFastCutResponseSchema,
} from '@continuum/contracts';
import { READ_TIMEOUT_MS, RENDER_TIMEOUT_MS } from '@/lib/api/timeout';
import { runFastCutNode } from './runFastCutNode';

const BRAND = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';

const RESPONSE: CanvasFastCutResponse = {
  assetId: '33333333-3333-4333-8333-333333333333',
  assetVersionId: 'version-1',
  bucket: 'media-library',
  storagePath: 'brand/fast-cut/cut.mp4',
  signedUrl: 'https://storage.test/cut.mp4?token=t',
  masterAssetId: '44444444-4444-4444-8444-444444444444',
  durationSec: 12.8,
  fps: 60,
  cuts: 74,
  bpm: 150,
};

type RequestOptions = {
  path: string;
  method: string;
  body: unknown;
  schema: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const sentOptions = () => requestMock.mock.calls[0]?.[0] as RequestOptions;

describe('runFastCutNode', () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockResolvedValue(RESPONSE);
  });

  it('POSTs the node to the fast-cut route and returns what the server filed', async () => {
    const controller = new AbortController();
    const result = await runFastCutNode(
      { brandProfileId: BRAND, roomId: ROOM, nodeId: 'cut-1' },
      controller.signal,
    );

    expect(result).toEqual(RESPONSE);
    expect(requestMock).toHaveBeenCalledTimes(1);
    const sent = sentOptions();
    expect(sent.path).toBe(CANVAS_FAST_CUT_ROUTE);
    expect(sent.method).toBe('POST');
    expect(sent.body).toEqual({ brandProfileId: BRAND, roomId: ROOM, nodeId: 'cut-1' });
    expect(sent.signal).toBe(controller.signal);
  });

  it('parses the reply with the contracts response schema', async () => {
    await runFastCutNode({ brandProfileId: BRAND, roomId: ROOM, nodeId: 'cut-1' });
    expect(sentOptions().schema).toBe(canvasFastCutResponseSchema);
  });

  it('waits out a render on its own render bound, not the job default', async () => {
    await runFastCutNode({ brandProfileId: BRAND, roomId: ROOM, nodeId: 'cut-1' });
    expect(sentOptions().timeoutMs).toBe(RENDER_TIMEOUT_MS);
    expect(RENDER_TIMEOUT_MS).toBeGreaterThan(120_000);
    expect(RENDER_TIMEOUT_MS).toBeGreaterThan(READ_TIMEOUT_MS);
  });

  it('refuses a request the route would 400 without sending it', async () => {
    await expect(
      runFastCutNode({ brandProfileId: 'not-a-brand', roomId: ROOM, nodeId: 'cut-1' }),
    ).rejects.toThrow();
    await expect(
      runFastCutNode({ brandProfileId: BRAND, roomId: ROOM, nodeId: '' }),
    ).rejects.toThrow();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("surfaces the server's sentence when it refuses the node", async () => {
    requestMock.mockRejectedValue(
      new Error('fastCut "cut-1" has no music bed — wire one Audio node'),
    );
    await expect(
      runFastCutNode({ brandProfileId: BRAND, roomId: ROOM, nodeId: 'cut-1' }),
    ).rejects.toThrow('fastCut "cut-1" has no music bed');
  });
});
