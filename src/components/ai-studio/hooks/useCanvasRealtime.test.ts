import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCanvasRealtime } from "./useCanvasRealtime";

let subscribeStatusSequence: string[] = ["SUBSCRIBED"];
let maybeSingleResponses: any[] = [null];
let maybeSingleCallCount = 0;

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
  const queryBuilder: any = {
    select: mock(() => queryBuilder),
    eq: mock(() => queryBuilder),
    order: mock(() => queryBuilder),
    maybeSingle: mock(() => {
      maybeSingleCallCount += 1;
      const nextValue = maybeSingleResponses.length > 0 ? maybeSingleResponses.shift() : null;
      return Promise.resolve({ data: nextValue ?? null, error: null });
    }),
    single: mock(() => Promise.resolve({ data: null, error: null })),
    upsert: mock(() => queryBuilder),
  };
  return queryBuilder;
};

const mockSupabase: any = {
  channel: mock(() => mockChannel),
  removeChannel: mock(() => {}),
  schema: mock((name: string) => mockSupabase),
  from: mock((table: string) => createMockQueryBuilder()),
};

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => mockSupabase,
}));

mock.module("@/hooks/useSession", () => ({
  useSession: () => ({
    user: { id: "user-1", email: "test@example.com", user_metadata: { full_name: "Test User" } },
  }),
}));

const mockSetNodes = mock(() => {});
const mockSetEdges = mock(() => {});
const mockStore = {
  nodes: [],
  edges: [],
  setNodes: mockSetNodes,
  setEdges: mockSetEdges,
};
const useStudioStoreMock: any = () => mockStore;
useStudioStoreMock.getState = () => mockStore;

mock.module("@/StudioCanvas/stores/useStudioStore", () => ({
  useStudioStore: useStudioStoreMock,
}));

describe("useCanvasRealtime", () => {
  beforeEach(() => {
    subscribeStatusSequence = ["SUBSCRIBED"];
    maybeSingleResponses = [null];
    maybeSingleCallCount = 0;
    mockStore.nodes = [];
    mockStore.edges = [];
    mockSetNodes.mockClear();
    mockSetEdges.mockClear();
    mockChannel.send.mockClear();
    mockSupabase.channel.mockClear();
    mockChannel.on.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("should initialize and subscribe to channel", async () => {
    await act(async () => {
      renderHook(() => useCanvasRealtime("brand-1", "room-1"));
    });
    
    expect(mockSupabase.channel).toHaveBeenCalledWith("canvas:broadcast:brand-1:room-1", expect.any(Object));
  });

  it("should throttle cursor updates", async () => {
    const { result } = renderHook(() => useCanvasRealtime("brand-1", "room-1"));
    
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    await act(async () => {
      result.current.updateCursor(100, 200);
      result.current.updateCursor(110, 210);
    });

    expect(mockChannel.send).toHaveBeenCalledTimes(1);
    expect(mockChannel.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "cursor",
      payload: expect.objectContaining({ x: 100, y: 200 }),
    });
  });

  it("should handle remote cursor updates", async () => {
    const { result } = renderHook(() => useCanvasRealtime("brand-1", "room-1"));
    
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    const calls = (mockChannel.on as any).mock.calls;
    const cursorCall = calls.find((c: any) => c[0] === "broadcast" && c[1]?.event === "cursor");
    const broadcastHandler = cursorCall[2];

    await act(async () => {
      broadcastHandler({
        payload: {
          userId: "user-2",
          x: 50,
          y: 60,
          name: "Other User",
          color: "#ff0000",
        },
      });
    });

    expect(result.current.remoteCursors["user-2"]).toEqual({
      x: 50,
      y: 60,
      name: "Other User",
      color: "#ff0000",
    });
  });

  it("should expose onlineUsers array", async () => {
    const { result } = renderHook(() => useCanvasRealtime("brand-1", "room-1"));
    
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(result.current.onlineUsers).toBeDefined();
    expect(Array.isArray(result.current.onlineUsers)).toBe(true);
  });

  it("should expose status string", async () => {
    const { result } = renderHook(() => useCanvasRealtime("brand-1", "room-1"));
    
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(result.current.status).toBeDefined();
    expect(typeof result.current.status).toBe("string");
    expect(result.current.status).toBe("SUBSCRIBED");
  });

  it("should fetch latest canvas state again after DB subscription", async () => {
    maybeSingleResponses = [
      { nodes: [], edges: [], updated_at: "2026-02-18T10:00:00.000Z" },
      { nodes: [], edges: [], updated_at: "2026-02-18T10:00:01.000Z" },
    ];

    renderHook(() => useCanvasRealtime("brand-1", "room-1"));

    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });

    expect(maybeSingleCallCount).toBeGreaterThanOrEqual(2);
  });

  it("maps CHANNEL_ERROR status to ERROR", async () => {
    subscribeStatusSequence = ["CHANNEL_ERROR"];

    const { result } = renderHook(() => useCanvasRealtime("brand-1", "room-1"));

    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });

    expect(result.current.status).toBe("ERROR");
    expect(result.current.dbStatus).toBe("ERROR");
  });

  it("preserves local generator prompt when remote broadcast sends empty prompt value", async () => {
    mockStore.nodes = [
      {
        id: "gen-1",
        type: "nanoGen",
        position: { x: 0, y: 0 },
        data: { positivePrompt: "high-detail product ad shot" },
      },
    ];
    maybeSingleResponses = [
      {
        nodes: mockStore.nodes,
        edges: [],
        updated_at: "2026-02-18T10:00:00.000Z",
      },
      null,
    ];

    renderHook(() => useCanvasRealtime("brand-1", "room-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const calls = (mockChannel.on as any).mock.calls;
    const updateCall = calls.find((c: any) => c[0] === "broadcast" && c[1]?.event === "canvas_updated");
    const updateHandler = updateCall[2];

    await act(async () => {
      updateHandler({
        payload: {
          nodes: [
            {
              id: "gen-1",
              type: "nanoGen",
              position: { x: 50, y: 40 },
              data: { positivePrompt: "" },
            },
          ],
          edges: [],
          updated_at: "2026-02-18T10:00:01.000Z",
        },
      });
    });

    const latestSetNodesPayload = (mockSetNodes as any).mock.calls.at(-1)?.[0];
    expect(latestSetNodesPayload?.[0]?.data?.positivePrompt).toBe("high-detail product ad shot");
    expect(latestSetNodesPayload?.[0]?.position).toEqual({ x: 50, y: 40 });
  });

  it("preserves local generator/reference media when remote payload strips media fields", async () => {
    mockStore.nodes = [
      {
        id: "gen-2",
        type: "veoDirector",
        position: { x: 0, y: 0 },
        data: { generatedVideo: "data:video/mp4;base64,local-output", prompt: "make a teaser" },
      },
      {
        id: "ref-1",
        type: "image",
        position: { x: 8, y: 8 },
        data: { image: "data:image/png;base64,local-ref", fileName: "ref.png" },
      },
    ];
    maybeSingleResponses = [
      {
        nodes: mockStore.nodes,
        edges: [],
        updated_at: "2026-02-18T10:00:00.000Z",
      },
      null,
    ];

    renderHook(() => useCanvasRealtime("brand-1", "room-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const calls = (mockChannel.on as any).mock.calls;
    const updateCall = calls.find((c: any) => c[0] === "broadcast" && c[1]?.event === "canvas_updated");
    const updateHandler = updateCall[2];

    await act(async () => {
      updateHandler({
        payload: {
          nodes: [
            {
              id: "gen-2",
              type: "veoDirector",
              position: { x: 12, y: 12 },
              data: { prompt: "make a teaser" },
            },
            {
              id: "ref-1",
              type: "image",
              position: { x: 18, y: 18 },
              data: { fileName: "ref.png" },
            },
          ],
          edges: [],
          updated_at: "2026-02-18T10:00:01.000Z",
        },
      });
    });

    const latestSetNodesPayload = (mockSetNodes as any).mock.calls.at(-1)?.[0];
    const mergedGenerator = latestSetNodesPayload?.find((node: any) => node.id === "gen-2");
    const mergedReference = latestSetNodesPayload?.find((node: any) => node.id === "ref-1");

    expect(mergedGenerator?.data?.generatedVideo).toBe("data:video/mp4;base64,local-output");
    expect(mergedReference?.data?.image).toBe("data:image/png;base64,local-ref");
    expect(mergedGenerator?.position).toEqual({ x: 12, y: 12 });
    expect(mergedReference?.position).toEqual({ x: 18, y: 18 });
  });
});
