import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCanvasRealtime } from "./useCanvasRealtime";

const mockChannel = {
  on: mock(() => mockChannel),
  subscribe: mock((callback: any) => {
    setTimeout(() => callback("SUBSCRIBED"), 0);
    return mockChannel;
  }),
  send: mock(() => {}),
  track: mock(() => Promise.resolve()),
  presenceState: mock(() => ({})),
  unsubscribe: mock(() => {}),
};

const mockSupabase: any = {
  channel: mock(() => mockChannel),
  removeChannel: mock(() => {}),
  schema: mock((name: string) => mockSupabase),
  from: mock((table: string) => ({
    select: mock(() => ({
      eq: mock(() => ({
        maybeSingle: mock(() => Promise.resolve({ data: null, error: null })),
        single: mock(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
    upsert: mock(() => ({
      select: mock(() => ({
        single: mock(() => Promise.resolve({ data: { updated_at: new Date().toISOString() }, error: null })),
      })),
    })),
  })),
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
mock.module("@/StudioCanvas/stores/useStudioStore", () => ({
  useStudioStore: () => ({
    nodes: [],
    edges: [],
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
  }),
}));

describe("useCanvasRealtime", () => {
  beforeEach(() => {
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
      renderHook(() => useCanvasRealtime("brand-1"));
    });
    
    expect(mockSupabase.channel).toHaveBeenCalledWith("canvas_session:brand-1");
    expect(mockChannel.on).toHaveBeenCalledWith("postgres_changes" as any, expect.any(Object), expect.any(Function));
  });

  it("should throttle cursor updates", async () => {
    const { result } = renderHook(() => useCanvasRealtime("brand-1"));
    
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
    const { result } = renderHook(() => useCanvasRealtime("brand-1"));
    
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    const calls = (mockChannel.on as any).mock.calls;
    const broadcastCall = calls.find((c: any) => c[0] === "broadcast");
    const broadcastHandler = broadcastCall[2];

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
    const { result } = renderHook(() => useCanvasRealtime("brand-1"));
    
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(result.current.onlineUsers).toBeDefined();
    expect(Array.isArray(result.current.onlineUsers)).toBe(true);
  });

  it("should expose status string", async () => {
    const { result } = renderHook(() => useCanvasRealtime("brand-1"));
    
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(result.current.status).toBeDefined();
    expect(typeof result.current.status).toBe("string");
    expect(result.current.status).toBe("SUBSCRIBED");
  });
});
