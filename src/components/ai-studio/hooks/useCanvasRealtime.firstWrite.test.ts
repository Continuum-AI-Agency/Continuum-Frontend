// The first write into a canvas room that has no canvas_sessions row yet.
//
// A save requested before the room finished loading parks in pendingSaveRef. The
// effect that drains it is edge-triggered on isLoading, so a bootstrap that completes
// while isLoading is ALREADY false never drains it — and the applied graph is gone on
// reload. The previous room's post-load timer is the observed way isLoading gets there
// early, which is why the regression below drives a room switch rather than a mount.

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { useCanvasRealtime } from './useCanvasRealtime';

type Write = { kind: 'insert' | 'update'; payload: any };

let reads: any[] = [];
let writes: Write[] = [];
let writeResponse: any = null;
let readGate: Promise<void> | null = null;
let releaseRead: (() => void) | null = null;

const openReadGate = () => {
  readGate = new Promise<void>((resolve) => {
    releaseRead = () => resolve();
  });
};

const mockChannel = {
  on: mock(() => mockChannel),
  subscribe: mock((cb: any) => {
    setTimeout(() => cb('SUBSCRIBED'), 0);
    return mockChannel;
  }),
  send: mock(() => {}),
  track: mock(() => Promise.resolve()),
  presenceState: mock(() => ({})),
  unsubscribe: mock(() => {}),
};

const createQueryBuilder = () => {
  let write: Write['kind'] | null = null;
  const capture = (kind: Write['kind']) => (payload: any) => {
    write = kind;
    writes.push({ kind, payload: Array.isArray(payload) ? payload[0] : payload });
    return queryBuilder;
  };
  const queryBuilder: any = {
    select: mock(() => queryBuilder),
    eq: mock(() => queryBuilder),
    order: mock(() => queryBuilder),
    insert: mock(capture('insert')),
    update: mock(capture('update')),
    upsert: mock(() => queryBuilder),
    single: mock(async () => ({ data: writeResponse, error: null })),
    maybeSingle: mock(async () => {
      if (write) return { data: writeResponse, error: null };
      const next = reads.length > 0 ? reads.shift() : null;
      if (readGate) await readGate;
      return { data: next ?? null, error: null };
    }),
  };
  return queryBuilder;
};

const mockSupabase: any = {
  auth: {
    getSession: mock(() => Promise.resolve({ data: { session: { access_token: 't' } } })),
  },
  channel: mock(() => mockChannel),
  removeChannel: mock(() => {}),
  schema: mock(() => mockSupabase),
  from: mock(() => createQueryBuilder()),
};

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => mockSupabase,
}));

mock.module('@/hooks/useSession', () => ({
  useSession: () => ({
    user: { id: 'user-1', email: 'test@example.com', user_metadata: { full_name: 'Test User' } },
  }),
}));

mock.module('@/lib/api/http', () => ({ request: mock(async () => ({ items: [] })) }));

// A zustand stand-in that HONOURS the selector, so the hook's saveTrigger subscription
// is live and triggerSave() drives a save the way the canvas does in production.
const listeners = new Set<() => void>();
const emit = () => {
  listeners.forEach((listener) => listener());
};
const storeState: any = {
  brandId: null,
  activeRoomId: null,
  nodes: [] as any[],
  edges: [] as any[],
  defaultEdgeType: 'bezier',
  saveTrigger: 0,
  setNodes: (next: any) => {
    storeState.nodes = typeof next === 'function' ? next(storeState.nodes) : next;
    emit();
  },
  setEdges: (next: any) => {
    storeState.edges = typeof next === 'function' ? next(storeState.edges) : next;
    emit();
  },
  getDeletedNodeIds: () => [] as string[],
  getDeletedEdgeIds: () => [] as string[],
  clearDeletedIds: () => {},
  triggerSave: () => {
    storeState.saveTrigger += 1;
    emit();
  },
  resetForRoomSwitch: () => {
    storeState.nodes = [];
    storeState.edges = [];
    storeState.saveTrigger = 0;
    emit();
  },
};

const useStudioStoreMock: any = (selector?: (state: any) => any) =>
  useSyncExternalStore(
    (onChange: () => void) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => (selector ? selector(storeState) : storeState),
    () => (selector ? selector(storeState) : storeState),
  );
useStudioStoreMock.getState = () => storeState;

mock.module('@/StudioCanvas/stores/useStudioStore', () => ({
  useStudioStore: useStudioStoreMock,
}));

const appliedNode = {
  id: 'applied-1',
  type: 'string',
  position: { x: 0, y: 0 },
  data: { value: 'workflow applied while the room was still loading' },
};

const roomOneSession = {
  brand_profile_id: 'brand-1',
  room_id: 'room-1',
  nodes: [],
  edges: [],
  updated_at: '2026-08-24T00:00:00.000Z',
  revision: 3,
};

const canvasWrites = () => writes.filter((write) => write.payload?.room_id !== undefined);
const persistedNodeIds = () =>
  (canvasWrites().at(-1)?.payload?.nodes ?? []).map((node: any) => node.id);

describe('useCanvasRealtime — first write into a room with no canvas_sessions row', () => {
  beforeEach(() => {
    reads = [];
    writes = [];
    writeResponse = { updated_at: '2026-08-24T01:00:00.000Z', revision: 1, editor_session_id: 's' };
    readGate = null;
    releaseRead = null;
    listeners.clear();
    storeState.nodes = [];
    storeState.edges = [];
    storeState.saveTrigger = 0;
    mockChannel.send.mockClear();
    mockChannel.on.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('persists a write made during a bootstrap that never flips isLoading', async () => {
    reads = [roomOneSession, null];

    const { rerender, result } = renderHook(
      ({ roomId }: { roomId: string }) => useCanvasRealtime('brand-1', roomId),
      { initialProps: { roomId: 'room-1' } },
    );

    // room-1's read has resolved; its deferred "loading finished" timer is still pending.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    writes = [];
    openReadGate();

    await act(async () => {
      rerender({ roomId: 'room-2' });
      await Promise.resolve();
    });

    // room-1's timer fires while room-2 is still loading, so room-2's own
    // setIsLoading(false) below is a no-op and produces no edge to drain on.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 140));
    });
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      storeState.nodes = [appliedNode];
      storeState.triggerSave();
      await Promise.resolve();
    });

    await act(async () => {
      releaseRead?.();
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(canvasWrites().length).toBeGreaterThan(0);
    expect(persistedNodeIds()).toContain('applied-1');
  });

  it('persists a write made during the initial bootstrap of a fresh room', async () => {
    reads = [null];
    openReadGate();

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      storeState.nodes = [appliedNode];
      storeState.triggerSave();
      await Promise.resolve();
    });

    await act(async () => {
      releaseRead?.();
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    expect(canvasWrites().length).toBeGreaterThan(0);
    expect(persistedNodeIds()).toContain('applied-1');
  });

  it('adopts local work as the first revision when the room has no row', async () => {
    reads = [null];
    storeState.nodes = [appliedNode];

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    expect(canvasWrites().map((write) => write.kind)).toContain('insert');
    expect(persistedNodeIds()).toContain('applied-1');
  });

  it('writes nothing when a room with no row bootstraps with nothing to save', async () => {
    reads = [null];

    renderHook(() => useCanvasRealtime('brand-1', 'room-1'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    expect(canvasWrites()).toHaveLength(0);
  });
});
