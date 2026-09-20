import { describe, expect, it } from 'bun:test';
import type { CanvasRunNodeEvent } from '@continuum/contracts';
import {
  type CanvasRunPatch,
  type CanvasRunTelemetryStore,
  NO_CANVAS_RUN_TELEMETRY,
  startCanvasRunTelemetry,
} from './canvasRunTelemetry';

type Saved = { id: string; patch: CanvasRunPatch };

function harness(overrides: Partial<CanvasRunTelemetryStore> = {}) {
  const saves: Saved[] = [];
  const opened: unknown[] = [];
  const store: CanvasRunTelemetryStore = {
    async open(input) {
      opened.push(input);
      return 'run-1';
    },
    async attach() {
      return [];
    },
    async save(id, patch) {
      saves.push({ id, patch });
    },
    ...overrides,
  };
  let tick: (() => void) | null = null;
  let cancelled = false;
  const schedule = (fn: () => void) => {
    tick = fn;
    return {
      cancel: () => {
        cancelled = true;
      },
    };
  };
  let clock = 1_000;
  return {
    store,
    saves,
    opened,
    schedule,
    beat: () => tick?.(),
    wasCancelled: () => cancelled,
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const start = (h: ReturnType<typeof harness>, runRequestId?: string) =>
  startCanvasRunTelemetry({
    store: h.store,
    brandProfileId: 'brand-1',
    roomId: 'room-1',
    nodeIds: ['a', 'b'],
    now: h.now,
    schedule: h.schedule,
    ...(runRequestId ? { runRequestId } : {}),
  });

const lastEvents = (h: ReturnType<typeof harness>): CanvasRunNodeEvent[] =>
  h.saves.at(-1)?.patch.node_events ?? [];

describe('startCanvasRunTelemetry', () => {
  it('records each node it ran, with a real duration, and settles the run done', async () => {
    const h = harness();
    const telemetry = start(h);

    telemetry.nodeStarted('a', 'nanoGen');
    h.advance(2_500);
    telemetry.nodeSettled('a', 'completed');
    await telemetry.finish({
      executed_node_ids: ['a'],
      outputs: [{ node_id: 'a', kind: 'image' }],
    });

    expect(h.opened).toHaveLength(1);
    const patch = h.saves.at(-1)?.patch;
    expect(patch?.status).toBe('done');
    expect(patch?.finished_at).toBeTruthy();
    expect(patch?.result?.executed_node_ids).toEqual(['a']);
    expect(lastEvents(h)).toEqual([
      {
        node_id: 'a',
        node_type: 'nanoGen',
        status: 'completed',
        started_at: new Date(1_000).toISOString(),
        finished_at: new Date(3_500).toISOString(),
        duration_ms: 2_500,
      },
    ]);
  });

  it('settles a run with a failed node as an error', async () => {
    const h = harness();
    const telemetry = start(h);

    telemetry.nodeStarted('a', 'nanoGen');
    telemetry.nodeSettled('a', 'failed', 'Generation failed');
    await telemetry.finish(null);

    expect(h.saves.at(-1)?.patch.status).toBe('error');
    expect(lastEvents(h)[0]?.error).toBe('Generation failed');
  });

  // Nothing ran: every pending node was refused at readiness. The old shape dropped those
  // settles on the floor and reported the run `done`.
  it('records a node that was refused before it ever started', async () => {
    const h = harness();
    const telemetry = start(h);

    telemetry.nodeSettled('a', 'failed', 'Missing required inputs or prompt');
    await telemetry.finish(null);

    expect(h.saves.at(-1)?.patch.status).toBe('error');
    expect(lastEvents(h)).toMatchObject([
      {
        node_id: 'a',
        status: 'failed',
        duration_ms: 0,
        error: 'Missing required inputs or prompt',
      },
    ]);
  });

  // The one-active-run-per-room index is the bound on unattended MCP fan-out. A user's
  // Run Flow press must never be refused because telemetry wanted a row of its own.
  it('degrades silently when the room already holds an active run', async () => {
    const h = harness({ open: async () => null });
    const telemetry = start(h);

    telemetry.nodeStarted('a', 'nanoGen');
    telemetry.nodeSettled('a', 'completed');
    await telemetry.finish(null);

    expect(h.saves).toEqual([]);
  });

  it('never lets a store failure reach the executor', async () => {
    const h = harness({
      open: async () => {
        throw new Error('network down');
      },
    });
    const telemetry = start(h);
    telemetry.nodeStarted('a', 'nanoGen');
    await telemetry.finish(null);
    expect(h.saves).toEqual([]);
  });

  it('attaches to a run request instead of claiming its status, keeping the events already on the row', async () => {
    const prior: CanvasRunNodeEvent = {
      node_id: 'earlier',
      node_type: 'string',
      status: 'completed',
      started_at: new Date(0).toISOString(),
      finished_at: new Date(10).toISOString(),
      duration_ms: 10,
    };
    const attached: string[] = [];
    const h = harness({
      open: async () => {
        throw new Error('open must not be called when attaching');
      },
      attach: async (id) => {
        attached.push(id);
        return [prior];
      },
    });
    const telemetry = start(h, 'request-9');

    telemetry.nodeStarted('a', 'nanoGen');
    telemetry.nodeSettled('a', 'completed');
    await telemetry.finish({ executed_node_ids: ['a'], outputs: [] });

    expect(attached).toEqual(['request-9']);
    const patch = h.saves.at(-1)?.patch;
    // The request's own store settles status and result once every requested node has run.
    expect(patch?.status).toBeUndefined();
    expect(patch?.result).toBeUndefined();
    expect(patch?.finished_at).toBeTruthy();
    expect(lastEvents(h).map((event) => event.node_id)).toEqual(['earlier', 'a']);
  });

  // reap_abandoned_canvas_run_requests errors any pending/running row whose updated_at is
  // 16 minutes stale, and one video node can outlast that on its own.
  it('flushes on a beat so a long run keeps updated_at moving, and stops beating once finished', async () => {
    const h = harness();
    const telemetry = start(h);

    telemetry.nodeStarted('a', 'veoGen');
    h.beat();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.saves).toHaveLength(1);
    expect(h.saves[0]?.patch.finished_at).toBeUndefined();
    expect(lastEvents(h)[0]?.status).toBe('running');

    await telemetry.finish(null);
    expect(h.wasCancelled()).toBe(true);
  });

  it('is a no-op when there is nothing to record against', async () => {
    await NO_CANVAS_RUN_TELEMETRY.finish(null);
    NO_CANVAS_RUN_TELEMETRY.nodeStarted('a', null);
    NO_CANVAS_RUN_TELEMETRY.nodeSettled('a', 'completed');
  });
});
