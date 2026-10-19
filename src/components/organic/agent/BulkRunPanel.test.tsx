import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import {
  HEADLESS_BATCH_STATUS_ROUTE,
  type HeadlessBatchItem,
  type HeadlessBatchStatus,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import type { ParsedRunEvent } from '@/hooks/useRunEventStream';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

const BRAND = '11111111-1111-4111-8111-111111111111';
const PLAN = 'plan-bulk';
const RUN = `run_${PLAN}`;
const RUN_COMPLETED_AT = '2026-10-18T10:00:00.000000+00:00';
const PLAN_DRAFTS = [
  '33333333-3333-4333-8333-333333333331',
  '33333333-3333-4333-8333-333333333332',
];
const PLAN_BATCH = '22222222-2222-4222-8222-222222222222';

function batch(batchId: string, draftIds: string[]): HeadlessBatchStatus {
  const items: HeadlessBatchItem[] = draftIds.map((draftId, index) => ({
    index,
    format: 'reel',
    draftId,
    jobId: null,
    state: 'running',
    reason: null,
    holdUsd: 9,
    redirected: false,
    cover: null,
    outputCount: 1,
  }));
  return {
    batchId,
    brandId: BRAND,
    createdAt: '2026-10-18T10:00:01.250Z',
    capUsd: 9 * items.length,
    expectedUsd: 3.5 * items.length,
    maxUsd: 15 * items.length,
    holdUsd: 9 * items.length,
    items,
    counts: { queued: 0, running: items.length, needs_cast_approval: 0, ready: 0, failed: 0 },
    cast: { needed: false, drafts: [], approved: true },
    done: false,
  };
}
const planBatch = () => batch(PLAN_BATCH, PLAN_DRAFTS);
const notMadeYet = (): HeadlessBatchStatus => {
  throw new Error('headless_batch_not_found');
};

// What the batch route answers for the plan, one per lookup.
let answers: Array<() => HeadlessBatchStatus> = [];
const requestMock = mock(async (args: { path: string }) => {
  if (args.path.startsWith(HEADLESS_BATCH_STATUS_ROUTE)) {
    return (answers.length > 1 ? answers.shift() : answers[0])?.();
  }
  if (args.path.startsWith('/api/organic/agent/generations')) {
    return {
      summaries: [],
      window: { windowMinutes: 60, made: 0, completed: 0, failed: 0, running: 0 },
    };
  }
  throw new Error(`unexpected request ${args.path}`);
});
mock.module('@/lib/api/http', () => ({ request: requestMock, http: { request: requestMock } }));

// The run's durable log, replayed: only this test's run is faked, every other run is real.
const realRunEvents = await import('@/hooks/useRunEventStream');
mock.module('@/hooks/useRunEventStream', () => ({
  ...realRunEvents,
  useRunEventStream: (runId: string | null, onEvent: (event: ParsedRunEvent) => void) => {
    if (runId !== RUN) return realRunEvents.useRunEventStream(runId, onEvent);
    // biome-ignore lint/correctness/useHookAtTopLevel: the branch is fixed per runId.
    useEffect(() => {
      onEvent({
        seq: 9,
        eventId: `${RUN}:9`,
        type: 'run_completed',
        data: {},
        ts: RUN_COMPLETED_AT,
      });
    }, [onEvent]);
    return { status: 'completed' as const };
  },
}));

const { BulkRunPanel } = await import('./BulkRunPanel');

let client: QueryClient;
function renderPanel(expectsBatch = true) {
  client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <BulkRunPanel
        runId={RUN}
        total={2}
        brandId={BRAND}
        expectsBatch={expectsBatch}
        onOpenDraft={() => {}}
      />
    </QueryClientProvider>,
  );
}
const lookups = () =>
  requestMock.mock.calls
    .map(([args]) => args.path)
    .filter((path) => path.startsWith(HEADLESS_BATCH_STATUS_ROUTE));
const shownBatchIds = () =>
  [...document.querySelectorAll('[data-slot="headless-batch-card"]')].map((card) =>
    card.getAttribute('data-batch-id'),
  );

afterEach(() => {
  cleanup();
  client.clear();
  requestMock.mockClear();
});
afterAll(() => {
  mock.restore();
});

// A bulk plan is approved in a control turn and its batch is made after the run ends, so no
// ui.headless_batch frame reaches the chat: the card comes from the batch route, by the plan id.
describe('BulkRunPanel', () => {
  it("looks the plan's batch up by its plan once the run ends, until it is made", async () => {
    answers = [notMadeYet, planBatch];
    renderPanel();

    await waitFor(() => expect(shownBatchIds()).toEqual([PLAN_BATCH]), { timeout: 4_000 });
    expect(lookups()).toEqual([
      `${HEADLESS_BATCH_STATUS_ROUTE}?${new URLSearchParams({ brandId: BRAND, planId: PLAN })}`,
      `${HEADLESS_BATCH_STATUS_ROUTE}?${new URLSearchParams({ brandId: BRAND, planId: PLAN })}`,
    ]);
  }, 8_000);

  it('never looks for a batch when the plan gave the director no pieces', async () => {
    answers = [planBatch];
    renderPanel(false);

    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(lookups()).toEqual([]);
    expect(shownBatchIds()).toEqual([]);
  });
});
