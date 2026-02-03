import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCanvasRooms } from "./useCanvasRooms";

const mockRooms = [
  { id: "room-1", brand_profile_id: "brand-1", name: "Main Workspace", created_at: "2026-01-31T00:00:00Z", created_by: "user-1" }
];

const mockSupabase: any = {
  schema: mock(() => mockSupabase),
  from: mock(() => mockSupabase),
  select: mock(() => mockSupabase),
  eq: mock(() => mockSupabase),
  order: mock(() => mockSupabase),
  insert: mock(() => mockSupabase),
  delete: mock(() => mockSupabase),
  update: mock(() => mockSupabase),
  single: mock(() => Promise.resolve({ data: mockRooms[0], error: null })),
  then: (resolve: any) => resolve({ data: mockRooms, error: null }),
};

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => mockSupabase,
}));

describe("useCanvasRooms", () => {
  beforeEach(() => {
    mockSupabase.from.mockClear();
    mockSupabase.select.mockClear();
    mockSupabase.insert.mockClear();
    mockSupabase.delete.mockClear();
    mockSupabase.single = mock(() => Promise.resolve({ data: mockRooms[0], error: null }));
    mockSupabase.then = (resolve: any) => resolve({ data: mockRooms, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("should fetch rooms on mount", async () => {
    const { result } = renderHook(() => useCanvasRooms("brand-1"));
    
    await act(async () => {
    });

    expect(result.current.rooms).toEqual(mockRooms);
    expect(mockSupabase.from).toHaveBeenCalledWith("canvas_rooms" as any);
  });

  it("should enforce max 3 rooms limit", async () => {
    const fullRooms = [
      { id: "1", name: "R1" },
      { id: "2", name: "R2" },
      { id: "3", name: "R3" }
    ];
    mockSupabase.then = (resolve: any) => resolve({ data: fullRooms, error: null });

    const { result } = renderHook(() => useCanvasRooms("brand-1"));
    
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      const room = await result.current.createRoom("New Room");
      expect(room).toBeNull();
    });
  });

  it("should allow creating a room if count < 3", async () => {
    mockSupabase.then = (resolve: any) => resolve({ data: mockRooms, error: null });
    const newRoom = { id: "room-2", name: "New Room" };
    mockSupabase.single = mock(() => Promise.resolve({ data: newRoom, error: null }));

    const { result } = renderHook(() => useCanvasRooms("brand-1"));
    
    await act(async () => {
      const room = await result.current.createRoom("New Room");
      expect(room).toEqual(newRoom as any);
    });
  });

  it("should not allow deleting the last room", async () => {
    mockSupabase.then = (resolve: any) => resolve({ data: mockRooms, error: null });
    const { result } = renderHook(() => useCanvasRooms("brand-1"));
    
    await act(async () => {
      const success = await result.current.deleteRoom("room-1");
      expect(success).toBe(false);
    });
  });
});
