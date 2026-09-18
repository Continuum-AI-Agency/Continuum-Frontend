/**
 * The surface against the AI SDK transcript.
 *
 * `useJainaChat` is mocked and the transcript is driven by PARTS, because that is now the only
 * thing the surface reads. Before the cutover this file injected a `JainaStreamState` — the
 * 4,000-line reducer's accumulated object — and two of its cases existed only to pin down the
 * reconciliation between that state and the persisted snapshot. There is one owner now
 * (`useChat.messages`), so those cases are re-expressed as what still has to hold: a projected
 * plan and its reasoning survive the turn finishing, and a realtime run-completion does not
 * blank the answer on screen.
 *
 * What is asserted at the dispatch seam is the ARGUMENT to `sendTurn`, not a DOM count: the
 * composer's job is to turn a click into one correctly-shaped turn, and a decision that travels
 * on the wrong typed field fails silently in production.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { JAINA_UI_DATA_PART, type JainaUIMessage } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as React from 'react';
import { useJainaConversationSidebarStore } from '@/lib/jaina/conversation-sidebar-store';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

const withQueryClient = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

/** Props `motion` consumes itself; passing them to a DOM node is a React warning per render. */
const MOTION_ONLY_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'layout',
  'layoutId',
  'drag',
  'onAnimationComplete',
  'onAnimationStart',
  'custom',
]);

let chatStatus: ChatStatus = 'ready';
/** Handle onto the mocked hook's real React state, so a test can push a frame into the transcript. */
let pushMessages: ((next: JainaUIMessage[]) => void) | null = null;

const sendTurnMock = mock(() => Promise.resolve());
const stopMock = mock(() => {});

let runStatusCallback:
  | ((row: {
      runId: string;
      sessionId: string;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
      errorMessage: string | null;
    }) => void)
  | null = null;

const toastShowMock = mock(() => {});
const processAIActionMock = mock(() => {});
const removeChannelMock = mock(() => {});

const mockChannel = {
  on: mock(() => mockChannel),
  subscribe: mock(() => mockChannel),
};

mock.module('next/dynamic', () => ({
  default: () => () => null,
}));

// The surface's shader wrapper is a `motion.div` that starts an animation on mount. happy-dom's
// `Animation.cancel()` rejects `finished` with an AbortError, motion-dom attaches no catch, and
// the rejection surfaces on whatever test is running when cleanup unmounts — a moving ~8ms
// failure in a case that never touched it. Rendering motion as plain elements removes the
// animation rather than the symptom. The REAL module is spread back in: a partial `mock.module`
// deletes every export it omits, for this file and every later one in the same run.
const actualMotion = await import('motion/react');
const plainMotion = new Proxy(
  {},
  {
    get: (_target, tag: string) => {
      const Plain = ({ children, ...rest }: Record<string, unknown> & { children?: ReactNode }) => {
        const domProps = Object.fromEntries(
          Object.entries(rest).filter(
            ([key]) => !MOTION_ONLY_PROPS.has(key) && !key.startsWith('while'),
          ),
        );
        return React.createElement(tag, domProps, children);
      };
      return Plain;
    },
  },
);

mock.module('motion/react', () => ({
  ...actualMotion,
  motion: plainMotion,
  AnimatePresence: ({ children }: { children?: ReactNode }) => children ?? null,
}));

mock.module('@/components/ui/animated-shader-background', () => ({
  AnimatedShaderBackground: () => null,
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: toastShowMock }),
  // A mock.module REPLACES the module: any export the real one has and this one omits is a
  // hard SyntaxError for whatever imports it. ActiveBrandProvider — reachable from the
  // surface through the project-scope chip — imports this one.
  useToastContext: () => null,
}));

mock.module('@/CampaignCanvas/hooks/useCampaignAI', () => ({
  useCampaignAI: () => ({ processAIAction: processAIActionMock }),
}));

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => mockChannel,
    removeChannel: removeChannelMock,
  }),
}));

// `messages` is REAL React state and not a module variable read on every render: history
// hydration lands through `setMessages` from inside an effect, and a plain variable would be
// written without anything re-rendering — the transcript would stay empty and every history
// case would pass for the wrong reason.
mock.module('@/hooks/useJainaChat', () => ({
  // Models what @ai-sdk/react actually does, because the difference is where the bug lived: ONE
  // chat per id, built from `initialMessages` the first time that id is seen, and a `setMessages`
  // bound to the chat it came from. A mock holding one array regardless of the id let a
  // conversation switch that rendered an empty transcript pass every test here.
  useJainaChat: ({
    sessionId,
    initialMessages,
  }: {
    sessionId: string;
    initialMessages?: JainaUIMessage[];
  }) => {
    const [chats, setChats] = React.useState<Record<string, JainaUIMessage[]>>({});
    const created = React.useRef<Record<string, JainaUIMessage[]>>({});
    if (!(sessionId in created.current)) created.current[sessionId] = initialMessages ?? [];
    const messages = chats[sessionId] ?? created.current[sessionId];
    const setMessages = React.useCallback(
      (next: JainaUIMessage[] | ((previous: JainaUIMessage[]) => JainaUIMessage[])) =>
        setChats((previous) => {
          const current = previous[sessionId] ?? created.current[sessionId] ?? [];
          return {
            ...previous,
            [sessionId]: typeof next === 'function' ? next(current) : next,
          };
        }),
      [sessionId],
    );
    pushMessages = setMessages;
    return {
      messages,
      status: chatStatus,
      error: undefined,
      sendTurn: sendTurnMock,
      stop: stopMock,
      setMessages,
    };
  },
}));

mock.module('@/hooks/useJainaRunStatusRealtime', () => ({
  isTerminalRunStatus: (status: string) =>
    status === 'completed' || status === 'failed' || status === 'cancelled',
  useJainaRunStatusRealtime: ({
    onRunStatus,
  }: {
    onRunStatus: NonNullable<typeof runStatusCallback>;
  }) => {
    runStatusCallback = onRunStatus;
  },
}));

mock.module('@/hooks/useBrandIntegrations', () => ({
  useBrandIntegrations: () => ({
    integrations: {
      facebook: {
        accounts: [
          {
            integrationAccountId: 'integration-1',
            externalAccountId: 'act-1',
            alias: 'Primary Meta',
            name: 'Primary Meta',
            type: 'meta_ad_account',
          },
          {
            integrationAccountId: 'integration-2',
            externalAccountId: 'act-2',
            alias: 'Second Meta',
            name: 'Second Meta',
            type: 'meta_ad_account',
          },
          {
            integrationAccountId: 'page-1',
            externalAccountId: 'page-1',
            alias: 'Meta Page',
            name: 'Meta Page',
            type: 'meta_page',
          },
        ],
      },
    },
    isLoading: false,
    isError: false,
    refresh: () => Promise.resolve(),
  }),
}));

mock.module('@/components/ai-elements/conversation', () => ({
  Conversation: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ConversationContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="conversation-content">{children}</div>
  ),
}));

mock.module('@/components/chat/prompt-input', () => ({
  PromptInput: ({
    onSubmit,
    disabled,
    actions,
    inlinePastedText,
  }: {
    onSubmit?: (value: string, attachments?: unknown[]) => void;
    disabled?: boolean;
    actions?: ReactNode;
    inlinePastedText?: boolean;
  }) => (
    <div>
      <div data-testid="prompt-actions">{actions}</div>
      <button
        type="button"
        data-testid="prompt-submit"
        disabled={disabled}
        onClick={() => onSubmit?.('Recommend budget reallocations for this week by campaign')}
      >
        submit
      </button>
      <button
        type="button"
        data-testid="prompt-submit-inline-text"
        disabled={disabled || !inlinePastedText}
        onClick={() =>
          onSubmit?.('Summarize this pasted brief', [
            {
              id: 'paste-1',
              kind: 'inline-text',
              name: 'pasted-text.txt',
              type: 'text/plain',
              status: 'ready',
              text: 'The campaign brief says to prioritize retention.',
            },
          ])
        }
      >
        submit inline text
      </button>
    </div>
  ),
}));

mock.module('@/components/ai-elements/queue', () => ({
  Queue: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  QueueItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  QueueItemActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  QueueItemContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  QueueItemIndicator: () => <div />,
  QueueList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  QueueSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  QueueSectionContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  QueueSectionLabel: ({ label }: { label: string }) => <div>{label}</div>,
  QueueSectionTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  QueueItemAction: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

mock.module('./components/JainaHeader', () => ({
  JainaHeader: () => <div data-testid="jaina-header" />,
}));

mock.module('./components/JainaEmptyState', () => ({
  JainaEmptyState: () => <div data-testid="jaina-empty-state" />,
}));

mock.module('./components/JainaConversationSidebar', () => ({
  JainaConversationSidebar: ({
    sessions,
    onSelectConversation,
  }: {
    sessions: { sessionId: string; title?: string | null }[];
    onSelectConversation: (sessionId: string) => void;
  }) => (
    <div data-testid="conversation-sidebar">
      {sessions.map((session) => (
        <button
          key={session.sessionId}
          type="button"
          data-testid={`select-${session.sessionId}`}
          onClick={() => onSelectConversation(session.sessionId)}
        >
          {session.title}
        </button>
      ))}
    </div>
  ),
}));

// The approval buttons come off `message.pendingToolApprovals` — the projection's own output —
// and no longer off a second `state` prop. That prop is the thing the cutover deleted.
mock.module('./components/JainaMessageItem', () => ({
  JainaMessageItem: ({
    message,
    onApprovalDecision,
  }: {
    message: Record<string, unknown>;
    onApprovalDecision?: (approval: Record<string, unknown>, decision: 'approve' | 'deny') => void;
  }) => {
    const plan = message.plan as { id?: string; title?: string } | undefined;
    const reasoning = (message.reasoning as unknown[] | undefined) ?? [];
    const report = message.report as { blocks?: unknown[] } | undefined;
    const reportV2 = message.reportV2 as { blocks?: unknown[] } | undefined;
    const pendingApprovals =
      (message.pendingToolApprovals as { approvalId: string }[] | undefined) ?? [];
    return (
      <div data-testid={`${String(message.role)}-message`} data-message-id={String(message.id)}>
        <span data-testid={`${String(message.role)}-content`}>{String(message.content ?? '')}</span>
        <span data-testid={`${String(message.role)}-plan-id`}>{plan?.id ?? ''}</span>
        <span data-testid={`${String(message.role)}-plan-title`}>{plan?.title ?? ''}</span>
        <span data-testid={`${String(message.role)}-reasoning-count`}>
          {String(reasoning.length)}
        </span>
        <span data-testid={`${String(message.role)}-report-block-count`}>
          {String(reportV2?.blocks?.length ?? report?.blocks?.length ?? 0)}
        </span>
        <span data-testid={`${String(message.role)}-report-kind`}>
          {reportV2 ? 'v2' : report ? 'legacy' : 'none'}
        </span>
        <span data-testid={`${String(message.role)}-run-id`}>{String(message.runId ?? '')}</span>
        <span data-testid={`${String(message.role)}-delivery-source`}>
          {String(message.deliverySource ?? '')}
        </span>
        {pendingApprovals.map((approval) => (
          <button
            key={approval.approvalId}
            type="button"
            data-testid={`approve-${approval.approvalId}`}
            onClick={() => onApprovalDecision?.(approval, 'approve')}
          >
            approve
          </button>
        ))}
      </div>
    );
  },
}));

const { JainaChatSurface } = await import('./JainaChatSurface');

type MockFetchResponse = {
  ok: boolean;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

function jsonResponse(payload: unknown): MockFetchResponse {
  return {
    ok: true,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  };
}

type Part = Record<string, unknown>;

const uiMessage = (
  id: string,
  role: 'user' | 'assistant',
  parts: Part[],
  metadata?: Record<string, unknown>,
): JainaUIMessage =>
  ({ id, role, parts, ...(metadata ? { metadata } : {}) }) as unknown as JainaUIMessage;

const textPart = (value: string): Part => ({ type: 'text', text: value });
const reasoningPart = (value: string): Part => ({ type: 'reasoning', text: value });

/** A gated tool as the SDK models it mid-pause: the native state IS the pending approval. */
const approvalRequestedPart = (fields: {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}): Part => ({
  type: 'dynamic-tool',
  state: 'approval-requested',
  toolCallId: fields.toolCallId,
  toolName: fields.toolName,
  input: fields.input,
  approval: { id: fields.approvalId },
});

const surface = (
  <JainaChatSurface
    brandProfileId="brand-1"
    brandName="Test Brand"
    adAccountId="act-1"
    campaignId={null}
    userId="user-1"
  />
);

/** Empty history plus a session the composer can dispatch into. */
const emptyHistoryFetch = () =>
  mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('/api/agents/jaina/chat/conversations?')) {
      return Promise.resolve(jsonResponse({ sessions: [], uiMessages: [] }));
    }
    if (method === 'POST' && url.endsWith('/api/agents/jaina/chat/conversations')) {
      return Promise.resolve(
        jsonResponse({
          session_id: 'session-1',
          brand_id: 'brand-1',
          ad_account_id: 'act-1',
          conversation_title: null,
        }),
      );
    }
    return Promise.resolve({
      ok: false,
      text: () => Promise.resolve('Unhandled fetch route'),
    } as MockFetchResponse);
  }) as typeof fetch;

/**
 * Put a transcript on screen the way one actually arrives: AFTER mount.
 *
 * Seeding the mocked hook's initial state does not survive — the history effect finds no session
 * for a fresh conversation and resets the transcript to empty, which is correct behaviour and
 * would silently blank any seed. Waiting for the empty state proves that effect has already run.
 */
const showMessages = async (messages: JainaUIMessage[]) => {
  await screen.findByTestId('jaina-empty-state', undefined, { timeout: 2000 });
  act(() => {
    pushMessages?.(messages);
  });
};

describe('JainaChatSurface integration', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    cleanup();
    chatStatus = 'ready';
    pushMessages = null;
    useJainaConversationSidebarStore.getState().clear();

    sendTurnMock.mockClear();
    stopMock.mockClear();
    runStatusCallback = null;
    toastShowMock.mockClear();
    processAIActionMock.mockClear();
    removeChannelMock.mockClear();
    mockChannel.on.mockClear();
    mockChannel.subscribe.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    useJainaConversationSidebarStore.getState().clear();
    cleanup();
  });

  it('sends forceReportArtifact when Jaina Pro is selected', async () => {
    global.fetch = emptyHistoryFetch();

    render(surface, { wrapper: withQueryClient });

    await waitFor(() => {
      expect((screen.getByTestId('prompt-submit') as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /create a jaina pro report from this analysis/i,
      }),
    );
    fireEvent.click(screen.getByTestId('prompt-submit'));

    await waitFor(() => {
      expect(sendTurnMock).toHaveBeenCalledTimes(1);
    });

    expect(sendTurnMock.mock.calls[0]?.[0]).toMatchObject({
      query: 'Recommend budget reallocations for this week by campaign',
      forceReportArtifact: true,
      canvas: false,
    });
    expect(sendTurnMock.mock.calls[0]?.[0].adAccountIds).toBeUndefined();
  });

  it('sends pasted text inline without a document upload or reference', async () => {
    global.fetch = emptyHistoryFetch();

    render(surface, { wrapper: withQueryClient });

    await waitFor(() => {
      expect((screen.getByTestId('prompt-submit-inline-text') as HTMLButtonElement).disabled).toBe(
        false,
      );
    });
    fireEvent.click(screen.getByTestId('prompt-submit-inline-text'));

    await waitFor(() => expect(sendTurnMock).toHaveBeenCalledTimes(1));
    const request = sendTurnMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request.query).toContain('Summarize this pasted brief');
    expect(request.query).toContain('The campaign brief says to prioritize retention.');
    expect(request.documents).toBeUndefined();
    expect(request.documentScopeKey).toBeUndefined();
  });

  it('lets the user include another linked Meta ad account for the turn', async () => {
    global.fetch = emptyHistoryFetch();

    render(surface, { wrapper: withQueryClient });

    await waitFor(() => {
      expect((screen.getByTestId('prompt-submit') as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Meta accounts: 1 of 2 included' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Second Meta' }));
    fireEvent.click(screen.getByTestId('prompt-submit'));

    await waitFor(() => expect(sendTurnMock).toHaveBeenCalledTimes(1));
    expect(sendTurnMock.mock.calls[0]?.[0]).toMatchObject({
      adAccountId: 'act-1',
      adAccountIds: ['act-1', 'act-2'],
    });
  });

  /**
   * The gate's routing fork. Both decisions ride the SAME chat POST; they differ only
   * in which typed field carries them, and getting that wrong is silent — the backend
   * reads the field it expects, finds nothing, and the paused turn simply never
   * resumes. A scaffold answered as a tool_action would also skip the ordered gate row
   * the database enforces.
   */
  describe('approval decisions route by tool', () => {
    const decide = async (approval: {
      approvalId: string;
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
    }) => {
      global.fetch = emptyHistoryFetch();
      render(surface, { wrapper: withQueryClient });
      await showMessages([
        uiMessage('user-1', 'user', [textPart('Publish it')]),
        uiMessage('assistant-1', 'assistant', [
          textPart('I need your approval first.'),
          approvalRequestedPart(approval),
        ]),
      ]);

      fireEvent.click(
        await screen.findByTestId(`approve-${approval.approvalId}`, undefined, { timeout: 2000 }),
      );
      await waitFor(() => {
        expect(sendTurnMock).toHaveBeenCalledTimes(1);
      });
      return sendTurnMock.mock.calls[0]?.[0] as Record<string, unknown>;
    };

    it('posts tool_action for a gated tool that is not a scaffold', async () => {
      const sent = await decide({
        approvalId: 'appr_aud_1',
        toolCallId: 'call_1',
        toolName: 'audience_group_publish',
        input: { group_version_id: 'agv_1' },
      });

      expect(sent).toMatchObject({
        // The typed field is the whole channel; the query string exists only because
        // the request schema requires a non-empty one.
        toolAction: {
          decision: 'approve',
          approval_id: 'appr_aud_1',
          tool_call_id: 'call_1',
        },
        query: 'Approved.',
        // The decision is not something a reader typed: it must not land in the transcript.
        silent: true,
      });
      expect(sent.scaffoldAction).toBeUndefined();
    });

    it('posts scaffold_action, with its gate and version, for a scaffold', async () => {
      const sent = await decide({
        approvalId: 'appr_scaffold_1',
        toolCallId: 'call_2',
        toolName: 'paid_scaffold_build',
        input: { scaffold_version_id: '11111111-1111-4111-8111-111111111111' },
      });

      expect(sent).toMatchObject({
        scaffoldAction: {
          decision: 'approve',
          approval_id: 'appr_scaffold_1',
          scaffold_version_id: '11111111-1111-4111-8111-111111111111',
          gate: 'build',
          tool_call_id: 'call_2',
        },
      });
      expect(sent.toolAction).toBeUndefined();
    });
  });

  /**
   * Re-expressed from `keeps plan + reasoning visible after response.done snapshot refresh`,
   * which was RED at HEAD. The plan used to be held in reducer state and the finished turn was
   * re-read from a persisted snapshot that never carried one, so finishing the turn erased the
   * card. There is no second read now: the plan is inferred from the SAME reasoning parts on
   * every projection, so it cannot survive streaming and then vanish on completion.
   */
  it('keeps the projected plan and its reasoning after the turn finishes', async () => {
    global.fetch = emptyHistoryFetch();
    const planNarration = JSON.stringify({
      plan_id: 'fallback_uqc00d',
      chat_title: 'Recommend Budget Reallocations For This Week BY Campaign',
      description: 'Scope: last_7d',
      steps: [
        { title: 'Analyze campaign performance and recommend reallocations.', status: 'pending' },
      ],
    });

    render(surface, { wrapper: withQueryClient });
    chatStatus = 'streaming';
    await showMessages([
      uiMessage('user-1', 'user', [
        textPart('Recommend budget reallocations for this week by campaign'),
      ]),
      uiMessage('assistant-1', 'assistant', [reasoningPart(planNarration)], {
        runId: 'run-1',
      }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByTestId('assistant-plan-title').at(-1)?.textContent).toContain(
        'Recommend Budget Reallocations For This Week BY Campaign',
      );
    });

    // The turn completes: the answer text lands and the SDK goes idle. Nothing else changes.
    // `chatStatus` is flipped before the push so ONE render carries both — a second
    // `rerender` after the transcript settles races the surface's own unmount-on-cleanup.
    chatStatus = 'ready';
    act(() => {
      pushMessages?.([
        uiMessage('user-1', 'user', [
          textPart('Recommend budget reallocations for this week by campaign'),
        ]),
        uiMessage(
          'assistant-1',
          'assistant',
          [reasoningPart(planNarration), textPart('Move 20% of spend to the Influencer campaign.')],
          { runId: 'run-1', status: 'completed' },
        ),
      ]);
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('assistant-plan-id').at(-1)?.textContent).toBe(
        'fallback_uqc00d',
      );
      expect(screen.getAllByTestId('assistant-reasoning-count').at(-1)?.textContent).toBe('1');
      expect(screen.getAllByTestId('assistant-content').at(-1)?.textContent).toContain(
        'Move 20% of spend',
      );
    });
  });

  /**
   * Re-expressed from `keeps the live reader attached when run completion precedes
   * response.done`, also RED at HEAD. The old surface detached its NDJSON reader on the realtime
   * row and re-read the turn from a snapshot, which raced the last frames off the screen. There
   * is no reader to detach any more — the claim that survives is the one a reader cares about:
   * an answer on screen does not disappear when realtime says the run finished.
   */
  it('keeps the answer on screen when realtime reports the run completed', async () => {
    global.fetch = emptyHistoryFetch();
    render(surface, { wrapper: withQueryClient });
    chatStatus = 'streaming';
    await showMessages([
      uiMessage('user-1', 'user', [textPart('Why is the cost so low?')]),
      uiMessage(
        'assistant-1',
        'assistant',
        [textPart('The low cost is driven by a focused day-pass value proposition.')],
        { runId: 'run-1' },
      ),
    ]);

    await waitFor(() => {
      expect(screen.getAllByTestId('assistant-content').at(-1)?.textContent).toContain(
        'focused day-pass value proposition',
      );
      expect(runStatusCallback).not.toBeNull();
    });

    await act(async () => {
      runStatusCallback?.({
        runId: 'run-1',
        sessionId: 'session-1',
        status: 'completed',
        errorMessage: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getAllByTestId('assistant-content').at(-1)?.textContent).toContain(
      'focused day-pass value proposition',
    );
  });

  /**
   * History arrives already parts-shaped (`shape=ui`), mapped on the Backend beside the live
   * mapper. The client no longer unwraps a persisted `response.checkpoint_report` envelope of
   * its own — if it did, a reloaded report and a streamed one would be two different renders.
   */
  it('renders a report reloaded from history out of its parts', async () => {
    const session = {
      sessionId: 'session-report',
      brandId: 'brand-1',
      adAccountId: 'act-1',
      title: 'Weekly health report',
      lastMessageRole: 'assistant',
      lastMessagePreview: 'Weekly health report',
      lastMessageAt: '2026-04-17T16:30:00.000Z',
      createdAt: '2026-04-17T16:20:00.000Z',
      updatedAt: '2026-04-17T16:30:00.000Z',
    };
    const historyMessages = [
      uiMessage(
        'assistant-history-1',
        'assistant',
        [
          {
            type: JAINA_UI_DATA_PART.reportBlock,
            id: 'run_history_1:block:blk_narrative_1',
            data: {
              block_id: 'blk_narrative_1',
              category: 'narrative',
              scope: 'account',
              title: 'Executive Narrative',
              body: 'Performance was stable over the last week.',
            },
          },
          {
            type: JAINA_UI_DATA_PART.reportMeta,
            id: 'run_history_1:report',
            data: {
              language: 'en',
              executive_summary: 'Stable performance with actionable risks',
              reasoning_trace: '',
              follow_up_questions: [],
              media_map: {},
              handoff_trace: [],
              execution_objectives: [],
              cached_sources: [],
              _meta: {
                schema_version: '2',
                block_count: 1,
                has_charts: false,
                has_media: false,
                primary_scope: 'account',
              },
            },
          },
        ],
        { runId: 'run_history_1', status: 'completed' },
      ),
    ];

    global.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (method === 'GET' && url.includes('/api/agents/jaina/chat/conversations?')) {
        return Promise.resolve(
          jsonResponse({
            sessions: [session],
            uiMessages: url.includes('sessionId=session-report') ? historyMessages : [],
          }),
        );
      }

      return Promise.resolve({
        ok: false,
        text: () => Promise.resolve('Unhandled fetch route'),
      } as MockFetchResponse);
    }) as typeof fetch;

    render(surface, { wrapper: withQueryClient });

    await waitFor(() => {
      expect(screen.getAllByTestId('assistant-report-block-count').at(-1)?.textContent).toBe('1');
      expect(screen.getAllByTestId('assistant-report-kind').at(-1)?.textContent).toBe('v2');
      expect(screen.getAllByTestId('assistant-run-id').at(-1)?.textContent).toBe('run_history_1');
      // The report acknowledges its own delivery by this field, and that ack is the quality
      // signal the Backend grades on. A loaded report must say it was replayed.
      expect(screen.getAllByTestId('assistant-delivery-source').at(-1)?.textContent).toBe(
        'hydration_replay',
      );
    });
  });

  it('shows the history of a conversation picked from the sidebar', async () => {
    // A different session is a different chat. `useChat` builds it from `initialMessages` and
    // stops the old one, so history written through the OLD chat's setter lands in the chat being
    // thrown away and the reader is shown an empty transcript.
    const session = (sessionId: string, title: string) => ({
      sessionId,
      brandId: 'brand-1',
      adAccountId: 'act-1',
      title,
      lastMessageRole: 'assistant',
      lastMessagePreview: title,
      lastMessageAt: '2026-04-17T16:30:00.000Z',
      createdAt: '2026-04-17T16:20:00.000Z',
      updatedAt: '2026-04-17T16:30:00.000Z',
    });
    const sessions = [session('session-a', 'First'), session('session-b', 'Second')];
    const historyFor = (sessionId: string) => [
      uiMessage(`${sessionId}-user`, 'user', [textPart(`question in ${sessionId}`)]),
      uiMessage(`${sessionId}-answer`, 'assistant', [textPart(`answer in ${sessionId}`)], {
        runId: `run_${sessionId}`,
        status: 'completed',
      }),
    ];

    global.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (
        (init?.method ?? 'GET') === 'GET' &&
        url.includes('/api/agents/jaina/chat/conversations?')
      ) {
        const picked = new URL(url, 'http://localhost').searchParams.get('sessionId');
        return Promise.resolve(
          jsonResponse({ sessions, uiMessages: picked ? historyFor(picked) : [] }),
        );
      }
      return Promise.resolve({
        ok: false,
        text: () => Promise.resolve('Unhandled fetch route'),
      } as MockFetchResponse);
    }) as typeof fetch;

    render(surface, { wrapper: withQueryClient });
    await waitFor(() => {
      expect(screen.getAllByTestId('assistant-content').at(-1)?.textContent).toBe(
        'answer in session-a',
      );
    });

    fireEvent.click(screen.getByTestId('select-session-b'));

    await waitFor(() => {
      expect(screen.getAllByTestId('assistant-content').at(-1)?.textContent).toBe(
        'answer in session-b',
      );
    });
    expect(screen.getAllByTestId('user-content').map((node) => node.textContent)).toEqual([
      'question in session-b',
    ]);
  });

  it('acknowledges a report the reader watched arrive as a live render', async () => {
    // Messages pushed through the hook arrived over the stream, never through history, so they
    // must be graded `live_render`. Without a source at all the report sends no ack, and the
    // delivery signal goes silent without a single error.
    render(surface, { wrapper: withQueryClient });
    await waitFor(() => expect(pushMessages).not.toBeNull());

    chatStatus = 'ready';
    act(() => {
      pushMessages?.([
        uiMessage('user-live', 'user', [textPart('How did last week go?')]),
        uiMessage('assistant-live', 'assistant', [textPart('Spend held steady.')], {
          runId: 'run_live_1',
          status: 'completed',
        }),
      ]);
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('assistant-delivery-source').at(-1)?.textContent).toBe(
        'live_render',
      );
    });
    // A user turn has no report and no delivery to acknowledge.
    expect(screen.getAllByTestId('user-delivery-source').at(-1)?.textContent).toBe('');
  });
});
