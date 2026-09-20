import type { CanvasRunNodeEvent, CanvasRunResult } from '@continuum/contracts';
import { canvasRunNodeEventsSchema } from '@continuum/contracts';

/**
 * Server-side timing for a canvas run.
 *
 * 3,907 asset versions in 30 days, and not one run record with a duration: `executeWorkflow`
 * read a bearer token from Supabase and touched no table, so a user pressing Run Flow left no
 * trace at all. This records one — on brand_profiles.canvas_run_requests, the row the MCP run
 * path already uses, rather than a second table.
 *
 * Three rules, in priority order:
 *
 *  1. **The user's run always wins.** Telemetry never blocks and never throws into the
 *     executor. `start` is synchronous and the insert races the run; every later write chains
 *     off that promise. A room already holding an active MCP run makes the insert collide with
 *     `canvas_run_requests_one_active_per_room` — that degrades telemetry to nothing and the
 *     run proceeds exactly as before.
 *  2. **Attach, never mint, when someone else owns the row.** The same executor runs MCP-issued
 *     requests; there it stamps `started_at` on the existing row and leaves `status` to the
 *     caller, so the two originators can never fight over one room.
 *  3. **Keep the heartbeat moving.** `reap_abandoned_canvas_run_requests` errors a pending or
 *     running row whose `updated_at` is 16 minutes stale, and a video node can outlast that on
 *     its own. Every flush is an UPDATE, so the periodic flush IS the heartbeat — one mechanism,
 *     both jobs.
 */

export interface CanvasRunPatch {
  node_events: CanvasRunNodeEvent[];
  finished_at?: string;
  status?: 'done' | 'error';
  result?: CanvasRunResult;
}

export interface CanvasRunTelemetryStore {
  /** Insert the run row. Resolves null when the room already holds an active run. */
  open(input: {
    brandProfileId: string;
    roomId: string;
    nodeIds: string[];
    startedAt: string;
  }): Promise<string | null>;
  /** Stamp `started_at` on a row another originator owns; hands back the events already on it. */
  attach(runRequestId: string, startedAt: string): Promise<CanvasRunNodeEvent[]>;
  /** One UPDATE. Doubles as the heartbeat — the table's trigger moves `updated_at`. */
  save(runRequestId: string, patch: CanvasRunPatch): Promise<void>;
}

export interface CanvasRunTelemetry {
  nodeStarted(nodeId: string, nodeType: string | null): void;
  nodeSettled(nodeId: string, status: 'completed' | 'failed' | 'awaiting', error?: string): void;
  /** Terminal write: the events, `finished_at`, and — when this run owns the row — its status. */
  finish(result: CanvasRunResult | null): Promise<void>;
}

export interface StartCanvasRunTelemetryOptions {
  store: CanvasRunTelemetryStore;
  brandProfileId: string;
  roomId: string;
  nodeIds: string[];
  /** Set when executing a run request another originator minted (the MCP path). */
  runRequestId?: string;
  now?: () => number;
  heartbeatMs?: number;
  /** Injected so tests do not need timers; defaults to the browser's. */
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
}

/** Well under the sweeper's 16 minutes, and cheap: one bounded UPDATE. */
export const CANVAS_RUN_HEARTBEAT_MS = 60_000;

/** Used when there is no room to record against. Every method is a no-op. */
export const NO_CANVAS_RUN_TELEMETRY: CanvasRunTelemetry = {
  nodeStarted: () => {},
  nodeSettled: () => {},
  finish: async () => {},
};

const defaultSchedule = (fn: () => void, ms: number) => {
  const handle = setInterval(fn, ms);
  return { cancel: () => clearInterval(handle) };
};

export function startCanvasRunTelemetry(
  options: StartCanvasRunTelemetryOptions,
): CanvasRunTelemetry {
  const {
    store,
    brandProfileId,
    roomId,
    nodeIds,
    runRequestId,
    now = () => Date.now(),
    heartbeatMs = CANVAS_RUN_HEARTBEAT_MS,
    schedule = defaultSchedule,
  } = options;

  const startedAtMs = now();
  const startedAt = new Date(startedAtMs).toISOString();
  // Node id -> its event, so a second status for the same node updates rather than appends.
  const events = new Map<string, CanvasRunNodeEvent>();
  const startedMs = new Map<string, number>();
  let existing: CanvasRunNodeEvent[] = [];
  let finished = false;

  // Never awaited by the executor. A rejection here disables telemetry; it never reaches
  // the run, because a user's Run Flow press is not allowed to fail over a missing row.
  const idPromise: Promise<string | null> = (
    runRequestId
      ? store.attach(runRequestId, startedAt).then((prior) => {
          existing = prior;
          return runRequestId;
        })
      : store.open({ brandProfileId, roomId, nodeIds, startedAt })
  ).catch((error) => {
    console.warn('[studio] run telemetry unavailable', error);
    return null;
  });

  const snapshot = (): CanvasRunNodeEvent[] => {
    const mine = new Set(events.keys());
    return [...existing.filter((event) => !mine.has(event.node_id)), ...events.values()];
  };

  const write = async (patch: Omit<CanvasRunPatch, 'node_events'>): Promise<void> => {
    const id = await idPromise;
    if (!id) return;
    try {
      await store.save(id, { node_events: snapshot(), ...patch });
    } catch (error) {
      console.warn('[studio] run telemetry write failed', error);
    }
  };

  const heartbeat = schedule(() => {
    if (!finished) void write({});
  }, heartbeatMs);

  return {
    nodeStarted(nodeId, nodeType) {
      startedMs.set(nodeId, now());
      events.set(nodeId, {
        node_id: nodeId,
        node_type: nodeType,
        status: 'running',
        started_at: new Date(now()).toISOString(),
        finished_at: null,
        duration_ms: null,
      });
    },
    nodeSettled(nodeId, status, error) {
      // A node can settle without ever starting: the executor fails or parks everything
      // still pending when nothing is left to run. Dropping those made a run where NOTHING
      // ran look `done`, because the terminal status is read off these events.
      const event = events.get(nodeId) ?? {
        node_id: nodeId,
        node_type: null,
        status,
        started_at: new Date(now()).toISOString(),
        finished_at: null,
        duration_ms: null,
      };
      const endedMs = now();
      events.set(nodeId, {
        ...event,
        status,
        finished_at: new Date(endedMs).toISOString(),
        duration_ms: endedMs - (startedMs.get(nodeId) ?? endedMs),
        ...(error ? { error } : {}),
      });
    },
    async finish(result) {
      if (finished) return;
      finished = true;
      heartbeat.cancel();
      const failed = [...events.values()].some((event) => event.status === 'failed');
      await write({
        finished_at: new Date(now()).toISOString(),
        // A run request another originator minted settles its OWN status — the MCP path
        // writes `result` through its store once every requested node has run. Claiming it
        // here would settle the request before the rest of its nodes had executed.
        ...(runRequestId ? {} : { status: failed ? 'error' : 'done' }),
        ...(runRequestId || !result ? {} : { result }),
      });
    },
  };
}

/**
 * The live adapter. Supabase is imported lazily for the same reason the executor does it:
 * this module is unit-tested against an injected store and must not drag the browser client
 * into that import graph.
 */
export function createSupabaseCanvasRunTelemetryStore(): CanvasRunTelemetryStore {
  const table = async () => {
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
    const supabase = createSupabaseBrowserClient();
    return {
      supabase,
      rows: () => supabase.schema('brand_profiles').from('canvas_run_requests'),
    };
  };

  return {
    async open({ brandProfileId, roomId, nodeIds, startedAt }) {
      const { supabase, rows } = await table();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const requestedBy = session?.user?.id;
      if (!requestedBy) {
        // Never silent: a missing session is indistinguishable from "no run happened"
        // in the row count, which is exactly how this degradation hid before.
        console.warn('[studio] run telemetry off — no authenticated session');
        return null;
      }

      const { data, error } = await rows()
        .insert({
          brand_profile_id: brandProfileId,
          room_id: roomId,
          requested_by: requestedBy,
          node_ids: nodeIds,
          // 'running', never 'pending': a pending INSERT is the MCP signal the open canvas
          // listens for, and minting one here would make the canvas execute its own run again.
          status: 'running',
          origin: 'canvas',
          started_at: startedAt,
        })
        .select('id')
        .single();

      // 23505 is canvas_run_requests_one_active_per_room: an MCP run already holds this
      // room. The user's run is not refused over telemetry — it runs unrecorded.
      if (error) {
        if (error.code === '23505') return null;
        throw new Error(`Could not open canvas run telemetry: ${error.message}`);
      }
      return data.id;
    },

    async attach(runRequestId, startedAt) {
      const { rows } = await table();
      // Only the FIRST executor pass stamps the start; a run request naming several nodes
      // drives the executor once per node and each pass would otherwise reset it.
      await rows().update({ started_at: startedAt }).eq('id', runRequestId).is('started_at', null);
      const { data } = await rows().select('node_events').eq('id', runRequestId).maybeSingle();
      const parsed = canvasRunNodeEventsSchema.safeParse(data?.node_events);
      return parsed.success ? parsed.data : [];
    },

    async save(runRequestId, patch) {
      const { rows } = await table();
      const { error } = await rows().update(patch).eq('id', runRequestId);
      if (error) throw new Error(`Could not record canvas run telemetry: ${error.message}`);
    },
  };
}
