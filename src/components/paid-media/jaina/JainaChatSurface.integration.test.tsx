import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useJainaConversationSidebarStore } from '@/lib/jaina/conversation-sidebar-store';
import { createInitialJainaStreamState, type JainaStreamState } from '@/lib/jaina/stream';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

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
    <button onClick={onClick}>{children}</button>
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
  JainaMessageItem: ({ message }: { message: Record<string, unknown> }) => {
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
    );

    await waitFor(() => {
      const reportBlockCount = screen.getAllByTestId('assistant-report-block-count').at(-1);
      const reportKind = screen.getAllByTestId('assistant-report-kind').at(-1);
      expect(reportBlockCount?.textContent).toBe('1');
      expect(reportKind?.textContent).toBe('v2');
    });
  });
});
