import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCanvasRooms } from './useCanvasRooms';

const mockRooms = [
  {
    id: 'room-1',
    brand_profile_id: 'brand-1',
    name: 'Main Workspace',
    created_at: '2026-01-31T00:00:00Z',
    created_by: 'user-1',
    kind: 'general',
  },
];

type RealtimeHandler = (payload: { new?: unknown; old?: unknown }) => void;
const realtimeHandlers = new Map<string, RealtimeHandler>();
const mockChannel: any = {
  on: mock((_type: string, config: { event: string }, handler: RealtimeHandler) => {
    realtimeHandlers.set(config.event, handler);
    return mockChannel;
  }),
  subscribe: mock((handler?: (status: string) => void) => {
    handler?.('SUBSCRIBED');
    return mockChannel;
  }),
};

const mockSupabase: any = {
  schema: mock(() => mockSupabase),
  from: mock(() => mockSupabase),
  select: mock(() => mockSupabase),
  eq: mock(() => mockSupabase),
  order: mock(() => mockSupabase),
  rpc: mock(() => Promise.resolve({ data: null, error: null })),
  delete: mock(() => mockSupabase),
  update: mock(() => mockSupabase),
  channel: mock(() => mockChannel),
  removeChannel: mock(() => Promise.resolve()),
  then: (resolve: any) => resolve({ data: mockRooms, error: null }),
};

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => mockSupabase,
}));

describe('useCanvasRooms', () => {
  beforeEach(() => {
    mockSupabase.from.mockClear();
    mockSupabase.select.mockClear();
    mockSupabase.rpc.mockClear();
    mockSupabase.delete.mockClear();
    mockSupabase.channel.mockClear();
    mockSupabase.removeChannel.mockClear();
    mockChannel.on.mockClear();
    mockChannel.subscribe.mockClear();
    realtimeHandlers.clear();
    mockSupabase.rpc.mockImplementation(() => Promise.resolve({ data: null, error: null }));
    mockSupabase.then = (resolve: any) => resolve({ data: mockRooms, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('should fetch rooms on mount', async () => {
    const { result } = renderHook(() => useCanvasRooms('brand-1'));

    await act(async () => {});

    expect(result.current.rooms).toEqual(mockRooms);
    expect(mockSupabase.from).toHaveBeenCalledWith('canvas_rooms' as any);
  });

  it('adds an MCP-created workspace from Realtime', async () => {
    const { result } = renderHook(() => useCanvasRooms('brand-1'));
    const room = {
      id: '00000000-0000-4000-8000-000000000002',
      brand_profile_id: 'brand-1',
      name: 'MCP Workspace',
      created_at: '2026-08-06T18:00:00Z',
      created_by: null,
      kind: 'general',
    };

    await act(async () => {});
    act(() => realtimeHandlers.get('INSERT')?.({ new: room }));

    expect(result.current.rooms).toContainEqual(room);
  });

  it('uses a distinct Realtime channel for each hook instance', async () => {
    const first = renderHook(() => useCanvasRooms('brand-1'));
    const second = renderHook(() => useCanvasRooms('brand-1'));

    await act(async () => {});

    const topics = mockSupabase.channel.mock.calls.map(([topic]: [string]) => topic);
    expect(new Set(topics).size).toBe(topics.length);
    first.unmount();
    second.unmount();
  });

  it('should enforce max 3 rooms limit', async () => {
    const fullRooms = [
      { id: '1', name: 'R1', kind: 'general' },
      { id: '2', name: 'R2', kind: 'general' },
      { id: '3', name: 'R3', kind: 'general' },
    ];
    mockSupabase.then = (resolve: any) => resolve({ data: fullRooms, error: null });

    const { result } = renderHook(() => useCanvasRooms('brand-1'));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      const room = await result.current.createRoom('New Room');
      expect(room).toBeNull();
    });
  });

  it('should allow creating a room if count < 3', async () => {
    mockSupabase.then = (resolve: any) => resolve({ data: mockRooms, error: null });
    const rpcRoom = {
      room_id: '00000000-0000-4000-8000-000000000002',
      name: 'New Room',
      kind: 'general',
      created_at: '2026-01-31T01:00:00Z',
    };
    mockSupabase.rpc.mockImplementation(() => Promise.resolve({ data: rpcRoom, error: null }));

    const { result } = renderHook(() => useCanvasRooms('brand-1'));

    await act(async () => {
      const room = await result.current.createRoom('New Room');
      expect(room).toEqual({
        id: rpcRoom.room_id,
        brand_profile_id: 'brand-1',
        name: rpcRoom.name,
        created_at: rpcRoom.created_at,
        created_by: null,
        kind: 'general',
      });
    });
    expect(mockSupabase.rpc).toHaveBeenCalledWith('create_canvas_workspace', {
      p_brand_profile_id: 'brand-1',
      p_name: 'New Room',
    });
  });

  it('should not allow deleting the last room', async () => {
    mockSupabase.then = (resolve: any) => resolve({ data: mockRooms, error: null });
    const { result } = renderHook(() => useCanvasRooms('brand-1'));

    await act(async () => {
      const success = await result.current.deleteRoom('room-1');
      expect(success).toBe(false);
    });
  });
});
