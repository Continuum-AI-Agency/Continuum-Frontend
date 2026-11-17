// A turn whose connection breaks must not lose the user's message, must not paint the answer
// under the wrong question, and must not keep the transcript in an order the server disagrees
// with. These drive the real hook against a fake Backend that keeps a durable run log with the
// SAME replay contract as the real one (`after_seq` is exclusive: it returns seq > after_seq),
// and the real reducer through the same actions the panel dispatches.

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(async (_options: Record<string, unknown>): Promise<unknown> => ({}));
mock.module('@/lib/api/http', () => ({
  request: requestMock,
  http: { request: requestMock },
}));

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { restoreSessionFromMessages } from '@/components/organic/agent/restoreSession';
import type { AgentChatInput } from '@/components/organic/agent/types';
import {
  initialPanelState,
  type PanelAction,
  type PanelState,
  panelReducer,
} from '@/components/organic/agent/useOrganicAgentReducer';
import { CONNECTION_LOST_MESSAGE, useOrganicAgentStream } from '@/hooks/useOrganicAgentStream';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { fetchOrganicSessionMessagePage } from '@/lib/organic/agent-sessions';

const RUN_ID = 'run_recovery_1';
const SESSION_ID = 'sess_recovery';
const encoder = new TextEncoder();

type Frame = { type: string; seq: number; data: Record<string, unknown> };

const chatStarted = (userMessageId?: string): Frame => ({
  type: 'agent.chat_started',
  seq: 0,
  data: { runId: RUN_ID, sessionId: SESSION_ID, ...(userMessageId ? { userMessageId } : {}) },
});
const delta = (seq: number, text: string): Frame => ({
  type: 'response.output_text.delta',
  seq,
  data: { delta: text },
});
const done = (seq: number): Frame => ({ type: 'response.done', seq, data: {} });

// Pull-based: one frame per read, then close or fail — how a socket actually drops mid-stream.
const streamOf = (frames: Frame[], opts?: { failAfter?: boolean }): ReadableStream<Uint8Array> => {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < frames.length) {
        controller.enqueue(encoder.encode(`${JSON.stringify(frames[index])}\n`));
        index += 1;
        return;
      }
      if (opts?.failAfter)
        controller.error(new Error('proxy cut the stream at its duration limit'));
      else controller.close();
    },
  });
};

const okResponse = (body: ReadableStream<Uint8Array>): Response =>
  ({ ok: true, status: 200, body, text: async () => '' }) as unknown as Response;
const failedResponse = (status: number): Response =>
  ({ ok: false, status, body: null, text: async () => 'unavailable' }) as unknown as Response;

/**
 * The run's durable log, as the Backend stores it. `liveUntil` frames reach the browser over
 * the POST before the connection drops; the rest land in the log over time, `perPoll` at a time,
 * while the run keeps working server-side.
 */
const fakeBackend = (log: Frame[], opts: { liveUntil: number; quietPolls?: number }) => {
  const replayUrls: string[] = [];
  let polls = 0;
  const visibleLog = () => {
    // The run is still working for the first `quietPolls` polls: nothing past the drop yet.
    if (polls <= (opts.quietPolls ?? 0)) return log.filter((f) => f.seq <= opts.liveUntil);
    return log;
  };
  const fetchImpl = (async (requested: RequestInfo | URL, init?: RequestInit) => {
    const url = String(requested);
    if (url === '/api/organic/agent/chat' && init?.method === 'POST') {
      return okResponse(
        streamOf(
          log.filter((f) => f.seq <= opts.liveUntil),
          { failAfter: true },
        ),
      );
    }
    const replay = url.match(/\/api\/organic\/agent\/runs\/([^/]+)\/events\?after_seq=(-?\d+)/);
    if (replay && replay[1] === RUN_ID) {
      replayUrls.push(url);
      polls += 1;
      const afterSeq = Number(replay[2]);
      return okResponse(streamOf(visibleLog().filter((f) => f.seq > afterSeq)));
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return { fetchImpl, replayUrls };
};

const renderStreamHook = (dispatch: (action: PanelAction) => void) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const result: { current: ReturnType<typeof useOrganicAgentStream> | null } = { current: null };
  const Harness = () => {
    result.current = useOrganicAgentStream(dispatch);
    return null;
  };
  act(() => {
    root.render(createElement(Harness));
  });
  return {
    result: result as { current: ReturnType<typeof useOrganicAgentStream> },
    unmount: () => act(() => root.unmount()),
  };
};

const input = (content = 'Plan my week'): AgentChatInput => ({
  brandId: 'brand_recovery',
  sessionId: SESSION_ID,
  messages: [{ id: 'client_u2', role: 'user', content }],
});

const deltasOf = (actions: PanelAction[]) =>
  actions.filter((a) => a.type === 'STREAM_DELTA').map((a) => (a as { delta: string }).delta);

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const realActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  useAgentRunStore.getState().reset();
  requestMock.mockReset();
  // Collapse the reconnect/poll backoff (750 ms .. 5 s) to 1 ms; leave the 5-minute idle
  // watchdog alone so it cannot fire inside a test.
  globalThis.setTimeout = ((
    handler: Parameters<typeof setTimeout>[0],
    timeout?: number,
    ...args: unknown[]
  ) =>
    realSetTimeout(
      handler,
      timeout !== undefined && timeout >= 21 && timeout <= 60_000 ? 1 : timeout,
      ...args,
    )) as unknown as typeof setTimeout;
});

afterEach(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = realActEnvironment;
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
});

describe('a turn whose connection drops', () => {
  it('keeps polling a run that is still working instead of calling the connection lost', async () => {
    const log = [
      chatStarted(),
      delta(1, 'Mon: '),
      delta(2, 'reel. '),
      delta(3, 'Tue: carousel.'),
      done(4),
    ];
    // The run keeps working for 8 polls after the drop — more than the 5 attempts the old loop
    // spent in ~11 s before telling the user the connection was lost.
    const backend = fakeBackend(log, { liveUntil: 1, quietPolls: 8 });
    globalThis.fetch = backend.fetchImpl;

    const actions: PanelAction[] = [];
    const view = renderStreamHook((action) => actions.push(action));
    await act(async () => {
      expect((await view.result.current.start(input())).error).toBeUndefined();
    });
    view.unmount();

    expect(actions.some((a) => a.type === 'STREAM_ERROR')).toBe(false);
    expect(deltasOf(actions)).toEqual(['Mon: ', 'reel. ', 'Tue: carousel.']);
    expect(backend.replayUrls.length).toBeGreaterThan(5);
  });

  // after_seq is exclusive on the Backend. The client used to send lastSeq + 1, which skipped
  // one frame per resume — and when that frame was response.done the turn could never finish.
  it('replays from the last folded seq, so neither prose nor the terminal frame is skipped', async () => {
    const log = [chatStarted(), delta(1, 'Hel'), done(2)];
    const backend = fakeBackend(log, { liveUntil: 1 });
    globalThis.fetch = backend.fetchImpl;

    const actions: PanelAction[] = [];
    const view = renderStreamHook((action) => actions.push(action));
    await act(async () => {
      await view.result.current.start(input());
    });
    view.unmount();

    expect(backend.replayUrls[0]).toEndWith('after_seq=1');
    expect(actions.some((a) => a.type === 'STREAM_ERROR')).toBe(false);
    expect(actions.some((a) => a.type === 'STREAM_COMPLETE')).toBe(true);
  });

  it('offers to re-attach to the run, never to re-send the question, when the replay is unreachable', async () => {
    globalThis.fetch = (async (requested: RequestInfo | URL) => {
      const url = String(requested);
      if (url === '/api/organic/agent/chat') {
        return okResponse(streamOf([chatStarted(), delta(1, 'partial')], { failAfter: true }));
      }
      return failedResponse(503);
    }) as typeof fetch;

    const actions: PanelAction[] = [];
    const view = renderStreamHook((action) => actions.push(action));
    await act(async () => {
      await view.result.current.start(input());
    });
    view.unmount();

    const errors = actions.filter((a) => a.type === 'STREAM_ERROR');
    expect(errors).toEqual([
      {
        type: 'STREAM_ERROR',
        error: CONNECTION_LOST_MESSAGE,
        transient: true,
        resumeRun: { runId: RUN_ID, afterSeq: 1 },
      },
    ]);
  });

  it('re-attaches from where the bubble left off without sending the turn again', async () => {
    const log = [chatStarted(), delta(1, 'Mon: '), delta(2, 'reel.'), done(3)];
    const backend = fakeBackend(log, { liveUntil: 1 });
    const posts: string[] = [];
    globalThis.fetch = (async (requested: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') posts.push(String(requested));
      return backend.fetchImpl(requested, init);
    }) as typeof fetch;

    const actions: PanelAction[] = [];
    const view = renderStreamHook((action) => actions.push(action));
    await act(async () => {
      await view.result.current.reattach({
        brandId: 'brand_recovery',
        sessionId: SESSION_ID,
        run: { runId: RUN_ID, afterSeq: 1 },
      });
    });
    view.unmount();

    expect(posts).toEqual([]);
    expect(backend.replayUrls[0]).toEndWith('after_seq=1');
    expect(deltasOf(actions)).toEqual(['reel.']);
    expect(actions.some((a) => a.type === 'STREAM_ERROR')).toBe(false);
  });

  it('gives the optimistic user bubble the id the server stored it under', async () => {
    const backend = fakeBackend([chatStarted('101'), delta(1, 'ok'), done(2)], { liveUntil: 2 });
    globalThis.fetch = backend.fetchImpl;

    const actions: PanelAction[] = [];
    const view = renderStreamHook((action) => actions.push(action));
    await act(async () => {
      await view.result.current.start(input());
    });
    view.unmount();

    expect(actions).toContainEqual({
      type: 'ADOPT_USER_MESSAGE_ID',
      clientId: 'client_u2',
      serverId: '101',
    });
  });
});

describe('the transcript after the panel remounts mid-turn', () => {
  const historyPage = (
    rows: Array<{ id: number; role: 'user' | 'assistant'; content: string }>,
  ) => ({
    messages: rows.map((row) => ({ ...row, sessionId: SESSION_ID, uiCards: [] })),
    nextCursor: null,
  });

  // The reported bug: an error screen, then the answer appeared with the user's question gone
  // and the PREVIOUS answer in its place. The panel's history page was cached for 60 s; a
  // remount inside that window restored the conversation as it was before the question was
  // sent, and the re-attached run appended its answer below the previous one.
  it('restores the question that was sent, not the page cached before it', async () => {
    const before = historyPage([
      { id: 1, role: 'user', content: 'Ideas for Monday?' },
      { id: 2, role: 'assistant', content: 'Try a reel.' },
    ]);
    const after = historyPage([
      { id: 1, role: 'user', content: 'Ideas for Monday?' },
      { id: 2, role: 'assistant', content: 'Try a reel.' },
      { id: 3, role: 'user', content: 'Plan my week' },
    ]);
    requestMock.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    // The panel opened the conversation and cached its first page.
    await fetchOrganicSessionMessagePage(SESSION_ID, 'brand_recovery');

    // The user sent a turn, and the connection broke mid-answer.
    globalThis.fetch = (async (requested: RequestInfo | URL) => {
      const url = String(requested);
      if (url === '/api/organic/agent/chat') {
        return okResponse(
          streamOf([chatStarted('3'), delta(1, 'Mon: reel.')], { failAfter: true }),
        );
      }
      return failedResponse(503);
    }) as typeof fetch;
    const view = renderStreamHook(() => {});
    await act(async () => {
      await view.result.current.start(input());
    });
    view.unmount();

    // The panel remounts and hydrates.
    const page = await fetchOrganicSessionMessagePage(SESSION_ID, 'brand_recovery');
    expect(page.messages.map((m) => m.content)).toEqual([
      'Ideas for Monday?',
      'Try a reel.',
      'Plan my week',
    ]);
  });

  it('paints the re-attached answer under the question it answers', () => {
    const restored = restoreSessionFromMessages([
      {
        id: '1',
        sessionId: SESSION_ID,
        role: 'user',
        content: 'Ideas for Monday?',
        uiCardFrames: [],
        createdAt: '',
      },
      {
        id: '2',
        sessionId: SESSION_ID,
        role: 'assistant',
        content: 'Try a reel.',
        uiCardFrames: [],
        createdAt: '',
      },
      {
        id: '3',
        sessionId: SESSION_ID,
        role: 'user',
        content: 'Plan my week',
        uiCardFrames: [],
        createdAt: '',
      },
    ]);
    let state: PanelState = initialPanelState();
    const apply = (action: PanelAction) => {
      state = panelReducer(state, action);
    };

    apply({ type: 'SESSION_SWITCH', sessionId: SESSION_ID, messages: restored.messages });
    // useProjectedRun picks the still-running run up from the app-level store.
    apply({ type: 'RESUME_STREAMING', messageId: RUN_ID });
    apply({ type: 'STREAM_DELTA', delta: 'Mon: reel.' });
    apply({ type: 'STREAM_COMPLETE' });

    expect(state.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Ideas for Monday?'],
      ['assistant', 'Try a reel.'],
      ['user', 'Plan my week'],
      ['assistant', 'Mon: reel.'],
    ]);
  });
});

describe('the user message across a failed stream', () => {
  const submitted = (): PanelState => {
    let state = panelReducer(initialPanelState(), {
      type: 'SESSION_SWITCH',
      sessionId: SESSION_ID,
      messages: [],
    });
    state = panelReducer(state, {
      type: 'SUBMIT_USER_MESSAGE',
      content: 'Plan my week',
      messageId: 'client_u2',
    });
    return state;
  };

  it('keeps the question and shows a resumable error under it when the stream breaks', () => {
    let state = submitted();
    state = panelReducer(state, {
      type: 'ADOPT_USER_MESSAGE_ID',
      clientId: 'client_u2',
      serverId: '3',
    });
    state = panelReducer(state, { type: 'STREAM_DELTA', delta: 'Mon: ' });
    state = panelReducer(state, {
      type: 'STREAM_ERROR',
      error: CONNECTION_LOST_MESSAGE,
      transient: true,
      resumeRun: { runId: RUN_ID, afterSeq: 1 },
    });
    state = panelReducer(state, { type: 'STREAM_COMPLETE' });

    const [question, answer] = state.messages;
    expect(question).toMatchObject({ id: '3', role: 'user', content: 'Plan my week' });
    expect(answer).toMatchObject({
      role: 'assistant',
      content: 'Mon: ',
      error: CONNECTION_LOST_MESSAGE,
      resumeRun: { runId: RUN_ID, afterSeq: 1 },
    });
    // One silent re-attach is queued; it re-attaches, it does not re-send.
    expect(state.pendingAutoRetry).toBe(answer.id);
  });

  it('streams the rest into the same bubble on re-attach, and clears the error', () => {
    let state = submitted();
    const answerId = state.messages[1].id;
    state = panelReducer(state, { type: 'STREAM_DELTA', delta: 'Mon: ' });
    state = panelReducer(state, {
      type: 'STREAM_ERROR',
      error: CONNECTION_LOST_MESSAGE,
      transient: true,
      resumeRun: { runId: RUN_ID, afterSeq: 1 },
    });
    state = panelReducer(state, { type: 'RESUME_STREAMING', messageId: answerId });
    state = panelReducer(state, { type: 'STREAM_DELTA', delta: 'reel.' });

    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toMatchObject({ id: answerId, content: 'Mon: reel.' });
    expect(state.messages[1].error).toBeUndefined();
    expect(state.messages[1].resumeRun).toBeUndefined();
    // The spent silent retry stays spent: a second failure paints the row.
    expect(state.autoRetryConsumed).toBe(true);
  });

  it('merges a history page onto the bubble instead of showing the question twice', () => {
    let state = submitted();
    state = panelReducer(state, {
      type: 'ADOPT_USER_MESSAGE_ID',
      clientId: 'client_u2',
      serverId: '3',
    });
    const restored = restoreSessionFromMessages([
      {
        id: '3',
        sessionId: SESSION_ID,
        role: 'user',
        content: 'Plan my week',
        uiCardFrames: [],
        createdAt: '',
      },
    ]);
    state = panelReducer(state, {
      type: 'SESSION_SWITCH',
      sessionId: SESSION_ID,
      messages: restored.messages,
    });

    expect(state.messages.filter((m) => m.role === 'user').map((m) => m.id)).toEqual(['3']);
    expect(state.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('keeps the server copy when the history page landed before the id did', () => {
    let state = submitted();
    const restored = restoreSessionFromMessages([
      {
        id: '3',
        sessionId: SESSION_ID,
        role: 'user',
        content: 'Plan my week',
        uiCardFrames: [],
        createdAt: '',
      },
    ]);
    state = panelReducer(state, {
      type: 'SESSION_SWITCH',
      sessionId: SESSION_ID,
      messages: restored.messages,
    });
    state = panelReducer(state, {
      type: 'ADOPT_USER_MESSAGE_ID',
      clientId: 'client_u2',
      serverId: '3',
    });

    expect(state.messages.filter((m) => m.role === 'user').map((m) => m.id)).toEqual(['3']);
  });

  it('keeps the transcript order stable across repeated history merges', () => {
    let state = submitted();
    state = panelReducer(state, {
      type: 'ADOPT_USER_MESSAGE_ID',
      clientId: 'client_u2',
      serverId: '3',
    });
    const page = restoreSessionFromMessages([
      {
        id: '1',
        sessionId: SESSION_ID,
        role: 'user',
        content: 'Ideas for Monday?',
        uiCardFrames: [],
        createdAt: '',
      },
      {
        id: '2',
        sessionId: SESSION_ID,
        role: 'assistant',
        content: 'Try a reel.',
        uiCardFrames: [],
        createdAt: '',
      },
      {
        id: '3',
        sessionId: SESSION_ID,
        role: 'user',
        content: 'Plan my week',
        uiCardFrames: [],
        createdAt: '',
      },
    ]).messages;
    state = panelReducer(state, { type: 'SESSION_SWITCH', sessionId: SESSION_ID, messages: page });
    const first = state.messages.map((m) => m.id);
    state = panelReducer(state, { type: 'SESSION_SWITCH', sessionId: SESSION_ID, messages: page });
    state = panelReducer(state, { type: 'SESSION_SWITCH', sessionId: SESSION_ID, messages: page });

    expect(state.messages.map((m) => m.id)).toEqual(first);
    expect(state.messages.map((m) => m.content)).toEqual([
      'Ideas for Monday?',
      'Try a reel.',
      'Plan my week',
      '',
    ]);
  });
});
