import { describe, expect, it, mock } from 'bun:test';

// canvas-room.server.ts imports "server-only"; the focused test runner doesn't apply
// the FE preload that stubs it, so mock it here before loading the module.
mock.module('server-only', () => ({}));

const activeClient: { current: unknown } = { current: null };

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => activeClient.current,
}));

const { resolveInitialCanvasRoomId } = await import('./canvas-room.server');

type QueryResult = { data: unknown; error: unknown };

type RecordedQuery = {
  schema: string;
  table: string;
  columns?: string;
  filters: Array<[string, unknown]>;
};

type RecordedRpc = { schema: string; fn: string; args: unknown };

const EMPTY: QueryResult = { data: null, error: null };

/**
 * Structural stand-in for the PostgREST builder the resolver drives. It records the
 * schema, table and filters of every call so the assertions read the query the
 * resolver actually issued rather than a shape the test asserted into existence.
 */
function createFakeSupabase(config: {
  /** Keyed by the room id the resolver filtered on — an absent key means "no such room for this brand". */
  rooms?: Record<string, QueryResult>;
  activeView?: QueryResult;
  ensure?: QueryResult;
}) {
  const queries: RecordedQuery[] = [];
  const rpcs: RecordedRpc[] = [];

  const schema = (schemaName: string) => ({
    from(table: string) {
      const recorded: RecordedQuery = { schema: schemaName, table, filters: [] };
      queries.push(recorded);

      const builder = {
        select(columns: string) {
          recorded.columns = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          recorded.filters.push([column, value]);
          return builder;
        },
        order(column: string, options: unknown) {
          recorded.filters.push([`order:${column}`, options]);
          return builder;
        },
        limit(count: number) {
          recorded.filters.push(['limit', count]);
          return builder;
        },
        async maybeSingle(): Promise<QueryResult> {
          if (table === 'canvas_rooms') {
            const roomId = recorded.filters.find(([column]) => column === 'id')?.[1];
            return config.rooms?.[String(roomId)] ?? EMPTY;
          }
          if (table === 'canvas_active_view') {
            return config.activeView ?? EMPTY;
          }
          throw new Error(`Unexpected table in canvas room resolution: ${table}`);
        },
      };

      return builder;
    },
    async rpc(fn: string, args: unknown): Promise<QueryResult> {
      rpcs.push({ schema: schemaName, fn, args });
      return config.ensure ?? EMPTY;
    },
  });

  activeClient.current = { schema };
  return { queries, rpcs };
}

const BRAND = 'brand-1';
const room = (id: string): QueryResult => ({ data: { id }, error: null });
const tablesTouched = (queries: RecordedQuery[]) => queries.map((query) => query.table);

describe('resolveInitialCanvasRoomId', () => {
  it('falls back to ensure_default_canvas_room when the active view names a room the brand no longer owns', async () => {
    // canvas_active_view carries no foreign key on room_id, so deleting a room (or a
    // brand switch racing the presence heartbeat) leaves a row still naming it. Handing
    // that id to the canvas violates canvas_sessions_room_id_fkey on the first autosave.
    const { queries, rpcs } = createFakeSupabase({
      rooms: {},
      activeView: { data: { room_id: 'dead-room' }, error: null },
      ensure: { data: 'live-room', error: null },
    });

    expect(await resolveInitialCanvasRoomId(BRAND)).toBe('live-room');

    // The stale id was proven against canvas_rooms, scoped to the active brand.
    const proof = queries.find((query) => query.table === 'canvas_rooms');
    expect(proof?.schema).toBe('brand_profiles');
    expect(proof?.filters).toEqual([
      ['brand_profile_id', BRAND],
      ['id', 'dead-room'],
    ]);
    expect(rpcs).toEqual([
      {
        schema: 'brand_profiles',
        fn: 'ensure_default_canvas_room',
        args: { p_brand_profile_id: BRAND },
      },
    ]);
  });

  it('returns the active view room when it still belongs to the brand', async () => {
    const { queries, rpcs } = createFakeSupabase({
      rooms: { 'live-room': room('live-room') },
      activeView: { data: { room_id: 'live-room' }, error: null },
      ensure: { data: 'other-room', error: null },
    });

    expect(await resolveInitialCanvasRoomId(BRAND)).toBe('live-room');
    expect(tablesTouched(queries)).toEqual(['canvas_active_view', 'canvas_rooms']);
    expect(rpcs).toEqual([]);
  });

  it('prefers a validated preferred room over the active view', async () => {
    const { queries, rpcs } = createFakeSupabase({
      rooms: { 'preferred-room': room('preferred-room') },
      activeView: { data: { room_id: 'last-seen-room' }, error: null },
      ensure: { data: 'default-room', error: null },
    });

    expect(await resolveInitialCanvasRoomId(BRAND, 'preferred-room')).toBe('preferred-room');
    expect(tablesTouched(queries)).toEqual(['canvas_rooms']);
    expect(rpcs).toEqual([]);
  });

  it('ignores a preferred room owned by another brand and uses the valid active view', async () => {
    const { queries } = createFakeSupabase({
      rooms: { 'live-room': room('live-room') },
      activeView: { data: { room_id: 'live-room' }, error: null },
      ensure: { data: 'default-room', error: null },
    });

    expect(await resolveInitialCanvasRoomId(BRAND, 'foreign-room')).toBe('live-room');
    expect(tablesTouched(queries)).toEqual(['canvas_rooms', 'canvas_active_view', 'canvas_rooms']);
  });

  it('ensures a default workspace when the brand has no active view', async () => {
    const { rpcs } = createFakeSupabase({
      activeView: EMPTY,
      ensure: { data: 'default-room', error: null },
    });

    expect(await resolveInitialCanvasRoomId(BRAND)).toBe('default-room');
    expect(rpcs).toHaveLength(1);
  });

  it('throws when the default workspace cannot be ensured', async () => {
    createFakeSupabase({
      activeView: EMPTY,
      ensure: { data: null, error: { message: 'no brand access to brand-1' } },
    });

    await expect(resolveInitialCanvasRoomId(BRAND)).rejects.toThrow('no brand access to brand-1');
  });

  it('rejects a missing brand profile id before touching Supabase', async () => {
    activeClient.current = null;

    await expect(resolveInitialCanvasRoomId('')).rejects.toThrow(
      'resolveInitialCanvasRoomId requires a brand profile id',
    );
  });
});
