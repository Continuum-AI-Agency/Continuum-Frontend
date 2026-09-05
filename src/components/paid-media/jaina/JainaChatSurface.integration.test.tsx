import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useJainaConversationSidebarStore } from '@/lib/jaina/conversation-sidebar-store';
import { createInitialJainaStreamState, type JainaStreamState } from '@/lib/jaina/stream';

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

let streamState: JainaStreamState = createInitialJainaStreamState();

const startMock = mock(() => Promise.resolve({}));
const cancelMock = mock(() => {});
const resetMock = mock(() => {});
const clearMemoryMock = mock(() => Promise.resolve());

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

mock.module('@/components/ui/animated-shader-background', () => ({
  AnimatedShaderBackground: () => null,
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: toastShowMock }),
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

mock.module('@/hooks/useJainaChatStream', () => ({
  useJainaChatStream: () => ({
    state: streamState,
    start: startMock,
    cancel: cancelMock,
    reset: resetMock,
    clearMemory: clearMemoryMock,
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
  }: {
    onSubmit?: (value: string, attachments?: unknown[]) => void;
    disabled?: boolean;
    actions?: ReactNode;
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
  JainaConversationSidebar: () => <div data-testid="conversation-sidebar" />,
}));

mock.module('./components/JainaMessageItem', () => ({
  JainaMessageItem: ({
    message,
    state,
    onApprovalDecision,
  }: {
    message: Record<string, unknown>;
    state: JainaStreamState;
    onApprovalDecision?: (approval: Record<string, unknown>, decision: 'approve' | 'deny') => void;
  }) => {
    const plan = message.plan as { id?: string; title?: string } | undefined;
    const reasoning = (message.reasoning as unknown[] | undefined) ?? [];
    const report = message.report as { blocks?: unknown[] } | undefined;
    const reportV2 = message.reportV2 as { blocks?: unknown[] } | undefined;
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
        {/* Stands in for the two approval cards: the real ones derive their pending
            list from this same `state` and call back with the untouched frame. */}
        {state.pendingToolApprovals.map((approval) => (
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

const { JainaChatSurface, mergePersistedMessagesWithLocal } = await import('./JainaChatSurface');

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

describe('JainaChatSurface integration', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    cleanup();
    streamState = createInitialJainaStreamState();
    useJainaConversationSidebarStore.getState().clear();

    startMock.mockClear();
    cancelMock.mockClear();
    resetMock.mockClear();
    clearMemoryMock.mockClear();
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

  it('keeps local V2 checkpoint blocks when a settled snapshot only has legacy report data', () => {
    const merged = mergePersistedMessagesWithLocal(
      [
        {
          id: 'persisted-1',
          role: 'user',
          content: 'Build a pilot comparison dashboard',
          createdAt: '2026-05-05T22:40:00.000Z',
        },
        {
          id: 'persisted-2',
          role: 'assistant',
          content: 'Pilot comparison summary',
          createdAt: '2026-05-05T22:41:00.000Z',
          status: 'done',
          report: {
            language: 'en',
            report_title: '',
            executive_summary: 'Pilot comparison summary',
            budget: null,
            performance_snapshot: [],
            blocks: [],
            sections: [],
            strategic_recommendations: [],
            follow_up_questions: [],
            handoff_trace: [],
            execution_objectives: [],
            cached_sources: [],
            graphs: [],
          },
        },
      ],
      [
        {
          id: 'local-user',
          role: 'user',
          content: 'Build a pilot comparison dashboard',
          createdAt: '2026-05-05T22:40:00.000Z',
        },
        {
          id: 'local-assistant',
          role: 'assistant',
          content: 'Pilot comparison summary',
          createdAt: '2026-05-05T22:41:00.000Z',
          status: 'done',
          reportV2: {
            language: 'en',
            executive_summary: 'Pilot comparison summary',
            follow_up_questions: [],
            media_map: {},
            _meta: {
              schema_version: '2',
              block_count: 2,
              has_charts: false,
              has_media: false,
              primary_scope: 'account',
            },
            blocks: [
              {
                block_id: 'narrative_summary',
                category: 'narrative',
                scope: 'account',
                title: 'Pilot Performance',
                priority: 0,
                body: 'The exposed group had stronger engagement.',
                highlights: [],
              },
              {
                block_id: 'metric_grid_groups',
                category: 'metric_grid',
                scope: 'account',
                title: 'Group Executive Summary',
                priority: 0,
                metrics: [{ label: 'Exposed CTR', value: 0.0106, format: 'percent' }],
              },
            ],
          },
        },
      ],
    );

    const assistant = merged.at(-1);
    expect(assistant?.id).toBe('persisted-2');
    expect(assistant?.reportV2?.blocks).toHaveLength(2);
    expect(assistant?.reportV2?.blocks[1]?.category).toBe('metric_grid');
  });

  it('sends forceReportArtifact when Jaina Pro is selected', async () => {
    global.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (method === 'GET' && url.includes('/api/agents/jaina/chat/conversations?')) {
        return Promise.resolve(
          jsonResponse({
            sessions: [],
            messages: [],
          }),
        );
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

    render(
      <JainaChatSurface
        brandProfileId="brand-1"
        brandName="Test Brand"
        adAccountId="act-1"
        campaignId={null}
        userId="user-1"
      />,
      { wrapper: withQueryClient },
    );

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
      expect(startMock).toHaveBeenCalledTimes(1);
    });

    expect(startMock.mock.calls[0]?.[0]).toMatchObject({
      query: 'Recommend budget reallocations for this week by campaign',
      forceReportArtifact: true,
      canvas: false,
    });
  });

  /**
   * The bug this catches was invisible on every gate: the Backend persists an assistant
   * turn's TEXT and nothing about the approval it is waiting on, and a gate pause
   * persists a deterministic sentence. So the contents match, the snapshot refresh wins,
   * and the only copy of the approval — the card the user has to answer — is dropped a
   * moment after it renders. Observed live against a real audience_group_publish pause.
   */
  it('keeps a pending tool approval when the snapshot refresh brings back the same text', () => {
    const PAUSE_TEXT = 'I need your approval before I create anything on Meta.';
    const approval = {
      approvalId: 'appr_aud_1',
      toolCallId: 'call_1',
      toolName: 'audience_group_publish',
      input: { group_version_id: 'agv_1' },
      expiresAt: '2099-01-01T00:00:00.000Z',
    };

    const merged = mergePersistedMessagesWithLocal(
      [
        {
          id: 'persisted-1',
          role: 'user',
          content: 'Publish the audience group',
          createdAt: '2026-09-05T09:30:00.000Z',
        },
        {
          id: 'persisted-2',
          role: 'assistant',
          content: PAUSE_TEXT,
          createdAt: '2026-09-05T09:30:10.000Z',
          status: 'done',
        },
      ],
      [
        {
          id: 'user-1',
          role: 'user',
          content: 'Publish the audience group',
          createdAt: '2026-09-05T09:30:00.000Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: PAUSE_TEXT,
          createdAt: '2026-09-05T09:30:10.000Z',
          status: 'done',
          pendingToolApprovals: [approval as never],
        },
      ],
    );

    const assistant = merged.filter((message) => message.role === 'assistant').at(-1);
    expect(assistant?.pendingToolApprovals).toHaveLength(1);
    expect(assistant?.pendingToolApprovals?.[0]?.approvalId).toBe('appr_aud_1');
  });

  /**
   * The gate's routing fork. Both decisions ride the SAME chat POST; they differ only
   * in which typed field carries them, and getting that wrong is silent — the backend
   * reads the field it expects, finds nothing, and the paused turn simply never
   * resumes. A scaffold answered as a tool_action would also skip the ordered gate row
   * the database enforces.
   */
  describe('approval decisions route by tool', () => {
    const chatFetch = () =>
      mock((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        if (method === 'GET' && url.includes('/api/agents/jaina/chat/conversations?')) {
          return Promise.resolve(jsonResponse({ sessions: [], messages: [] }));
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

    const decide = async (approval: Record<string, unknown>) => {
      global.fetch = chatFetch();
      streamState = {
        ...createInitialJainaStreamState(),
        pendingToolApprovals: [approval as never],
      };

      render(
        <JainaChatSurface
          brandProfileId="brand-1"
          brandName="Test Brand"
          adAccountId="act-1"
          campaignId={null}
          userId="user-1"
        />,
        { wrapper: withQueryClient },
      );

      await waitFor(() => {
        expect((screen.getByTestId('prompt-submit') as HTMLButtonElement).disabled).toBe(false);
      });
      // A message has to exist before any card can hang off it.
      fireEvent.click(screen.getByTestId('prompt-submit'));
      await waitFor(() => {
        expect(startMock).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(
        await screen.findByTestId(`approve-${String(approval.approvalId)}`, undefined, {
          timeout: 2000,
        }),
      );
      await waitFor(() => {
        expect(startMock).toHaveBeenCalledTimes(2);
      });
      return startMock.mock.calls[1]?.[0] as Record<string, unknown>;
    };

    it('posts tool_action for a gated tool that is not a scaffold', async () => {
      const sent = await decide({
        approvalId: 'appr_aud_1',
        toolCallId: 'call_1',
        toolName: 'audience_group_publish',
        input: { group_version_id: 'agv_1' },
        expiresAt: '2099-01-01T00:00:00.000Z',
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
      });
      expect(sent.scaffoldAction).toBeUndefined();
      // The decision is silent: it must not post a second user turn into the transcript.
      expect(screen.getAllByTestId('user-message')).toHaveLength(1);
    });

    it('posts scaffold_action, with its gate and version, for a scaffold', async () => {
      const sent = await decide({
        approvalId: 'appr_scaffold_1',
        toolCallId: 'call_2',
        toolName: 'paid_scaffold_build',
        input: { scaffold_version_id: '11111111-1111-4111-8111-111111111111' },
        expiresAt: '2099-01-01T00:00:00.000Z',
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

  it('keeps plan + reasoning visible after response.done snapshot refresh', async () => {
    global.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (method === 'GET' && url.includes('/api/agents/jaina/chat/conversations?')) {
        if (url.includes('sessionId=')) {
          return Promise.resolve(
            jsonResponse({
              sessions: [
                {
                  sessionId: 'session-1',
                  brandId: 'brand-1',
                  adAccountId: 'act-1',
                  title: null,
                  lastMessageRole: 'assistant',
                  lastMessagePreview: 'Execution plan',
                  lastMessageAt: '2026-04-17T16:26:05.000Z',
                  createdAt: '2026-04-17T16:20:00.000Z',
                  updatedAt: '2026-04-17T16:26:05.000Z',
                },
              ],
              messages: [
                {
                  id: 1,
                  sessionId: 'session-1',
                  brandId: 'brand-1',
                  adAccountId: 'act-1',
                  role: 'user',
                  content: 'Recommend budget reallocations for this week by campaign',
                  createdAt: '2026-04-17T16:26:00.000Z',
                },
                {
                  id: 2,
                  sessionId: 'session-1',
                  brandId: 'brand-1',
                  adAccountId: 'act-1',
                  role: 'assistant',
                  content: JSON.stringify({
                    type: 'response.plan_ready',
                    data: {
                      item_id: 'item_c2c3e91d73af431fa29e61d93977a73c',
                      part_id: 'part_2edfb435d7e640d3b6378e75669530da',
                      plan: {
                        plan_id: 'fallback_uqc00d',
                        chat_title: 'Recommend Budget Reallocations For This Week BY Campaign',
                        date_preset: 'last_7d',
                        objectives: [
                          {
                            task: 'Analyze campaign performance and recommend reallocations.',
                          },
                        ],
                      },
                    },
                  }),
                  createdAt: '2026-04-17T16:26:05.000Z',
                },
              ],
            }),
          );
        }

        return Promise.resolve(
          jsonResponse({
            sessions: [],
            messages: [],
          }),
        );
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

    const view = render(
      <JainaChatSurface
        brandProfileId="brand-1"
        brandName="Test Brand"
        adAccountId="act-1"
        campaignId={null}
        userId="user-1"
      />,
      { wrapper: withQueryClient },
    );

    await waitFor(() => {
      expect(screen.getByTestId('prompt-submit')).toBeTruthy();
      expect((screen.getByTestId('prompt-submit') as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId('prompt-submit'));

    await waitFor(() => {
      const assistantMessages = screen.getAllByTestId('assistant-message');
      expect(assistantMessages.length).toBeGreaterThan(0);
    });

    const plan = {
      id: 'fallback_uqc00d',
      title: 'Recommend Budget Reallocations For This Week BY Campaign',
      description: 'Scope: last_7d',
      status: 'pending' as const,
      steps: [
        {
          title: 'Analyze campaign performance and recommend reallocations.',
          status: 'pending' as const,
        },
      ],
    };
    const reasoning = [
      {
        stage: 'thinking',
        at: '2026-04-17T16:26:02.000Z',
        detail: 'Collecting campaign metrics and trend evidence.',
        data: { stage: 'thinking' },
      },
    ];

    streamState = {
      ...createInitialJainaStreamState(),
      status: 'streaming',
      plan,
      progress: reasoning,
      responseText: '',
    };
    view.rerender(
      <JainaChatSurface
        brandProfileId="brand-1"
        brandName="Test Brand"
        adAccountId="act-1"
        campaignId={null}
        userId="user-1"
      />,
    );

    await waitFor(() => {
      const assistantPlanTitle = screen.getAllByTestId('assistant-plan-title').at(-1);
      expect(assistantPlanTitle?.textContent).toContain(
        'Recommend Budget Reallocations For This Week BY Campaign',
      );
    });

    streamState = {
      ...createInitialJainaStreamState(),
      status: 'complete',
      plan,
      progress: reasoning,
      responseText: '',
      finalContentKind: 'text',
    };
    view.rerender(
      <JainaChatSurface
        brandProfileId="brand-1"
        brandName="Test Brand"
        adAccountId="act-1"
        campaignId={null}
        userId="user-1"
      />,
    );

    await waitFor(() => {
      const assistantPlanId = screen.getAllByTestId('assistant-plan-id').at(-1);
      const assistantReasoningCount = screen.getAllByTestId('assistant-reasoning-count').at(-1);
      const assistantMessage = screen.getAllByTestId('assistant-message').at(-1);

      expect(assistantPlanId?.textContent).toBe('fallback_uqc00d');
      expect(assistantReasoningCount?.textContent).toBe('1');
      expect(assistantMessage?.getAttribute('data-message-id')).toBe('persisted-2');
    });
  });

  it('unwraps response.checkpoint_report blocks from persisted history', async () => {
    global.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (method === 'GET' && url.includes('/api/agents/jaina/chat/conversations?')) {
        if (url.includes('sessionId=session-report')) {
          return Promise.resolve(
            jsonResponse({
              sessions: [
                {
                  sessionId: 'session-report',
                  brandId: 'brand-1',
                  adAccountId: 'act-1',
                  title: 'Weekly health report',
                  lastMessageRole: 'assistant',
                  lastMessagePreview: 'Weekly health report',
                  lastMessageAt: '2026-04-17T16:30:00.000Z',
                  createdAt: '2026-04-17T16:20:00.000Z',
                  updatedAt: '2026-04-17T16:30:00.000Z',
                },
              ],
              messages: [
                {
                  id: 10,
                  sessionId: 'session-report',
                  brandId: 'brand-1',
                  adAccountId: 'act-1',
                  role: 'assistant',
                  content: JSON.stringify({
                    type: 'response.checkpoint_report',
                    data: {
                      report: {
                        executive_summary: 'Stable performance with actionable risks',
                        blocks: [
                          {
                            block_id: 'blk_narrative_1',
                            category: 'narrative',
                            scope: 'account',
                            title: 'Executive Narrative',
                            body: 'Performance was stable over the last week.',
                          },
                        ],
                        _meta: {
                          schema_version: '2',
                          block_count: 1,
                          has_charts: false,
                          has_media: false,
                          has_citations: false,
                          primary_scope: 'account',
                        },
                      },
                    },
                  }),
                  createdAt: '2026-04-17T16:30:00.000Z',
                },
              ],
            }),
          );
        }

        return Promise.resolve(
          jsonResponse({
            sessions: [
              {
                sessionId: 'session-report',
                brandId: 'brand-1',
                adAccountId: 'act-1',
                title: 'Weekly health report',
                lastMessageRole: 'assistant',
                lastMessagePreview: 'Weekly health report',
                lastMessageAt: '2026-04-17T16:30:00.000Z',
                createdAt: '2026-04-17T16:20:00.000Z',
                updatedAt: '2026-04-17T16:30:00.000Z',
              },
            ],
            messages: [],
          }),
        );
      }

      return Promise.resolve({
        ok: false,
        text: () => Promise.resolve('Unhandled fetch route'),
      } as MockFetchResponse);
    }) as typeof fetch;

    render(
      <JainaChatSurface
        brandProfileId="brand-1"
        brandName="Test Brand"
        adAccountId="act-1"
        campaignId={null}
        userId="user-1"
      />,
      { wrapper: withQueryClient },
    );

    await waitFor(() => {
      const reportBlockCount = screen.getAllByTestId('assistant-report-block-count').at(-1);
      const reportKind = screen.getAllByTestId('assistant-report-kind').at(-1);
      expect(reportBlockCount?.textContent).toBe('1');
      expect(reportKind?.textContent).toBe('v2');
    });
  });
});
