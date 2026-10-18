import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, renderHook } from '@testing-library/react';
import { type ComponentType, useMemo } from 'react';
import { ChatTranscript } from '@/components/chat/ChatTranscript';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

// The render counter rides the one component every row renders, keyed by message id. The
// wrapper renders the REAL ChatMessage, so the process-wide module mock changes nothing
// for any other spec in the same run except that this map fills up.
const rendersById = new Map<string, number>();
const realChatMessage = await import('@/components/chat/ChatMessage');
const RealChatMessage = realChatMessage.ChatMessage;
mock.module('@/components/chat/ChatMessage', () => ({
  ...realChatMessage,
  ChatMessage: (props: Parameters<typeof RealChatMessage>[0]) => {
    rendersById.set(props.id, (rendersById.get(props.id) ?? 0) + 1);
    return <RealChatMessage {...props} />;
  },
}));

const { NO_ACTIVE_STAGES, OrganicMessageRow, rowRunState, useStableRowActions } = await import(
  './OrganicMessageRow'
);
const { initialPanelState, panelReducer } = await import('./useOrganicAgentReducer');
type RowProps = import('./OrganicMessageRow').OrganicMessageRowProps;
type PanelState = import('./useOrganicAgentReducer').PanelState;

const noop = () => {};
const ACTIONS: RowProps['actions'] = {
  onEnrichDraft: noop,
  onGenerateMedia: noop,
  onRetryJob: noop,
  onPlanDecision: noop,
  onStartBulkRun: noop,
  onOpenDraftIn: noop,
  onViewDraft: noop,
  onUseAsset: noop,
  onSkillSaved: noop,
  onRetryTurn: noop,
};
const THREAD_LENGTH = 60;
const DELTAS = 10;
// Assistant turns that called a tool: the only rows that read run state.
const TOOL_ROWS = new Set(['m1', 'm3']);

function seedState(): PanelState {
  const messages = Array.from({ length: THREAD_LENGTH }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `turn ${i}`,
    ...(TOOL_ROWS.has(`m${i}`)
      ? { toolCalls: [{ toolCallId: `call-${i}`, toolName: 'generatePosts', args: {} }] }
      : {}),
  }));
  const streamingId = `m${THREAD_LENGTH - 1}`;
  return { ...initialPanelState(), messages, streamingMessageId: streamingId };
}

// The panel's own wiring, minus the panel: the same state slices and the same stable
// actions object it hands every row.
function Transcript({ state, Row }: { state: PanelState; Row: ComponentType<RowProps> }) {
  const pipelineCardsByToolCallId = useMemo(() => {
    const byToolCallId = new Map<string, PanelState['pipeline'][string][]>();
    for (const card of Object.values(state.pipeline)) {
      if (card.toolCallId) byToolCallId.set(card.toolCallId, [card]);
    }
    return byToolCallId;
  }, [state.pipeline]);
  const runState = {
    pipeline: state.pipeline,
    pipelineCardsByToolCallId,
    planItemStatus: state.planItemStatus,
    bulkRuns: state.bulkRuns,
    jobs: state.jobs,
  };
  return (
    <ChatTranscript anchors={[]}>
      {state.messages.map((msg) => (
        <Row
          key={msg.id}
          msg={msg}
          brandId="brand-1"
          isStreamingRow={msg.id === state.streamingMessageId}
          activeStages={NO_ACTIVE_STAGES}
          autoRetryPending={state.pendingAutoRetry === msg.id}
          isStreaming
          inputDisabled
          {...rowRunState(msg, runState)}
          actions={ACTIONS}
        />
      ))}
    </ChatTranscript>
  );
}

/** Rows rendered per STREAM_DELTA, driven through the real reducer. */
function measureRowRendersPerDelta(Row: ComponentType<RowProps>): number[] {
  let state = seedState();
  const { rerender } = render(<Transcript Row={Row} state={state} />);
  const perDelta: number[] = [];
  for (let i = 0; i < DELTAS; i++) {
    rendersById.clear();
    state = panelReducer(state, { type: 'STREAM_DELTA', delta: ` token${i}` });
    rerender(<Transcript Row={Row} state={state} />);
    perDelta.push([...rendersById.values()].reduce((sum, n) => sum + n, 0));
  }
  return perDelta;
}

// Module mocks are process-wide in bun: hand the next spec the real modules back.
afterAll(() => mock.restore());

describe('OrganicMessageRow render cost', () => {
  afterEach(() => {
    cleanup();
    rendersById.clear();
  });

  it('re-renders only the streaming row on a text delta', () => {
    const perDelta = measureRowRendersPerDelta(OrganicMessageRow);
    console.log(`[render-count] memoized rows: ${perDelta.join(',')} per delta`);
    expect(perDelta.every((count) => count <= 1)).toBe(true);
    expect(perDelta.every((count) => count === 1)).toBe(true);
  });

  it('baseline: the same rows unmemoized re-render the whole thread', () => {
    const Unmemoized = (OrganicMessageRow as unknown as { type: ComponentType<RowProps> }).type;
    const perDelta = measureRowRendersPerDelta(Unmemoized);
    console.log(`[render-count] unmemoized rows: ${perDelta.join(',')} per delta`);
    expect(perDelta.every((count) => count === THREAD_LENGTH)).toBe(true);
  });

  it('a pipeline frame re-renders only the turns that read run state', () => {
    let state = seedState();
    const { rerender } = render(<Transcript Row={OrganicMessageRow} state={state} />);
    rendersById.clear();
    state = panelReducer(state, {
      type: 'PIPELINE_CARD',
      card: { jobId: 'job-1', status: 'running', toolCallId: 'call-1', draftId: 'd1' },
    });
    rerender(<Transcript Row={OrganicMessageRow} state={state} />);
    console.log(`[render-count] rows per pipeline frame: ${rendersById.size}`);
    expect([...rendersById.keys()].sort()).toEqual([...TOOL_ROWS].sort());
  });

  it('hands rows one actions object that always calls the latest handler', () => {
    const calls: string[] = [];
    const actionsFor = (tag: string): RowProps['actions'] => ({
      ...ACTIONS,
      onRetryTurn: () => calls.push(tag),
    });
    const { result, rerender } = renderHook(({ actions }) => useStableRowActions(actions), {
      initialProps: { actions: actionsFor('first') },
    });
    const first = result.current;
    rerender({ actions: actionsFor('second') });
    expect(result.current).toBe(first);
    result.current.onRetryTurn('m1');
    expect(calls).toEqual(['second']);
  });

  it('keeps every row content-visibility: auto with an intrinsic size', () => {
    const { container } = render(<Transcript Row={OrganicMessageRow} state={seedState()} />);
    const items = container.querySelectorAll('[data-slot="message-scroller-item"]');
    expect(items.length).toBe(THREAD_LENGTH);
    for (const item of items) {
      expect(item.className).toContain('[content-visibility:auto]');
      expect(item.className).toContain('[contain-intrinsic-size:auto_10rem]');
    }
  });
});
