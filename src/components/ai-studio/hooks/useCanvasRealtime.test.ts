import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCanvasRealtime } from './useCanvasRealtime';

let subscribeStatusSequence: string[] = ['SUBSCRIBED'];
let maybeSingleResponses: any[] = [null];
let maybeSingleCallCount = 0;
let upsertSingleResponse: any = null;
let lastUpsertPayload: any = null;

const mockSignRequest = mock(async () => [] as any[]);

const mockChannel = {
  on: mock(() => mockChannel),
  subscribe: mock((callback: any) => {
    setTimeout(() => {
      subscribeStatusSequence.forEach((status) => callback(status));
    }, 0);
    return mockChannel;
  }),
  send: mock(() => {}),
  track: mock(() => Promise.resolve()),
  presenceState: mock(() => ({})),
  unsubscribe: mock(() => {}),
};

const createMockQueryBuilder = () => {
  let isWrite = false;
  const captureWrite = (payload: any) => {
    isWrite = true;
    lastUpsertPayload = Array.isArray(payload) ? payload[0] : payload;
    return queryBuilder;
  };
  const queryBuilder: any = {
    select: mock(() => queryBuilder),
    eq: mock(() => queryBuilder),
    order: mock(() => queryBuilder),
    maybeSingle: mock(() => {
      if (isWrite) {
        return Promise.resolve({ data: upsertSingleResponse, error: null });
      }
      maybeSingleCallCount += 1;
      const nextValue = maybeSingleResponses.length > 0 ? maybeSingleResponses.shift() : null;
      return Promise.resolve({ data: nextValue ?? null, error: null });
    }),
    single: mock(() => Promise.resolve({ data: upsertSingleResponse, error: null })),
    insert: mock(captureWrite),
    update: mock(captureWrite),
    upsert: mock(captureWrite),
  };
  return queryBuilder;
};

const mockSupabase: any = {
  auth: {
    getSession: mock(() => Promise.resolve({ data: { session: { access_token: 'test-token' } } })),
  },
  channel: mock(() => mockChannel),
  removeChannel: mock(() => {}),
  schema: mock(() => mockSupabase),
  from: mock(() => createMockQueryBuilder()),
};

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => mockSupabase,
}));

mock.module('@/hooks/useSession', () => ({
  useSession: () => ({
    user: { id: 'user-1', email: 'test@example.com', user_metadata: { full_name: 'Test User' } },
  }),
}));

mock.module('@/lib/api/http', () => ({
  request: mockSignRequest,
}));

const mockSetNodes = mock(() => {});
const mockSetEdges = mock(() => {});
const mockStore: any = {
  nodes: [],
  edges: [],
  defaultEdgeType: 'bezier',
  setNodes: mockSetNodes,
  setEdges: mockSetEdges,
  getDeletedNodeIds: () => [] as string[],
  getDeletedEdgeIds: () => [] as string[],
  clearDeletedIds: () => {},
  triggerSave: mock(() => {}),
  resetForRoomSwitch: mock(() => {
    mockStore.nodes = [];
    mockStore.edges = [];
    mockSetNodes([]);
    mockSetEdges([]);
  }),
};
const useStudioStoreMock: any = () => mockStore;
useStudioStoreMock.getState = () => mockStore;

mock.module('@/StudioCanvas/stores/useStudioStore', () => ({
  useStudioStore: useStudioStoreMock,
}));

describe('useCanvasRealtime', () => {
  beforeEach(() => {
    subscribeStatusSequence = ['SUBSCRIBED'];
    maybeSingleResponses = [null];
    maybeSingleCallCount = 0;
    upsertSingleResponse = null;
    lastUpsertPayload = null;
    mockSignRequest.mockReset();
    mockSignRequest.mockImplementation(async () => [] as any[]);
    mockStore.nodes = [];
    mockStore.edges = [];
    mockSetNodes.mockClear();
    mockSetEdges.mockClear();
    mockChannel.send.mockClear();
    mockSupabase.channel.mockClear();
    mockChannel.on.mockClear();
    (mockStore.triggerSave as any).mockClear();
    (mockStore.resetForRoomSwitch as any).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('should initialize and subscribe to channel', async () => {
    await act(async () => {
      renderHook(() => useCanvasRealtime('brand-1', 'room-1'));
    });

    expect(mockSupabase.channel).toHaveBeenCalledWith(
      'canvas:broadcast:brand-1:room-1',
      expect.any(Object),
    );
  });

  it('should throttle cursor updates', async () => {
    const { result } = renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    await act(async () => {
      result.current.updateCursor(100, 200);
      result.current.updateCursor(110, 210);
    });

    expect(mockChannel.send).toHaveBeenCalledTimes(1);
    expect(mockChannel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'cursor',
      payload: expect.objectContaining({ x: 100, y: 200 }),
    });
  });

  it('should handle remote cursor updates', async () => {
    const { result } = renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const calls = (mockChannel.on as any).mock.calls;
    const cursorCall = calls.find((c: any) => c[0] === 'broadcast' && c[1]?.event === 'cursor');
    const broadcastHandler = cursorCall[2];

    await act(async () => {
      broadcastHandler({
        payload: {
          userId: 'user-2',
          x: 50,
          y: 60,
          name: 'Other User',
          color: '#ff0000',
        },
      });
    });

    expect(result.current.remoteCursors['user-2']).toEqual({
      x: 50,
      y: 60,
      name: 'Other User',
      color: '#ff0000',
    });
  });

  it('should expose onlineUsers array', async () => {
    const { result } = renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.onlineUsers).toBeDefined();
    expect(Array.isArray(result.current.onlineUsers)).toBe(true);
  });

  it('should expose status string', async () => {
    const { result } = renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.status).toBeDefined();
    expect(typeof result.current.status).toBe('string');
    expect(result.current.status).toBe('SUBSCRIBED');
  });

  it('should fetch latest canvas state again after DB subscription', async () => {
    maybeSingleResponses = [
      { nodes: [], edges: [], updated_at: '2026-02-18T10:00:00.000Z' },
      { nodes: [], edges: [], updated_at: '2026-02-18T10:00:01.000Z' },
    ];

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(maybeSingleCallCount).toBeGreaterThanOrEqual(2);
  });

  it('maps CHANNEL_ERROR status to ERROR', async () => {
    subscribeStatusSequence = ['CHANNEL_ERROR'];

    const { result } = renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(result.current.status).toBe('ERROR');
    expect(result.current.dbStatus).toBe('ERROR');
  });

  it('preserves local generator prompt when remote broadcast sends empty prompt value', async () => {
    mockStore.nodes = [
      {
        id: 'gen-1',
        type: 'nanoGen',
        position: { x: 0, y: 0 },
        data: { positivePrompt: 'high-detail product ad shot' },
      },
    ];
    maybeSingleResponses = [
      {
        nodes: mockStore.nodes,
        edges: [],
        updated_at: '2026-02-18T10:00:00.000Z',
      },
      null,
    ];

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const calls = (mockChannel.on as any).mock.calls;
    const updateCall = calls.find(
      (c: any) => c[0] === 'broadcast' && c[1]?.event === 'canvas_updated',
    );
    const updateHandler = updateCall[2];

    await act(async () => {
      updateHandler({
        payload: {
          nodes: [
            {
              id: 'gen-1',
              type: 'nanoGen',
              position: { x: 50, y: 40 },
              data: { positivePrompt: '' },
            },
          ],
          edges: [],
          updated_at: '2026-02-18T10:00:01.000Z',
        },
      });
    });

    const latestSetNodesPayload = (mockSetNodes as any).mock.calls.at(-1)?.[0];
    expect(latestSetNodesPayload?.[0]?.data?.positivePrompt).toBe('high-detail product ad shot');
    expect(latestSetNodesPayload?.[0]?.position).toEqual({ x: 50, y: 40 });
  });

  it('preserves local generator/reference media when remote payload strips media fields', async () => {
    mockStore.nodes = [
      {
        id: 'gen-2',
        type: 'veoDirector',
        position: { x: 0, y: 0 },
        data: { generatedVideo: 'data:video/mp4;base64,local-output', prompt: 'make a teaser' },
      },
      {
        id: 'ref-1',
        type: 'image',
        position: { x: 8, y: 8 },
        data: { image: 'data:image/png;base64,local-ref', fileName: 'ref.png' },
      },
    ];
    maybeSingleResponses = [
      {
        nodes: mockStore.nodes,
        edges: [],
        updated_at: '2026-02-18T10:00:00.000Z',
      },
      null,
    ];

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const calls = (mockChannel.on as any).mock.calls;
    const updateCall = calls.find(
      (c: any) => c[0] === 'broadcast' && c[1]?.event === 'canvas_updated',
    );
    const updateHandler = updateCall[2];

    await act(async () => {
      updateHandler({
        payload: {
          nodes: [
            {
              id: 'gen-2',
              type: 'veoDirector',
              position: { x: 12, y: 12 },
              data: { prompt: 'make a teaser' },
            },
            {
              id: 'ref-1',
              type: 'image',
              position: { x: 18, y: 18 },
              data: { fileName: 'ref.png' },
            },
          ],
          edges: [],
          updated_at: '2026-02-18T10:00:01.000Z',
        },
      });
    });

    const latestSetNodesPayload = (mockSetNodes as any).mock.calls.at(-1)?.[0];
    const mergedGenerator = latestSetNodesPayload?.find((node: any) => node.id === 'gen-2');
    const mergedReference = latestSetNodesPayload?.find((node: any) => node.id === 'ref-1');

    expect(mergedGenerator?.data?.generatedVideo).toBe('data:video/mp4;base64,local-output');
    expect(mergedReference?.data?.image).toBe('data:image/png;base64,local-ref');
    expect(mergedGenerator?.position).toEqual({ x: 12, y: 12 });
    expect(mergedReference?.position).toEqual({ x: 18, y: 18 });
  });

  it('requests catch-up instead of clearing when DB payload is malformed', async () => {
    const initialNodes = [
      {
        id: 'node-1',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'keep me' },
      },
    ];

    mockStore.nodes = initialNodes as any;
    maybeSingleResponses = [
      { nodes: initialNodes, edges: [], updated_at: '2026-02-18T10:00:00.000Z' },
      { nodes: initialNodes, edges: [], updated_at: '2026-02-18T10:00:01.000Z' },
      { nodes: initialNodes, edges: [], updated_at: '2026-02-18T10:00:03.000Z' },
    ];

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const calls = (mockChannel.on as any).mock.calls;
    const dbChangeCall = calls.find((c: any) => c[0] === 'postgres_changes');
    const dbChangeHandler = dbChangeCall[2];

    mockSetNodes.mockClear();
    const maybeSingleCountBeforeMalformedUpdate = maybeSingleCallCount;

    await act(async () => {
      dbChangeHandler({
        eventType: 'UPDATE',
        new: {
          brand_profile_id: 'brand-1',
          room_id: 'room-1',
          updated_at: '2026-02-18T10:00:02.000Z',
        },
      });
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(maybeSingleCallCount).toBeGreaterThan(maybeSingleCountBeforeMalformedUpdate);
    const latestSetNodesPayload = (mockSetNodes as any).mock.calls.at(-1)?.[0];
    expect(latestSetNodesPayload).toHaveLength(1);
    expect(latestSetNodesPayload?.[0]?.id).toBe('node-1');
  });

  it('verifies suspicious empty realtime snapshot before applying a clear', async () => {
    const initialNodes = [
      {
        id: 'node-2',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'persist until verified' },
      },
    ];
    const catchupNodes = [
      {
        id: 'node-2',
        type: 'string',
        position: { x: 24, y: 16 },
        data: { value: 'persist until verified' },
      },
    ];

    mockStore.nodes = initialNodes as any;
    maybeSingleResponses = [
      { nodes: initialNodes, edges: [], updated_at: '2026-02-18T10:10:00.000Z' },
      { nodes: initialNodes, edges: [], updated_at: '2026-02-18T10:10:01.000Z' },
      { nodes: catchupNodes, edges: [], updated_at: '2026-02-18T10:10:03.000Z' },
    ];

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const calls = (mockChannel.on as any).mock.calls;
    const dbChangeCall = calls.find((c: any) => c[0] === 'postgres_changes');
    const dbChangeHandler = dbChangeCall[2];

    mockSetNodes.mockClear();
    const maybeSingleCountBeforeSuspiciousUpdate = maybeSingleCallCount;

    await act(async () => {
      dbChangeHandler({
        eventType: 'UPDATE',
        new: {
          brand_profile_id: 'brand-1',
          room_id: 'room-1',
          nodes: [],
          edges: [],
          updated_at: '2026-02-18T10:10:02.000Z',
        },
      });
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(maybeSingleCallCount).toBeGreaterThan(maybeSingleCountBeforeSuspiciousUpdate);
    const latestSetNodesPayload = (mockSetNodes as any).mock.calls.at(-1)?.[0];
    expect(latestSetNodesPayload).toHaveLength(1);
    expect(latestSetNodesPayload?.[0]?.position).toEqual({ x: 24, y: 16 });
  });

  it('ignores stale revisions even when stale payload has a newer timestamp', async () => {
    const initialNodes = [
      {
        id: 'node-rev',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'initial' },
      },
    ];

    mockStore.nodes = initialNodes as any;
    maybeSingleResponses = [
      { nodes: initialNodes, edges: [], updated_at: '2026-02-18T11:00:00.000Z', revision: 1 },
      null,
    ];

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const calls = (mockChannel.on as any).mock.calls;
    const broadcastCall = calls.find(
      (c: any) => c[0] === 'broadcast' && c[1]?.event === 'canvas_updated',
    );
    const dbChangeCall = calls.find((c: any) => c[0] === 'postgres_changes');
    const broadcastHandler = broadcastCall[2];
    const dbChangeHandler = dbChangeCall[2];

    await act(async () => {
      broadcastHandler({
        payload: {
          nodes: [
            {
              id: 'node-rev',
              type: 'string',
              position: { x: 30, y: 30 },
              data: { value: 'rev-3' },
            },
          ],
          edges: [],
          updated_at: '2026-02-18T11:00:02.000Z',
          revision: 3,
        },
      });
    });

    const setNodesCallCountAfterRevision3 = (mockSetNodes as any).mock.calls.length;

    await act(async () => {
      dbChangeHandler({
        eventType: 'UPDATE',
        new: {
          brand_profile_id: 'brand-1',
          room_id: 'room-1',
          nodes: [
            {
              id: 'node-rev',
              type: 'string',
              position: { x: 10, y: 10 },
              data: { value: 'rev-2-stale' },
            },
          ],
          edges: [],
          updated_at: '2026-02-18T11:00:09.000Z',
          revision: 2,
        },
      });
      await new Promise((r) => setTimeout(r, 20));
    });

    expect((mockSetNodes as any).mock.calls.length).toBe(setNodesCallCountAfterRevision3);
    const latestSetNodesPayload = (mockSetNodes as any).mock.calls.at(-1)?.[0];
    expect(latestSetNodesPayload?.[0]?.data?.value).toBe('rev-3');
    expect(latestSetNodesPayload?.[0]?.position).toEqual({ x: 30, y: 30 });
  });

  it('does not broadcast base64 media over realtime and leaves local store state intact', async () => {
    const base64Image = `data:image/png;base64,${'A'.repeat(128)}`;
    mockStore.nodes = [
      {
        id: 'img-1',
        type: 'image',
        position: { x: 0, y: 0 },
        data: {
          image: base64Image,
          fileName: 'big.png',
          sourceUrl: 'https://cdn.continuum.test/big.png',
        },
      },
    ];
    mockStore.edges = [];
    upsertSingleResponse = {
      updated_at: '2026-02-18T10:00:05.000Z',
      revision: 2,
      editor_session_id: 'sess-x',
    };

    const { result } = renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    mockChannel.send.mockClear();

    await act(async () => {
      await result.current.saveCanvasToDatabase();
    });

    const canvasUpdate = (mockChannel.send as any).mock.calls
      .map((c: any) => c[0])
      .find((payload: any) => payload?.event === 'canvas_updated');

    expect(canvasUpdate).toBeDefined();
    expect(JSON.stringify(canvasUpdate.payload)).not.toContain('base64');
    const broadcastImageNode = canvasUpdate.payload.nodes.find((n: any) => n.id === 'img-1');
    expect(broadcastImageNode?.data?.image).toBeUndefined();
    expect(broadcastImageNode?.data?.sourceUrl).toBe('https://cdn.continuum.test/big.png');

    expect((mockStore.nodes[0] as any).data.image).toBe(base64Image);
  });

  it("drops the client's own postgres echo (self editor_session_id)", async () => {
    mockStore.nodes = [
      { id: 'n1', type: 'string', position: { x: 0, y: 0 }, data: { value: 'local' } },
    ] as any;
    upsertSingleResponse = {
      updated_at: '2026-02-18T10:00:05.000Z',
      revision: 5,
      editor_session_id: 'db-echo',
    };

    const { result } = renderHook(() => useCanvasRealtime('brand-1', 'room-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    await act(async () => {
      await result.current.saveCanvasToDatabase();
    });

    const ownSession = lastUpsertPayload?.editor_session_id;
    expect(typeof ownSession).toBe('string');

    const dbHandler = (mockChannel.on as any).mock.calls.find(
      (c: any) => c[0] === 'postgres_changes',
    )[2];
    mockSetNodes.mockClear();

    await act(async () => {
      dbHandler({
        eventType: 'UPDATE',
        new: {
          brand_profile_id: 'brand-1',
          room_id: 'room-1',
          nodes: [
            { id: 'n1', type: 'string', position: { x: 99, y: 99 }, data: { value: 'echo' } },
          ],
          edges: [],
          updated_at: '2026-02-18T10:30:00.000Z',
          revision: null,
          editor_session_id: ownSession,
        },
      });
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(mockSetNodes).not.toHaveBeenCalled();
  });

  it("applies a peer's postgres update (different editor_session_id)", async () => {
    mockStore.nodes = [
      { id: 'n1', type: 'string', position: { x: 0, y: 0 }, data: { value: 'local' } },
    ] as any;

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const dbHandler = (mockChannel.on as any).mock.calls.find(
      (c: any) => c[0] === 'postgres_changes',
    )[2];
    mockSetNodes.mockClear();

    await act(async () => {
      dbHandler({
        eventType: 'UPDATE',
        new: {
          brand_profile_id: 'brand-1',
          room_id: 'room-1',
          nodes: [
            { id: 'n1', type: 'string', position: { x: 12, y: 12 }, data: { value: 'peer-edit' } },
          ],
          edges: [],
          updated_at: '2026-02-18T10:30:00.000Z',
          revision: null,
          editor_session_id: 'peer-session-xyz',
        },
      });
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(mockSetNodes).toHaveBeenCalled();
  });

  it('re-signs merged media missing its signed url, once per durable pointer', async () => {
    mockSignRequest.mockImplementation(async () => [
      { bucket: 'canvas', path: 'gen/img.png', signedUrl: 'https://signed.test/img' },
    ]);

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const dbHandler = (mockChannel.on as any).mock.calls.find(
      (c: any) => c[0] === 'postgres_changes',
    )[2];
    mockSetNodes.mockClear();
    mockSignRequest.mockClear();

    const strippedNode = {
      id: 'gen-img',
      type: 'nanoGen',
      position: { x: 0, y: 0 },
      data: { generatedImageStoragePath: 'gen/img.png', generatedImageBucket: 'canvas' },
    };

    await act(async () => {
      dbHandler({
        eventType: 'UPDATE',
        new: {
          brand_profile_id: 'brand-1',
          room_id: 'room-1',
          nodes: [strippedNode],
          edges: [],
          updated_at: '2026-02-18T11:00:00.000Z',
          revision: null,
          editor_session_id: 'peer-1',
        },
      });
      await new Promise((r) => setTimeout(r, 40));
    });

    const resignedPayload = (mockSetNodes as any).mock.calls.at(-1)?.[0];
    const resignedNode = resignedPayload?.find((n: any) => n.id === 'gen-img');
    expect(resignedNode?.data?.generatedImageUrl).toBe('https://signed.test/img');
    expect(mockSignRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      dbHandler({
        eventType: 'UPDATE',
        new: {
          brand_profile_id: 'brand-1',
          room_id: 'room-1',
          nodes: [strippedNode],
          edges: [],
          updated_at: '2026-02-18T11:05:00.000Z',
          revision: null,
          editor_session_id: 'peer-1',
        },
      });
      await new Promise((r) => setTimeout(r, 40));
    });

    expect(mockSignRequest).toHaveBeenCalledTimes(1);
  });

  it('does not wipe a non-empty local canvas when no persisted row exists (solo)', async () => {
    mockStore.nodes = [
      { id: 'solo-1', type: 'string', position: { x: 0, y: 0 }, data: { value: 'unsynced' } },
    ] as any;
    maybeSingleResponses = [null];

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const emptyCall = (mockSetNodes as any).mock.calls.find(
      (c: any) => Array.isArray(c[0]) && c[0].length === 0,
    );
    expect(emptyCall).toBeUndefined();
  });

  it('starts a newly selected room empty instead of adopting the previous room graph', async () => {
    const roomOneSession = {
      nodes: [
        { id: 'room-one-node', type: 'string', position: { x: 0, y: 0 }, data: { value: 'old' } },
      ],
      edges: [],
      updated_at: '2026-07-22T07:00:00.000Z',
      revision: 1,
    };
    maybeSingleResponses = [roomOneSession, roomOneSession, null, null];

    const { rerender } = renderHook(({ roomId }) => useCanvasRealtime('brand-1', roomId), {
      initialProps: { roomId: 'room-1' },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    mockStore.nodes = roomOneSession.nodes as any;
    mockStore.edges = [];
    mockSetNodes.mockClear();
    mockSetEdges.mockClear();

    rerender({ roomId: 'room-2' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(mockSetNodes).toHaveBeenCalledWith([]);
    expect(mockSetEdges).toHaveBeenCalledWith([]);
    expect(lastUpsertPayload?.room_id).not.toBe('room-2');
  });

  it('preserves local work on a canvas_sessions DELETE instead of wiping', async () => {
    mockStore.nodes = [
      { id: 'keep-1', type: 'string', position: { x: 0, y: 0 }, data: { value: 'survive' } },
    ] as any;
    maybeSingleResponses = [
      { nodes: mockStore.nodes, edges: [], updated_at: '2026-02-18T10:00:00.000Z' },
      null,
    ];

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const dbHandler = (mockChannel.on as any).mock.calls.find(
      (c: any) => c[0] === 'postgres_changes',
    )[2];
    mockSetNodes.mockClear();
    (mockStore.triggerSave as any).mockClear();

    await act(async () => {
      dbHandler({ eventType: 'DELETE', old: { brand_profile_id: 'brand-1', room_id: 'room-1' } });
      await new Promise((r) => setTimeout(r, 20));
    });

    const emptyCall = (mockSetNodes as any).mock.calls.find(
      (c: any) => Array.isArray(c[0]) && c[0].length === 0,
    );
    expect(emptyCall).toBeUndefined();
    expect(mockStore.triggerSave as any).toHaveBeenCalled();
  });
});
