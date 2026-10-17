// A Fast Cut run is the server's: the browser saves the room, posts the node, and files what
// came back. These pin the order (save BEFORE the route reads the room), the readiness
// refusals the server would otherwise answer a minute later, and the filed keys.

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const calls: string[] = [];
const requestMock = mock((_options: unknown): Promise<unknown> => Promise.resolve(undefined));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

import {
  CANVAS_FAST_CUT_ROUTE,
  type CanvasFastCutResponse,
  createNodeData,
  FAST_CUT_AUDIO_INPUT_HANDLE,
  FAST_CUT_MEDIA_INPUT_HANDLE,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { executeWorkflow } from './executeWorkflow';

const BRAND = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';

const RESPONSE: CanvasFastCutResponse = {
  assetId: '33333333-3333-4333-8333-333333333333',
  assetVersionId: 'version-1',
  bucket: 'media-library',
  storagePath: 'brand/fast-cut/cut.mp4',
  signedUrl: 'https://storage.test/cut.mp4?token=t',
  masterAssetId: '44444444-4444-4444-8444-444444444444',
  durationSec: 6.4,
  fps: 60,
  cuts: 27,
  bpm: 128,
};

const at = { x: 0, y: 0 };
const fastCut = (): StudioNode => ({
  id: 'cut',
  position: at,
  type: 'fastCut',
  data: createNodeData('fastCut').data,
});
const clip = (): StudioNode => ({
  id: 'clip',
  position: at,
  type: 'video',
  data: { video: 'data:video/mp4;base64,AAAA' },
});
const still = (data: Record<string, unknown> = { image: 'data:image/png;base64,AAAA' }) =>
  ({ id: 'still', position: at, type: 'image', data }) as StudioNode;
const bed = (): StudioNode => ({
  id: 'bed',
  position: at,
  type: 'audio',
  data: { audio: 'data:audio/mpeg;base64,AAAA' },
});
const wire = (source: string, targetHandle: string): Edge => ({
  id: `${source}->cut`,
  source,
  target: 'cut',
  sourceHandle: source === 'bed' ? 'audio' : source === 'clip' ? 'video' : 'image',
  targetHandle,
});
const POOL = [
  wire('clip', FAST_CUT_MEDIA_INPUT_HANDLE),
  wire('still', FAST_CUT_MEDIA_INPUT_HANDLE),
];
const BED = wire('bed', FAST_CUT_AUDIO_INPUT_HANDLE);

const run = async (nodes: StudioNode[], edges: Edge[], { inRoom = true } = {}) => {
  useStudioStore.setState({ nodes, edges, brandId: BRAND, activeRoomId: inRoom ? ROOM : undefined });
  const show = mock((_toast: unknown) => {});
  const flushSave = mock(async () => {
    calls.push('flushSave');
  });
  const controls = {
    executeGeneration: mock(async () => ({ success: false })),
    executeVideoExtension: mock(async () => ({ success: false })),
    executeEnrichment: mock(async () => ({ success: false })),
    registerController: () => new AbortController(),
    releaseController: () => {},
    cancel: () => {},
    reset: () => {},
    show,
    flushSave,
  };
  await executeWorkflow(controls as never, { targetNodeId: 'cut', brandId: BRAND });
  return {
    show,
    flushSave,
    data: useStudioStore.getState().nodes.find((node) => node.id === 'cut')?.data as Record<
      string,
      unknown
    >,
  };
};

describe('executeWorkflow — fastCut', () => {
  beforeEach(() => {
    calls.length = 0;
    requestMock.mockReset();
    requestMock.mockImplementation(async () => {
      calls.push('request');
      return RESPONSE;
    });
  });

  it('saves the room, then asks the server to cut the node, then files the montage', async () => {
    const { data } = await run([fastCut(), clip(), still(), bed()], [...POOL, BED]);

    expect(calls).toEqual(['flushSave', 'request']);
    const sent = requestMock.mock.calls[0]?.[0] as { path: string; body: unknown };
    expect(sent.path).toBe(CANVAS_FAST_CUT_ROUTE);
    expect(sent.body).toEqual({ brandProfileId: BRAND, roomId: ROOM, nodeId: 'cut' });

    expect(data).toMatchObject({
      generatedVideo: RESPONSE.signedUrl,
      generatedVideoUrl: RESPONSE.signedUrl,
      generatedVideoStoragePath: RESPONSE.storagePath,
      generatedVideoBucket: RESPONSE.bucket,
      renderOutputAssetId: RESPONSE.assetId,
      renderOutputAssetVersionId: RESPONSE.assetVersionId,
      assetId: RESPONSE.assetId,
      assetVersionId: RESPONSE.assetVersionId,
      masterAssetId: RESPONSE.masterAssetId,
      durationSec: 6.4,
      fastCutFps: 60,
      fastCutCuts: 27,
      fastCutBpm: 128,
      isExecuting: false,
      isComplete: true,
    });
    expect(data.error).toBeUndefined();
    // The node's own settings survive the filing.
    expect(data.pacing).toBe('build');
  });

  it('refuses a node with no music bed before any round trip', async () => {
    const { data, show } = await run([fastCut(), clip(), still(), bed()], POOL);

    expect(requestMock).not.toHaveBeenCalled();
    expect(String(data.error)).toContain('music bed');
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('refuses a node with an empty footage pool', async () => {
    const { data } = await run([fastCut(), bed()], [BED]);

    expect(requestMock).not.toHaveBeenCalled();
    expect(String(data.error)).toContain('footage pool');
  });

  it('refuses a pool source with nothing readable in it, naming the media-in port', async () => {
    const { data } = await run([fastCut(), clip(), still({}), bed()], [...POOL, BED]);

    expect(requestMock).not.toHaveBeenCalled();
    expect(String(data.error)).toContain(`"${FAST_CUT_MEDIA_INPUT_HANDLE}"`);
  });

  it("fails the node with the server's sentence when it refuses", async () => {
    requestMock.mockImplementation(async () => {
      throw new Error('fastCut "cut" has no music bed — wire one Audio node');
    });
    const { data } = await run([fastCut(), clip(), still(), bed()], [...POOL, BED]);

    expect(data.error).toBe('fastCut "cut" has no music bed — wire one Audio node');
    expect(data.isExecuting).toBe(false);
    expect(data.generatedVideoUrl).toBeUndefined();
  });

  it('fails without a room instead of rendering a canvas the server cannot read', async () => {
    const { data, flushSave } = await run(
      [fastCut(), clip(), still(), bed()],
      [...POOL, BED],
      { inRoom: false },
    );

    expect(requestMock).not.toHaveBeenCalled();
    expect(flushSave).not.toHaveBeenCalled();
    expect(data.error).toBe('AI Studio workspace is unavailable');
  });
});
