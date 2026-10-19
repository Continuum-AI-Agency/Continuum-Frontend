import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  CHAT_MEDIA_SIGN_ROUTE,
  type ChatMediaSignRequest,
  chatMediaRefKey,
  HEADLESS_BATCH_STATUS_ROUTE,
  HEADLESS_CAST_APPROVE_ROUTE,
  type HeadlessBatchItem,
  type HeadlessBatchStatus,
  headlessBatchStatusSchema,
} from '@continuum/contracts';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  timeoutManager,
} from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api/errors';
import type { ReadHeadlessBatchStatus } from '@/lib/organic-agent/headlessBatch';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

// happy-dom's IntersectionObserver never reports: a card here is on screen until a test scrolls it
// away with setOnScreen.
const realIntersectionObserver = globalThis.IntersectionObserver;
let onScreen = true;
const observing = new Map<object, { callback: IntersectionObserverCallback; target: Element }>();
globalThis.IntersectionObserver = class {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    observing.set(this, { callback: this.callback, target });
    this.callback(
      [{ isIntersecting: onScreen, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {
    observing.delete(this);
  }
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;
const setOnScreen = (visible: boolean) =>
  act(() => {
    onScreen = visible;
    for (const [observer, { callback, target }] of observing) {
      callback(
        [{ isIntersecting: visible, target } as IntersectionObserverEntry],
        observer as IntersectionObserver,
      );
    }
  });

// TanStack's refresh intervals are captured, not run: a test reads the delay each card asked for
// and fires them by hand, so a 10-60 s schedule is checked without waiting or faking the clock.
type TimerProvider = Parameters<typeof timeoutManager.setTimeoutProvider>[0];
const intervals = new Map<number, { callback: () => void; delay: number }>();
let nextIntervalId = 1;
const systemTimers: TimerProvider = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (id) => clearTimeout(id as Parameters<typeof clearTimeout>[0]),
  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (id) => clearInterval(id as Parameters<typeof clearInterval>[0]),
};
timeoutManager.setTimeoutProvider({
  ...systemTimers,
  setInterval: (callback, delay) => {
    const id = nextIntervalId++;
    intervals.set(id, { callback, delay });
    return id;
  },
  clearInterval: (id) => {
    intervals.delete(Number(id));
  },
});
focusManager.setFocused(true);

const BRAND = '11111111-1111-4111-8111-111111111111';
const BATCH = '22222222-2222-4222-8222-222222222222';
const ASSET = '44444444-4444-4444-8444-444444444444';
const PERSON = '55555555-5555-4555-8555-555555555555';
const PLACE = '77777777-7777-4777-8777-777777777777';
const draftId = (index: number) => `33333333-3333-4333-8333-33333333333${index}`;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function item(index: number, overrides: Partial<HeadlessBatchItem> = {}): HeadlessBatchItem {
  return {
    index,
    format: 'reel',
    draftId: draftId(index),
    jobId: null,
    state: 'queued',
    reason: null,
    holdUsd: 9,
    redirected: false,
    cover: null,
    outputCount: 1,
    ...overrides,
  };
}

function batch(
  items: HeadlessBatchItem[],
  cast: HeadlessBatchStatus['cast'] = { needed: false, drafts: [], approved: true },
): HeadlessBatchStatus {
  const count = (state: HeadlessBatchItem['state']) =>
    items.filter((entry) => entry.state === state).length;
  return {
    batchId: BATCH,
    brandId: BRAND,
    createdAt: '2026-10-18T10:00:00.000Z',
    capUsd: 9 * items.length,
    expectedUsd: 3.5 * items.length,
    maxUsd: 15 * items.length,
    holdUsd: 9 * items.length,
    items,
    counts: {
      queued: count('queued'),
      running: count('running'),
      needs_cast_approval: count('needs_cast_approval'),
      ready: count('ready'),
      failed: count('failed'),
    },
    cast,
    done: items.every((entry) => entry.state === 'ready' || entry.state === 'failed'),
  };
}

const cover = {
  ref: { type: 'headless' as const, assetId: ASSET },
  kind: 'video' as const,
  w: 1080,
  h: 1920,
};

// What the status route answers next; a function so a test can throw or change it mid-run.
let answer: () => HeadlessBatchStatus = () => batch([item(0, { state: 'running' })]);
const approved = () => ({ approved: [], resumedJobIds: [], releasedItems: 1 });
let approveAnswer: () => unknown = approved;
const requestMock = mock(async (args: { path: string; method?: string; body?: unknown }) => {
  if (args.path.startsWith(HEADLESS_BATCH_STATUS_ROUTE)) return answer();
  if (args.path === HEADLESS_CAST_APPROVE_ROUTE) return approveAnswer();
  if (args.path === CHAT_MEDIA_SIGN_ROUTE) {
    const { refs } = args.body as ChatMediaSignRequest;
    return {
      items: refs.map((ref) => ({
        key: chatMediaRefKey(ref),
        thumbUrl: `https://storage.test/${chatMediaRefKey(ref)}`,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      })),
    };
  }
  throw new Error(`unexpected request ${args.path}`);
});
mock.module('@/lib/api/http', () => ({ request: requestMock, http: { request: requestMock } }));

const { HeadlessBatchCard } = await import('./HeadlessBatchCard');
const { headlessBatchQueryKey } = await import('@/lib/organic-agent/headlessBatch');

afterAll(() => {
  mock.restore();
  timeoutManager.setTimeoutProvider(systemTimers);
  focusManager.setFocused(undefined);
  globalThis.IntersectionObserver = realIntersectionObserver;
});

const calls = (path: string) =>
  requestMock.mock.calls.filter(([args]) => args.path.startsWith(path)).map(([args]) => args);
const statusCalls = () => calls(HEADLESS_BATCH_STATUS_ROUTE);
const delays = () => [...intervals.values()].map((entry) => entry.delay);
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));

// Fires every interval due now, the way the timers would: one cleared meanwhile does not fire.
async function refresh() {
  await act(async () => {
    for (const [id, entry] of [...intervals]) {
      if (intervals.has(id)) entry.callback();
    }
  });
  await settle();
}

function renderCards(statuses: ReadHeadlessBatchStatus[], onOpenDraft = mock(() => {})) {
  const client = new QueryClient();
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const cards = (list: ReadHeadlessBatchStatus[]) =>
    wrap(
      list.map((status, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: two cards of one batch, as two turns render them.
        <HeadlessBatchCard key={i} brandId={BRAND} status={status} onOpenDraft={onOpenDraft} />
      )),
    );
  const view = render(cards(statuses));
  return {
    ...view,
    client,
    onOpenDraft,
    rerenderCards: (list: ReadHeadlessBatchStatus[]) => view.rerender(cards(list)),
  };
}

const castDrafts = [
  { elementId: PERSON, revision: 1, kind: 'character', summary: 'A barista in her 30s' },
  { elementId: PLACE, revision: 1, kind: 'scene', summary: 'A sunlit cafe counter' },
];
const waitingOnCast = () =>
  batch([item(0, { state: 'needs_cast_approval' }), item(1, { state: 'needs_cast_approval' })], {
    needed: true,
    approved: false,
    drafts: castDrafts,
  });
const castApproved = () =>
  batch([item(0, { state: 'queued' }), item(1, { state: 'queued' })], {
    needed: true,
    approved: true,
    drafts: [],
  });
const slot = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-slot="${name}"]`) as HTMLElement | null;

describe('HeadlessBatchCard', () => {
  beforeEach(() => {
    requestMock.mockClear();
    intervals.clear();
    onScreen = true;
    answer = () => batch([item(0, { state: 'running' })]);
    approveAnswer = approved;
  });
  afterEach(() => cleanup());

  it('shows every count, one row per piece in plain words, and no ids', async () => {
    const frame = batch([
      item(0, { state: 'ready', cover }),
      item(1, {
        format: 'still_set',
        state: 'failed',
        reason: 'nothing_planned',
        redirected: true,
      }),
      item(2, { state: 'running' }),
      item(3, { format: 'still_set', state: 'ready', outputCount: 4 }),
      item(4, { state: 'needs_cast_approval', reason: `waiting on the cast approval ${BATCH}` }),
      item(5, { state: 'queued', reason: "waiting on the first piece's cast" }),
    ]);
    answer = () => frame;
    const { container, getByRole } = renderCards([frame]);

    const card = slot(container, 'headless-batch-card') as HTMLElement;
    expect(card.tagName).toBe('SECTION');
    expect(card.dataset.batchId).toBe(BATCH);
    expect(card.dataset.done).toBe('false');
    expect(card.getAttribute('aria-label')).toBe('Batch of 6 pieces');
    const progress = slot(container, 'headless-batch-progress') as HTMLElement;
    expect(progress.getAttribute('role')).toBe('status');
    expect(progress.getAttribute('aria-live')).toBe('polite');
    expect(progress.textContent).toBe(
      '2 ready · 1 failed · 1 running · 1 queued · 1 needs the cast',
    );
    expect(getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');

    const rows = [...container.querySelectorAll('li[data-slot="headless-batch-item"]')];
    expect(rows.map((row) => row.getAttribute('data-item-state'))).toEqual([
      'ready',
      'failed',
      'running',
      'ready',
      'needs_cast_approval',
      'queued',
    ]);
    const reason = (row: Element | undefined) =>
      row?.querySelector('[data-slot="headless-batch-item-reason"]')?.textContent ?? null;
    expect(rows[1]?.textContent).toContain('Still set 2');
    expect(rows[1]?.textContent).toContain('Second pass');
    expect(reason(rows[1])).toBe('The director found nothing to make from this brief.');
    expect(rows[3]?.textContent).toContain('+3 slides');
    // A wait is its state label; only the first piece's cast is worth a line of its own.
    expect(reason(rows[4])).toBeNull();
    expect(rows[4]?.textContent).toContain('Waiting on the cast');
    expect(reason(rows[5])).toBe("Starts once the first piece's cast is approved.");

    // Every row holds the same output column from the start: labels line up, nothing moves.
    const outputs = [
      ...container.querySelectorAll<HTMLElement>('[data-slot="headless-batch-item-output"]'),
    ];
    expect(outputs.map((output) => output.style.width)).toEqual(Array(6).fill('58px'));
    expect((outputs[0]?.firstElementChild as HTMLElement).style.width).toBe('41px');
    expect((outputs[1]?.firstElementChild as HTMLElement).style.width).toBe('58px');
    const strip = rows[0]?.querySelector(
      `[data-slot="headless-batch-item-output"] figure[data-slot="media-strip"][data-strip-id="headless-batch:${BATCH}:0"]`,
    );
    expect(strip?.querySelector(`li[data-media-key="headless:${ASSET}"]`)).toBeTruthy();
    // Ready without a cover keeps the placeholder.
    expect(rows[3]?.querySelector('figure')).toBeNull();

    await waitFor(() => expect(statusCalls()).toHaveLength(1));
    expect(card.textContent).not.toMatch(UUID);
  });

  it('opens a piece in the planner, its label in the button name', () => {
    const { getByRole, onOpenDraft } = renderCards([batch([item(0), item(1)])]);
    fireEvent.click(getByRole('button', { name: 'Open draft for Reel 2' }));
    expect(onOpenDraft).toHaveBeenCalledWith(draftId(1));
  });

  it('asks every 10-15 s while pieces move, backing off to a minute only once nothing does', async () => {
    answer = () => batch([item(0, { state: 'running' })]);
    renderCards([batch([item(0)])]);

    await waitFor(() => expect(statusCalls()).toHaveLength(1));
    expect(statusCalls()[0]?.path).toBe(
      `${HEADLESS_BATCH_STATUS_ROUTE}?brandId=${BRAND}&batchId=${BATCH}`,
    );
    await settle();
    expect(statusCalls()).toHaveLength(1);
    expect(delays()).toEqual([10_000]);
    await refresh();
    expect(delays()).toEqual([15_000]);
    await refresh();
    expect(delays()).toEqual([15_000]);

    answer = waitingOnCast;
    await refresh();
    expect(delays()).toEqual([10_000]);
    await refresh();
    expect(delays()).toEqual([15_000]);
    await refresh();
    expect(delays()).toEqual([22_500]);
    expect(statusCalls()).toHaveLength(6);

    answer = () => batch([item(0, { state: 'ready', cover })]);
    await refresh();
    // It finished: the card shows it and stops asking.
    expect(statusCalls()).toHaveLength(7);
    expect(delays()).toEqual([]);
    await refresh();
    expect(statusCalls()).toHaveLength(7);
  });

  it('two cards of one batch share one request per refresh and one live region', async () => {
    const frame = batch([item(0), item(1)]);
    const { container } = renderCards([frame, frame]);
    await waitFor(() => expect(statusCalls()).toHaveLength(1));
    await settle();
    expect(statusCalls()).toHaveLength(1);
    // Both cards poll, and both fire: the shared query joins the second into the first.
    expect(delays()).toEqual([10_000, 10_000]);

    await refresh();
    expect(statusCalls()).toHaveLength(2);
    await refresh();
    expect(statusCalls()).toHaveLength(3);
    expect(
      [...container.querySelectorAll('[data-count-state="running"]')].map((n) => n.textContent),
    ).toEqual(['1 running', '1 running']);
    expect(
      [...container.querySelectorAll('[data-slot="headless-batch-progress"]')].map((n) => [
        n.getAttribute('role'),
        n.getAttribute('aria-live'),
      ]),
    ).toEqual([
      ['status', 'polite'],
      [null, null],
    ]);
  });

  it('never asks about a batch whose frame is already done', async () => {
    renderCards([batch([item(0, { state: 'ready', cover }), item(1, { state: 'failed' })])]);
    await settle();
    expect(statusCalls()).toHaveLength(0);
    expect(delays()).toEqual([]);
  });

  it('a frame further along replaces what the card shows', async () => {
    const { container, rerenderCards } = renderCards([batch([item(0)])]);
    await waitFor(() => expect(statusCalls()).toHaveLength(1));
    rerenderCards([batch([item(0, { state: 'failed', reason: 'render_timeout' })])]);
    await waitFor(() =>
      expect(slot(container, 'headless-batch-card')?.getAttribute('data-done')).toBe('true'),
    );
    expect(container.textContent).toContain('It could not be made.');
    await refresh();
    expect(statusCalls()).toHaveLength(1);
  });

  it('a frame behind what the cards show is ignored, at mount and later', async () => {
    answer = () => batch([item(0, { state: 'ready', cover }), item(1, { state: 'running' })]);
    const { container, rerenderCards } = renderCards([batch([item(0), item(1)])]);
    const ready = () =>
      [...container.querySelectorAll('[data-count-state="ready"]')].map((n) => n.textContent);
    await waitFor(() => expect(ready()).toEqual(['1 ready']));

    rerenderCards([batch([item(0), item(1)])]);
    await settle();
    expect(ready()).toEqual(['1 ready']);

    rerenderCards([batch([item(0), item(1)]), batch([item(0), item(1)])]);
    await settle();
    expect(ready()).toEqual(['1 ready', '1 ready']);
  });

  it('backs off on a passing error, and stops for good on a 404', async () => {
    answer = () => {
      throw new ApiError('upstream', 502);
    };
    const { container } = renderCards([batch([item(0)])]);
    await waitFor(() => expect(statusCalls()).toHaveLength(1));
    await settle();
    expect(delays()).toEqual([15_000]);
    expect(slot(container, 'headless-batch-unreadable')).toBeNull();

    answer = () => {
      throw new ApiError('headless_batch_not_found', 404);
    };
    await refresh();
    expect(statusCalls()).toHaveLength(2);
    expect(delays()).toEqual([]);
    expect(slot(container, 'headless-batch-unreadable')?.textContent).toBe(
      "This batch can't be read any more.",
    );
    await refresh();
    expect(statusCalls()).toHaveLength(2);
  });

  it('stops for good on a status it cannot parse', async () => {
    answer = () => headlessBatchStatusSchema.parse({ batchId: BATCH });
    const { container } = renderCards([batch([item(0)])]);
    await waitFor(() => expect(slot(container, 'headless-batch-unreadable')).toBeTruthy());
    expect(statusCalls()).toHaveLength(1);
    expect(delays()).toEqual([]);
    // The last status it could read stays on screen.
    expect(container.querySelectorAll('li[data-slot="headless-batch-item"]')).toHaveLength(1);
  });

  it('approves the drafted cast once, even on a double click, then reads the batch again', async () => {
    answer = waitingOnCast;
    const { container, getByRole } = renderCards([waitingOnCast()]);
    await waitFor(() => expect(statusCalls()).toHaveLength(1));

    const cast = slot(container, 'headless-batch-cast') as HTMLElement;
    expect(cast.textContent).toContain('Person');
    expect(cast.textContent).toContain('A barista in her 30s');
    expect(cast.textContent).toContain('Place');
    // Below the list, so it coming and going never moves a row.
    const list = getByRole('list', { name: 'Pieces' });
    expect(list.nextElementSibling).toBe(cast);
    const button = getByRole('button', { name: /^Approve cast/ });
    expect(button.getAttribute('data-slot')).toBe('headless-batch-approve-cast');

    answer = castApproved;
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(statusCalls()).toHaveLength(2));
    await settle();

    expect(calls(HEADLESS_CAST_APPROVE_ROUTE)).toEqual([
      {
        path: HEADLESS_CAST_APPROVE_ROUTE,
        method: 'POST',
        body: { brandId: BRAND, batchId: BATCH, draftElementIds: [PERSON, PLACE] },
        schema: expect.anything(),
      },
    ]);
    expect(statusCalls()).toHaveLength(2);
    expect(slot(container, 'headless-batch-cast')).toBeNull();
    expect(
      [...container.querySelectorAll('[role="status"]')].map((node) => node.textContent),
    ).toContain('Cast approved. The waiting pieces continue.');
    // The pressed button is gone; focus lands on the card's progress line, not the page.
    expect(document.activeElement).toBe(slot(container, 'headless-batch-progress'));
    expect(container.textContent).not.toMatch(UUID);
  });

  it('two cards of one batch send one cast approval between them', async () => {
    answer = waitingOnCast;
    let release: () => void = () => {};
    approveAnswer = () =>
      new Promise((resolve) => {
        release = () => resolve(approved());
      });
    const { container, getAllByRole } = renderCards([waitingOnCast(), waitingOnCast()]);
    await waitFor(() => expect(statusCalls()).toHaveLength(1));

    const [first, second] = getAllByRole('button', { name: /^Approve cast/ });
    fireEvent.click(first as HTMLElement);
    fireEvent.click(second as HTMLElement);
    await waitFor(() =>
      expect(
        getAllByRole('button', { name: /^Approve cast/ }).map(
          (b) => (b as HTMLButtonElement).disabled,
        ),
      ).toEqual([true, true]),
    );
    answer = castApproved;
    await act(async () => release());
    await settle();

    expect(calls(HEADLESS_CAST_APPROVE_ROUTE)).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="headless-batch-cast"]')).toHaveLength(0);
  });

  it('says when the 24 h window cannot cover the character packs', async () => {
    answer = waitingOnCast;
    approveAnswer = () => {
      throw new ApiError('invalid_cast:cast_pack_over_window', 422);
    };
    const { getByRole } = renderCards([waitingOnCast()]);
    fireEvent.click(getByRole('button', { name: /^Approve cast/ }));
    await waitFor(() =>
      expect(getByRole('alert').textContent).toBe(
        "The brand's 24 h window can't cover the character packs right now.",
      ),
    );
    expect((getByRole('button', { name: /^Approve cast/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('a piece re-parked on new drafts after an approval gets its own single approval', async () => {
    answer = waitingOnCast;
    const { container, getByRole } = renderCards([waitingOnCast()]);
    await waitFor(() => expect(statusCalls()).toHaveLength(1));
    answer = castApproved;
    fireEvent.click(getByRole('button', { name: /^Approve cast/ }));
    await waitFor(() => expect(statusCalls()).toHaveLength(2));
    await settle();
    expect(slot(container, 'headless-batch-cast')).toBeNull();

    const rider = '88888888-8888-4888-8888-888888888888';
    answer = () =>
      batch([item(0, { state: 'needs_cast_approval' }), item(1, { state: 'queued' })], {
        needed: true,
        approved: true,
        drafts: [{ elementId: rider, revision: 1, kind: 'character', summary: 'A delivery rider' }],
      });
    await refresh();
    expect(slot(container, 'headless-batch-cast')?.textContent).toContain('A delivery rider');
    // The earlier approval's line gives way to the step still to take.
    expect(container.textContent).not.toContain('Cast approved.');

    answer = castApproved;
    const button = getByRole('button', { name: /^Approve cast/ });
    fireEvent.click(button);
    fireEvent.click(button);
    await settle();
    expect(
      calls(HEADLESS_CAST_APPROVE_ROUTE).map(
        (call) => (call.body as { draftElementIds: string[] }).draftElementIds,
      ),
    ).toEqual([[PERSON, PLACE], [rider]]);
  });

  it('shows a piece in a state this build does not know yet as in progress', () => {
    const frame = batch([item(0, { state: 'running' }), item(1)]);
    const { container } = renderCards([
      { ...frame, items: [{ ...item(0), state: 'upscaling' }, item(1)] },
    ]);
    const row = container.querySelector('li[data-slot="headless-batch-item"]');
    expect(row?.getAttribute('data-item-state')).toBe('upscaling');
    expect(row?.textContent).toContain('In progress');
    expect(slot(container, 'headless-batch-progress')?.textContent).toBe(
      '0 ready · 0 failed · 1 running · 1 queued · 0 need the cast',
    );
  });

  it('shows a piece in a format this build does not know yet as a still-set-sized piece', () => {
    const frame = batch([item(0), item(1)]);
    const { container, getByRole } = renderCards([
      { ...frame, items: [item(0), { ...item(1), format: 'story' }] },
    ]);
    const row = container.querySelectorAll('li[data-slot="headless-batch-item"]')[1];
    expect(row?.getAttribute('data-item-format')).toBe('story');
    expect(row?.textContent).toContain('Piece 2');
    const box = row?.querySelector('[data-slot="headless-batch-item-output"]')?.firstElementChild;
    expect((box as HTMLElement).style.width).toBe('58px');
    expect(getByRole('button', { name: 'Open draft for Piece 2' })).toBeTruthy();
  });

  it('polls only while on screen, and asks at once on coming back after 10 s', async () => {
    const { client } = renderCards([batch([item(0)])]);
    await waitFor(() => expect(statusCalls()).toHaveLength(1));
    await settle();
    expect(delays()).toEqual([10_000]);

    // Scrolled away, or behind the hidden Agent tab.
    setOnScreen(false);
    expect(delays()).toEqual([]);
    await refresh();
    expect(statusCalls()).toHaveLength(1);

    // Back while still fresh: the schedule resumes, nothing is asked yet.
    setOnScreen(true);
    await settle();
    expect(statusCalls()).toHaveLength(1);
    expect(delays()).toEqual([10_000]);

    setOnScreen(false);
    const key = headlessBatchQueryKey(BRAND, BATCH);
    act(() => {
      client.setQueryData(key, client.getQueryData(key), { updatedAt: Date.now() - 11_000 });
    });
    setOnScreen(true);
    await waitFor(() => expect(statusCalls()).toHaveLength(2));
  });

  it('does not ask about a frame streamed just now until it goes stale', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HeadlessBatchCard brandId={BRAND} status={batch([item(0)])} live onOpenDraft={() => {}} />
      </QueryClientProvider>,
    );
    await settle();
    expect(statusCalls()).toHaveLength(0);
    expect(delays()).toEqual([10_000]);
  });

  it('five passing errors in a row are as final as a 404', async () => {
    answer = () => {
      throw new ApiError('upstream', 502);
    };
    const { container } = renderCards([batch([item(0)])]);
    await waitFor(() => expect(statusCalls()).toHaveLength(1));
    await settle();
    for (let attempt = 2; attempt <= 4; attempt++) await refresh();
    expect(slot(container, 'headless-batch-unreadable')).toBeNull();
    await refresh();
    expect(statusCalls()).toHaveLength(5);
    expect(delays()).toEqual([]);
    expect(slot(container, 'headless-batch-unreadable')).toBeTruthy();
    // Below the list, with the cast lines.
    expect(slot(container, 'headless-batch-unreadable')?.previousElementSibling?.tagName).toBe(
      'UL',
    );
  });

  it('says the cast is being drafted before there is one to approve', () => {
    const { getByText, container } = renderCards([
      batch([item(0, { state: 'running' }), item(1, { state: 'needs_cast_approval' })], {
        needed: true,
        approved: false,
        drafts: [],
      }),
    ]);
    expect(getByText('The first piece is drafting the cast.')).toBeTruthy();
    expect(slot(container, 'headless-batch-cast')).toBeNull();
  });
});
