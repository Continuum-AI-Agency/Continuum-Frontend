import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { isTerminalAgentRunStatus } from '@continuum/contracts';

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  normalizeToolCallEvent,
  normalizeToolResultEvent,
  normalizeTrendChartEvent,
  parseOrganicStreamEvent,
} from '@/components/organic/agent/streamEventParser';
import type { AgentChatInput } from '@/components/organic/agent/types';
import type { PanelAction } from '@/components/organic/agent/useOrganicAgentReducer';
import {
  resolveIdleRunStatus,
  toAgentRunEvent,
  useOrganicAgentStream,
} from '@/hooks/useOrganicAgentStream';
import { isSessionStreaming, useAgentRunStore } from '@/lib/agents/runStore';

describe('normalizeToolCallEvent', () => {
  it('uses camelCase tool fields when present', () => {
    const normalized = normalizeToolCallEvent({
      toolCallId: 'call_1',
      toolName: 'fetch_metrics',
      args: { accountId: 'act_123' },
    });

    expect(normalized).toEqual({
      toolCallId: 'call_1',
      toolName: 'fetch_metrics',
      args: { accountId: 'act_123' },
    });
  });

  it('supports snake_case compatibility fields', () => {
    const normalized = normalizeToolCallEvent({
      tool_call_id: 'call_2',
      tool_name: 'fetch_insights',
      args: { campaignId: 'cmp_456' },
    });

    expect(normalized).toEqual({
      toolCallId: 'call_2',
      toolName: 'fetch_insights',
      args: { campaignId: 'cmp_456' },
    });
  });

  it('falls back to name and id compatibility fields', () => {
    const normalized = normalizeToolCallEvent({
      id: 'call_3',
      name: 'search_trends',
      args: { term: 'spf moisturizer' },
    });

    expect(normalized).toEqual({
      toolCallId: 'call_3',
      toolName: 'search_trends',
      args: { term: 'spf moisturizer' },
    });
  });

  it('provides safe defaults when identifiers are missing', () => {
    const normalized = normalizeToolCallEvent({ args: { ping: true } });

    expect(normalized.toolName).toBe('unknown_tool');
    expect(normalized.toolCallId.startsWith('unknown_tool-')).toBe(true);
    expect(normalized.args).toEqual({ ping: true });
  });
});

describe('normalizeToolResultEvent', () => {
  it('uses camelCase tool result fields when present', () => {
    const normalized = normalizeToolResultEvent({
      toolCallId: 'call_1',
      toolName: 'fetch_metrics',
      result: { rows: 3 },
    });

    expect(normalized).toEqual({
      toolCallId: 'call_1',
      toolName: 'fetch_metrics',
      result: { rows: 3 },
      ok: true,
      reason: null,
    });
  });

  it('supports snake_case compatibility fields', () => {
    const normalized = normalizeToolResultEvent({
      tool_call_id: 'call_2',
      tool_name: 'fetch_insights',
      result: { rows: 7 },
    });

    expect(normalized).toEqual({
      toolCallId: 'call_2',
      toolName: 'fetch_insights',
      result: { rows: 7 },
      ok: true,
      reason: null,
    });
  });

  it('falls back to synthetic id when missing', () => {
    const normalized = normalizeToolResultEvent({
      toolName: 'getTrend',
      result: { id: 'trend_1' },
    });

    expect(normalized.toolCallId.startsWith('getTrend-')).toBe(true);
    expect(normalized.toolName).toBe('getTrend');
    expect(normalized.result).toEqual({ id: 'trend_1' });
  });
});

describe('normalizeTrendChartEvent', () => {
  it('normalizes a valid trend chart payload', () => {
    const normalized = normalizeTrendChartEvent({
      data: {
        chartType: 'bar',
        title: 'Top Trends',
        windows: [7, 14],
        series: [
          { label: 'Trends', data: [{ window: 7, value: 12 }] },
          { label: 'Events', data: [{ window: 14, value: 5 }] },
        ],
        topSignals: [
          {
            id: 'sig_1',
            title: 'Spring launch',
            type: 'event',
            confidence: 0.82,
            platform: 'instagram',
            windowDays: 7,
          },
        ],
      },
    });

    expect(normalized).toEqual({
      chartType: 'bar',
      title: 'Top Trends',
      windows: [7, 14],
      series: [
        { label: 'Trends', data: [{ window: 7, value: 12 }] },
        { label: 'Events', data: [{ window: 14, value: 5 }] },
      ],
      topSignals: [
        {
          id: 'sig_1',
          title: 'Spring launch',
          type: 'event',
          confidence: 0.82,
          platform: 'instagram',
          windowDays: 7,
        },
      ],
    });
  });

  it('returns safe defaults for malformed trend chart payloads', () => {
    const normalized = normalizeTrendChartEvent({
      data: {
        title: 123,
        windows: ['x', 7, null],
        series: [{ label: 'bad', data: [{ window: 'x', value: 1 }] }],
        topSignals: [{ type: 'bad' }],
      },
    });

    expect(normalized).toEqual({
      chartType: 'bar',
      title: '',
      windows: [],
      series: [],
      topSignals: [],
    });
  });
});

describe('parseOrganicStreamEvent contract coverage', () => {
  it('handles response lifecycle events', () => {
    expect(parseOrganicStreamEvent({ type: 'response.created' })).toEqual({
      kind: 'ignored',
      type: 'response.created',
    });

    expect(
      parseOrganicStreamEvent({
        type: 'response.output_text.delta',
        data: { delta: 'hello' },
        eventId: 'evt_2',
        seq: 2,
        ts: '2026-04-27T00:00:00.000Z',
      }),
    ).toEqual({
      kind: 'delta',
      delta: 'hello',
    });

    expect(parseOrganicStreamEvent({ type: 'response.done' })).toEqual({
      kind: 'complete',
    });

    expect(
      parseOrganicStreamEvent({
        type: 'response.error',
        data: { message: 'upstream failed' },
      }),
    ).toEqual({
      kind: 'error',
      message: 'upstream failed',
    });
  });

  it('handles tool events', () => {
    expect(
      parseOrganicStreamEvent({
        type: 'tool.call',
        data: {
          toolCallId: 'call_1',
          toolName: 'listTrends',
          args: { limit: 10 },
        },
      }),
    ).toEqual({
      kind: 'toolCall',
      event: {
        toolCallId: 'call_1',
        toolName: 'listTrends',
        args: { limit: 10 },
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: 'tool.result',
        data: {
          toolCallId: 'call_1',
          toolName: 'listTrends',
          result: [{ id: 'trend_1' }],
          ok: true,
        },
      }),
    ).toEqual({
      kind: 'toolResult',
      toolCallId: 'call_1',
      toolName: 'listTrends',
      result: [{ id: 'trend_1' }],
      ok: true,
      reason: undefined,
    });
  });

  it('handles ui events', () => {
    expect(
      parseOrganicStreamEvent({ type: 'response.source', url: 'https://example.com' }),
    ).toEqual({
      kind: 'ignored',
      type: 'response.source',
    });

    const trendChart = parseOrganicStreamEvent({
      type: 'ui.trend_chart',
      data: {
        chartType: 'bar',
        title: 'Signals',
        windows: [7],
        series: [{ label: 'Trends', data: [{ window: 7, value: 22 }] }],
        topSignals: [],
      },
    });

    expect(trendChart).toEqual({
      kind: 'uiCard',
      card: {
        type: 'trend_chart',
        data: {
          chartType: 'bar',
          title: 'Signals',
          windows: [7],
          series: [{ label: 'Trends', data: [{ window: 7, value: 22 }] }],
          topSignals: [],
        },
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: 'ui.post_card',
        data: {
          draftId: 'draft_1',
          jobId: 'job_1',
          brandId: 'brand_1',
          platform: 'instagram',
          scheduledAt: '2026-04-28T12:00:00.000Z',
          caption: 'hello',
          hashtags: ['trend'],
          imageUrl: null,
          format: 'reel',
          topic: 'trends',
          quality: { score: 92, passed: true },
          trendId: 'trend_1',
        },
      }),
    ).toEqual({
      kind: 'postCard',
      card: {
        draftId: 'draft_1',
        jobId: 'job_1',
        brandId: 'brand_1',
        platform: 'instagram',
        scheduledAt: '2026-04-28T12:00:00.000Z',
        caption: 'hello',
        hashtags: ['trend'],
        imageUrl: null,
        format: 'reel',
        topic: 'trends',
        quality: { score: 92, passed: true },
        trendId: 'trend_1',
      },
    });
  });

  it('handles job lifecycle events', () => {
    expect(
      parseOrganicStreamEvent({
        type: 'job.enqueued',
        data: {
          jobId: 'job_1',
          brandId: 'brand_1',
          platform: 'instagram',
        },
      }),
    ).toEqual({
      kind: 'jobUpdate',
      job: {
        jobId: 'job_1',
        brandId: 'brand_1',
        platform: 'instagram',
        scheduledAt: undefined,
        trendId: undefined,
        status: 'queued',
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: 'job.progress',
        data: {
          jobId: 'job_1',
          brandId: 'brand_1',
          stage: 'drafting',
          agentName: 'writer',
        },
      }),
    ).toEqual({
      kind: 'jobUpdate',
      job: {
        jobId: 'job_1',
        brandId: 'brand_1',
        status: 'running',
        stage: 'drafting',
        agentName: 'writer',
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: 'draft.ready',
        data: {
          jobId: 'job_1',
          brandId: 'brand_1',
          draftId: 'draft_1',
        },
      }),
    ).toMatchObject({
      kind: 'jobUpdate',
      job: {
        jobId: 'job_1',
        brandId: 'brand_1',
        draftId: 'draft_1',
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: 'job.completed',
        data: {
          jobId: 'job_1',
          brandId: 'brand_1',
          draftId: 'draft_1',
        },
      }),
    ).toEqual({
      kind: 'jobUpdate',
      job: {
        jobId: 'job_1',
        brandId: 'brand_1',
        status: 'completed',
        draftId: 'draft_1',
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: 'job.failed',
        data: {
          jobId: 'job_1',
          brandId: 'brand_1',
          error: { code: 'boom', message: 'failed' },
        },
      }),
    ).toEqual({
      kind: 'jobUpdate',
      job: {
        jobId: 'job_1',
        brandId: 'brand_1',
        status: 'failed',
        error: { code: 'boom', message: 'failed' },
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: 'job.cancelled',
        data: {
          jobId: 'job_1',
          brandId: 'brand_1',
        },
      }),
    ).toEqual({
      kind: 'jobUpdate',
      job: {
        jobId: 'job_1',
        brandId: 'brand_1',
        status: 'cancelled',
      },
    });
  });

  it('marks malformed supported events as invalid', () => {
    expect(
      parseOrganicStreamEvent({
        type: 'job.progress',
        data: { brandId: 'brand_1' },
      }),
    ).toEqual({
      kind: 'invalid',
      type: 'job.progress',
    });
  });

  it('handles context.media_resolution grab failures', () => {
    expect(
      parseOrganicStreamEvent({
        type: 'context.media_resolution',
        data: {
          requested: 2,
          resolvedImages: 1,
          resolvedVideos: 0,
          textOnly: 0,
          failed: [{ refId: 'asset-1', type: 'media_asset', reason: 'storage_miss' }],
        },
      }),
    ).toEqual({
      kind: 'mediaResolution',
      data: {
        requested: 2,
        resolvedImages: 1,
        resolvedVideos: 0,
        textOnly: 0,
        failed: [{ refId: 'asset-1', type: 'media_asset', reason: 'storage_miss' }],
      },
    });
  });
});

describe('parseOrganicStreamEvent chat retry frames (R1)', () => {
  it('parses response.retrying into a retrying event', () => {
    expect(
      parseOrganicStreamEvent({
        type: 'response.retrying',
        data: { attempt: 2, reason: 'upstream_reset' },
      }),
    ).toEqual({ kind: 'retrying', attempt: 2, reason: 'upstream_reset' });
  });

  it('defaults a malformed retrying attempt to 1', () => {
    expect(parseOrganicStreamEvent({ type: 'response.retrying', data: {} })).toEqual({
      kind: 'retrying',
      attempt: 1,
    });
  });

  it('carries code and transient through response.error', () => {
    expect(
      parseOrganicStreamEvent({
        type: 'response.error',
        data: { message: 'model reset', code: 'upstream_reset', transient: true },
      }),
    ).toEqual({ kind: 'error', message: 'model reset', code: 'upstream_reset', transient: true });
  });

  it('leaves retry metadata off a plain response.error', () => {
    expect(parseOrganicStreamEvent({ type: 'response.error', data: { message: 'boom' } })).toEqual({
      kind: 'error',
      message: 'boom',
    });
  });
});

// The resume-loop contract: a mid-stream throw on a named run re-enters the existing
// reconnect/resume loop (GET replay from after_seq — no re-billing) instead of surfacing
// STREAM_ERROR; only exhausted attempts or a run with no id fall through to the error row.
describe('useOrganicAgentStream resume loop', () => {
  const encoder = new TextEncoder();
  const line = (obj: Record<string, unknown>) => encoder.encode(`${JSON.stringify(obj)}\n`);
  const chatStarted = () =>
    line({
      type: 'agent.chat_started',
      seq: 0,
      data: { runId: 'run_hook_1', sessionId: 'sess_hook' },
    });
  const delta = (seq: number, text: string) =>
    line({ type: 'response.output_text.delta', seq, data: { delta: text } });
  const done = (seq: number) => line({ type: 'response.done', seq, data: {} });

  // Pull-based on purpose: Bun discards chunks queued before controller.error() in
  // start(), so erroring there would never deliver the frames. One chunk per read,
  // THEN the failure — exactly how a socket drops mid-stream.
  const streamOf = (
    lines: Uint8Array[],
    opts?: { failAfter?: boolean },
  ): ReadableStream<Uint8Array> => {
    let index = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < lines.length) {
          controller.enqueue(lines[index]);
          index += 1;
          return;
        }
        if (opts?.failAfter) controller.error(new Error('connection reset mid-stream'));
        else controller.close();
      },
    });
  };

  const okResponse = (body: ReadableStream<Uint8Array>): Response =>
    ({ ok: true, status: 200, body, text: async () => '' }) as unknown as Response;
  const failedResponse = (status: number): Response =>
    ({ ok: false, status, body: null, text: async () => 'unavailable' }) as unknown as Response;

  const input = (): AgentChatInput => ({
    brandId: 'brand_hook',
    sessionId: 'sess_hook',
    messages: [{ id: 'u1', role: 'user', content: 'hi' }],
  });

  // The tree currently carries two React copies (root 19.2.8, FE-local 19.2.7), which
  // breaks @testing-library/react's renderer against FE hooks. Render the hook with the
  // SAME react + react-dom the hook itself resolves, so there is exactly one dispatcher.
  const renderStreamHook = (dispatch: (action: PanelAction) => void) => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const result: { current: ReturnType<typeof useOrganicAgentStream> | null } = {
      current: null,
    };
    const Harness = () => {
      result.current = useOrganicAgentStream(dispatch);
      return null;
    };
    act(() => {
      root.render(createElement(Harness));
    });
    return {
      result: result as { current: ReturnType<typeof useOrganicAgentStream> },
      unmount: () => {
        act(() => {
          root.unmount();
        });
      },
    };
  };

  const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const realActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  const realFetch = globalThis.fetch;
  const realSetTimeout = globalThis.setTimeout;

  // Shrink timers within [lo, hi] to 1ms and leave everything else alone. Bounded on
  // purpose: the reconnect backoff (750ms x attempt) and the 5-minute idle watchdog both
  // run through setTimeout, and a blanket clamp would fire the watchdog inside every
  // resume test and abort the run before it could resume.
  const clampTimersBetween = (lo: number, hi: number) => {
    globalThis.setTimeout = ((
      handler: Parameters<typeof setTimeout>[0],
      timeout?: number,
      ...args: unknown[]
    ) =>
      realSetTimeout(
        handler,
        timeout !== undefined && timeout >= lo && timeout <= hi ? 1 : timeout,
        ...args,
      )) as unknown as typeof setTimeout;
  };

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    useAgentRunStore.getState().reset();
    // Reconnect backoff only, so exhausting all five attempts stays fast.
    clampTimersBetween(21, 60_000);
  });

  afterEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = realActEnvironment;
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realSetTimeout;
  });

  it('re-enters the resume loop on a mid-stream throw instead of dispatching STREAM_ERROR', async () => {
    const actions: PanelAction[] = [];
    const resumeUrls: string[] = [];
    globalThis.fetch = (async (requested: RequestInfo | URL) => {
      const url = String(requested);
      if (url === '/api/organic/agent/chat') {
        return okResponse(streamOf([chatStarted(), delta(1, 'Hel')], { failAfter: true }));
      }
      if (url.startsWith('/api/organic/agent/runs/run_hook_1/events')) {
        resumeUrls.push(url);
        return okResponse(streamOf([delta(2, 'lo'), done(3)]));
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const view = renderStreamHook((action) => actions.push(action));
    await act(async () => {
      const result = await view.result.current.start(input());
      expect(result.error).toBeUndefined();
    });
    view.unmount();

    expect(resumeUrls).toEqual(['/api/organic/agent/runs/run_hook_1/events?after_seq=2']);
    expect(actions.filter((a) => a.type === 'STREAM_ERROR')).toHaveLength(0);
    expect(actions.filter((a) => a.type === 'STREAM_COMPLETE').length).toBeGreaterThanOrEqual(1);
    expect(
      actions.filter((a) => a.type === 'STREAM_DELTA').map((a) => (a as { delta: string }).delta),
    ).toEqual(['Hel', 'lo']);
  });

  it('dispatches STREAM_ERROR only after resume attempts exhaust', async () => {
    const actions: PanelAction[] = [];
    let resumeCalls = 0;
    let resumeCallsWhenErrorDispatched = -1;
    globalThis.fetch = (async (requested: RequestInfo | URL) => {
      const url = String(requested);
      if (url === '/api/organic/agent/chat') {
        return okResponse(streamOf([chatStarted()], { failAfter: true }));
      }
      if (url.startsWith('/api/organic/agent/runs/run_hook_1/events')) {
        resumeCalls += 1;
        return failedResponse(503);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const view = renderStreamHook((action) => {
      actions.push(action);
      if (action.type === 'STREAM_ERROR') resumeCallsWhenErrorDispatched = resumeCalls;
    });
    await act(async () => {
      const result = await view.result.current.start(input());
      expect(result.error).toBeTruthy();
    });
    view.unmount();

    expect(resumeCalls).toBe(5);
    expect(actions.filter((a) => a.type === 'STREAM_ERROR')).toHaveLength(1);
    expect(resumeCallsWhenErrorDispatched).toBe(5);
  });

  it('falls through to STREAM_ERROR when a mid-stream throw has no run id to resume', async () => {
    const actions: PanelAction[] = [];
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return okResponse(streamOf([delta(1, 'partial')], { failAfter: true }));
    }) as typeof fetch;

    const view = renderStreamHook((action) => actions.push(action));
    await act(async () => {
      const result = await view.result.current.start(input());
      expect(result.error).toBeTruthy();
    });
    view.unmount();

    expect(fetchCalls).toBe(1);
    expect(actions.filter((a) => a.type === 'STREAM_ERROR')).toHaveLength(1);
  });

  // Bug #220, the panel-lock half. `composerBusy` is `isStreaming || viewedSessionStreaming`
  // and BOTH hang on a terminal frame: the local flag clears only in the reader's
  // `finally`, and the store derives status from the last terminal frame in the log. A run
  // that goes silent locked the composer and every action, permanently and across reloads
  // — "can't make anything". The watchdog must release both.
  describe('idle watchdog', () => {
    // Widen the clamp to cover the 5-minute watchdog so a stream that never ends trips it
    // inside the test. The outer beforeEach runs first, so this override wins.
    beforeEach(() => {
      clampTimersBetween(21, Number.MAX_SAFE_INTEGER);
    });

    const neverEndingStream = (lines: Uint8Array[]): ReadableStream<Uint8Array> => {
      let index = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (index < lines.length) {
            controller.enqueue(lines[index]);
            index += 1;
          }
          // Past the seeded lines: never enqueue, never close. Exactly a backend that
          // holds the socket open and stops writing.
        },
      });
    };

    it('releases both halves of composerBusy when a named run goes silent', async () => {
      const actions: PanelAction[] = [];
      globalThis.fetch = (async (requested: RequestInfo | URL) => {
        const url = String(requested);
        if (url === '/api/organic/agent/chat') {
          return okResponse(neverEndingStream([chatStarted(), delta(1, 'thinking')]));
        }
        if (url.startsWith('/api/organic/agent/runs/run_hook_1/events')) {
          return okResponse(neverEndingStream([]));
        }
        throw new Error(`unexpected fetch: ${url}`);
      }) as typeof fetch;

      const view = renderStreamHook((action) => actions.push(action));
      await act(async () => {
        await view.result.current.start(input());
      });

      // Local half: the reader's own streaming flag.
      expect(view.result.current.isStreaming).toBe(false);
      // Store half: the run must carry a TERMINAL status, or isSessionStreaming keeps the
      // panel locked no matter what the local flag says.
      const record = useAgentRunStore.getState().runs.run_hook_1;
      expect(record).toBeTruthy();
      expect(isTerminalAgentRunStatus(record!.run.status)).toBe(true);
      // A run that produced frames did real work; a missing terminal row is a backend gap,
      // not a failed turn.
      expect(record!.run.status).toBe('completed');
      // The transcript must settle too — otherwise the assistant bubble renders as
      // streaming forever even with the composer unlocked.
      expect(actions.filter((a) => a.type === 'STREAM_COMPLETE').length).toBeGreaterThanOrEqual(1);

      view.unmount();
    });

    it('settles a run that never emitted a single frame as failed', async () => {
      const actions: PanelAction[] = [];
      globalThis.fetch = (async () =>
        okResponse(neverEndingStream([chatStarted()]))) as typeof fetch;

      const view = renderStreamHook((action) => actions.push(action));
      await act(async () => {
        await view.result.current.start(input());
      });

      // agent.chat_started only NAMES the run — it is not output, so this run produced
      // nothing and `failed` is the honest settlement.
      const record = useAgentRunStore.getState().runs.run_hook_1;
      expect(record).toBeTruthy();
      expect(record!.run.status).toBe('failed');
      expect(isTerminalAgentRunStatus(record!.run.status)).toBe(true);
      expect(view.result.current.isStreaming).toBe(false);
      expect(actions.filter((a) => a.type === 'STREAM_COMPLETE').length).toBeGreaterThanOrEqual(1);

      view.unmount();
    });

    it('does not fire when the stream terminates normally', async () => {
      const actions: PanelAction[] = [];
      globalThis.fetch = (async () =>
        okResponse(streamOf([chatStarted(), delta(1, 'hi'), done(2)]))) as typeof fetch;

      const view = renderStreamHook((action) => actions.push(action));
      await act(async () => {
        const result = await view.result.current.start(input());
        expect(result.error).toBeUndefined();
      });

      // The terminal frame settled the run; the watchdog must not have overwritten it.
      const record = useAgentRunStore.getState().runs.run_hook_1;
      expect(record!.run.status).not.toBe('failed');
      expect(view.result.current.isStreaming).toBe(false);
      expect(actions.filter((a) => a.type === 'STREAM_ERROR')).toHaveLength(0);

      view.unmount();
    });
  });
});

// Bug #221. The store's status only ever advanced through `appendEvents`, and the ONLY
// producer of that was the Realtime tailer. Drop that terminal INSERT — unsubscribed,
// RLS-blocked, dead socket — and `isSessionStreaming` stayed true forever: "Continuum is
// working…" never cleared and the composer stayed disabled until the 5-minute watchdog.
// The live reader is the second producer the store was always designed for (TWO PRODUCERS,
// ONE LOG), so the terminal frame must settle the run with NO Realtime involvement at all.
describe('useOrganicAgentStream store append', () => {
  const encoder = new TextEncoder();
  const line = (obj: Record<string, unknown>) => encoder.encode(`${JSON.stringify(obj)}\n`);

  const streamOf = (lines: Uint8Array[]): ReadableStream<Uint8Array> => {
    let index = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < lines.length) {
          controller.enqueue(lines[index]);
          index += 1;
          return;
        }
        controller.close();
      },
    });
  };

  const okResponse = (body: ReadableStream<Uint8Array>): Response =>
    ({ ok: true, status: 200, body, text: async () => '' }) as unknown as Response;

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
      unmount: () => {
        act(() => {
          root.unmount();
        });
      },
    };
  };

  const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const realActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    useAgentRunStore.getState().reset();
  });

  afterEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = realActEnvironment;
    globalThis.fetch = realFetch;
  });

  it('settles the run and unlocks the session from the terminal frame alone', async () => {
    globalThis.fetch = (async () =>
      okResponse(
        streamOf([
          line({
            type: 'agent.chat_started',
            seq: 0,
            eventId: 'evt_0',
            ts: '2026-07-30T00:00:00.000Z',
            data: { runId: 'run_append', sessionId: 'sess_append' },
          }),
          line({
            type: 'response.output_text.delta',
            seq: 1,
            eventId: 'evt_1',
            ts: '2026-07-30T00:00:01.000Z',
            data: { delta: 'hi' },
          }),
          line({
            type: 'response.done',
            seq: 2,
            eventId: 'evt_2',
            ts: '2026-07-30T00:00:02.000Z',
            data: {},
          }),
        ]),
      )) as typeof fetch;

    const view = renderStreamHook(() => {});
    await act(async () => {
      await view.result.current.start({
        brandId: 'brand_append',
        sessionId: 'sess_append',
        messages: [{ id: 'u1', role: 'user', content: 'hi' }],
      });
    });

    const record = useAgentRunStore.getState().runs.run_append;
    expect(record).toBeTruthy();
    expect(record!.run.status).toBe('completed');
    expect(isTerminalAgentRunStatus(record!.run.status)).toBe(true);
    // The reader is the producer here: every enveloped frame lands in the log with its
    // real seq, which is what makes the terminal status derivable without Realtime.
    expect(record!.events.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(record!.lastSeq).toBe(2);
    expect(isSessionStreaming('sess_append')(useAgentRunStore.getState())).toBe(false);

    view.unmount();
  });

  it('is idempotent against the Realtime tailer appending the same frame', async () => {
    globalThis.fetch = (async () =>
      okResponse(
        streamOf([
          line({
            type: 'agent.chat_started',
            seq: 0,
            eventId: 'evt_0',
            ts: '2026-07-30T00:00:00.000Z',
            data: { runId: 'run_dupe', sessionId: 'sess_dupe' },
          }),
          line({
            type: 'response.done',
            seq: 1,
            eventId: 'evt_1',
            ts: '2026-07-30T00:00:01.000Z',
            data: {},
          }),
        ]),
      )) as typeof fetch;

    const view = renderStreamHook(() => {});
    await act(async () => {
      await view.result.current.start({
        brandId: 'brand_dupe',
        sessionId: 'sess_dupe',
        messages: [{ id: 'u1', role: 'user', content: 'hi' }],
      });
    });

    const before = useAgentRunStore.getState().runs.run_dupe!.events;
    // Exactly what the durable tailer replays over the boundary frame.
    useAgentRunStore.getState().appendEvents('run_dupe', [
      {
        eventId: 'evt_1',
        seq: 1,
        ts: '2026-07-30T00:00:01.000Z',
        type: 'response.done',
        data: {},
      },
    ]);
    const after = useAgentRunStore.getState().runs.run_dupe!.events;

    expect(after).toBe(before);
    expect(after.map((e) => e.seq)).toEqual([0, 1]);

    view.unmount();
  });
});

describe('toAgentRunEvent', () => {
  it('lifts an enveloped NDJSON frame into a store event', () => {
    expect(
      toAgentRunEvent({
        type: 'response.done',
        seq: 4,
        eventId: 'evt_4',
        ts: '2026-07-30T00:00:00.000Z',
        data: { ok: true },
      }),
    ).toEqual({
      eventId: 'evt_4',
      seq: 4,
      ts: '2026-07-30T00:00:00.000Z',
      type: 'response.done',
      data: { ok: true },
    });
  });

  it('rejects a frame with no seq — seq is the dedupe key the two producers share', () => {
    expect(toAgentRunEvent({ type: 'agent.run_queued', data: {} })).toBeNull();
  });

  it('rejects a frame with no type', () => {
    expect(toAgentRunEvent({ seq: 1, data: {} })).toBeNull();
  });

  it('substitutes an envelope for a frame that lost its eventId or ts in transit', () => {
    const event = toAgentRunEvent({ type: 'response.output_text.delta', seq: 7 });
    expect(event?.eventId).toBe('evt_7');
    expect(typeof event?.ts).toBe('string');
    expect(event?.data).toEqual({});
  });
});

describe('resolveIdleRunStatus', () => {
  it('treats a run that produced frames as completed-partial, not failed', () => {
    expect(resolveIdleRunStatus(true)).toBe('completed');
  });

  it('treats a run that produced nothing as failed', () => {
    expect(resolveIdleRunStatus(false)).toBe('failed');
  });

  it('only ever returns a terminal status — a non-terminal one would keep the panel locked', () => {
    expect(isTerminalAgentRunStatus(resolveIdleRunStatus(true))).toBe(true);
    expect(isTerminalAgentRunStatus(resolveIdleRunStatus(false))).toBe(true);
  });
});
