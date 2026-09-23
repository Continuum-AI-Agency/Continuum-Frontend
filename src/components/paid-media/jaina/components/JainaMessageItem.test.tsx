/**
 * The migration's whole claim, in one assertion: a turn rendered from the AI SDK's `message.parts`
 * is the SAME DOM as the equivalent persisted message.
 *
 * `JainaMessageItem` used to take a second prop — a raw `JainaStreamState` — and choose between it
 * and `message.*` in fourteen places. If parts cannot reproduce what that state produced, the
 * reducer cannot be deleted. So this renders both halves and diffs the markup, rather than
 * asserting each field again (the projection's own suite does that).
 *
 * Everything asserted here is a POSITIVE observable. Frontend tests are excluded from typecheck
 * (`tsconfig.json` 151-162), so a renamed prop reds nothing and "it did not throw" proves nothing.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { JainaUIMessage } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import { toJainaChatMessage } from '@/lib/jaina/uiMessageProjection';
import type { JainaChatMessage } from '../types';

/** `ChatMessage` registers itself with the transcript scroller, so a bare render has no host. */
const wrapper = ({ children }: { children: ReactNode }) => (
  <MessageScrollerProvider>
    <MessageScroller>
      <MessageScrollerViewport>
        <MessageScrollerContent>{children}</MessageScrollerContent>
      </MessageScrollerViewport>
    </MessageScroller>
  </MessageScrollerProvider>
);

// `SafeMarkdownLazy` is a `next/dynamic` wrapper whose only export is `SafeMarkdown`, so this is a
// COMPLETE replacement, not a partial one — a partial `mock.module` deletes a module's other
// exports for every later file in the run.
mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content, className }: { content: string; className?: string }) => (
    <div className={className} data-testid="markdown">
      {content}
    </div>
  ),
}));

const { JainaMessageItem } = await import('./JainaMessageItem');

afterEach(cleanup);

// ---------------------------------------------------------------------------
// One turn, expressed twice: as the parts the SDK delivers, and as the message
// a reload reads back.
// ---------------------------------------------------------------------------

const APPROVAL = {
  approvalId: 'appr_1',
  toolCallId: 'call_gate',
  toolName: 'pause_meta_entity',
  input: { entity_id: '1234', expected_status: 'ACTIVE' },
  expiresAt: '2099-01-01T00:00:00.000Z',
  preview: {
    subject: 'Ad set 1234 · Summer Sale',
    rows: [{ field: 'status', before: 'ACTIVE', after: 'PAUSED' }],
  },
};

const DELEGATION = {
  callId: 'd1',
  callerAgent: 'jaina',
  calleeAgent: 'organic',
  query: 'summarise last week posts',
  status: 'completed',
};

const OBJECTIVE = {
  id: 'o1',
  title: 'Read account spend',
  status: 'completed',
  attempt_count: 0,
  version: 0,
};

// Deliberately NOT a creative payload: `CreativeCard` reaches for the active-brand context to
// re-sign expired storage URLs, and standing up that provider here would test Supabase, not this.
const TOOL_OUTPUT = { spend: 1234.5, roas: 2.1 };

const streamedMessage = (): JainaUIMessage =>
  ({
    id: 'msg_1',
    role: 'assistant',
    metadata: { runId: 'run_1', status: 'completed' },
    parts: [
      { type: 'reasoning', text: 'Reading the account now.' },
      { type: 'text', text: 'Spend is up 12% week on week.' },
      {
        type: 'dynamic-tool',
        toolName: 'get_key_metrics',
        toolCallId: 'call_1',
        state: 'output-available',
        input: { ad_id: '9' },
        output: TOOL_OUTPUT,
      },
      {
        type: 'dynamic-tool',
        toolName: 'pause_meta_entity',
        toolCallId: 'call_gate',
        state: 'approval-requested',
        input: APPROVAL.input,
        approval: { id: 'appr_1' },
      },
      { type: 'data-jaina-approval', id: 'run_1:approval:appr_1', data: APPROVAL },
      { type: 'data-jaina-objective', id: 'run_1:objective:o1', data: OBJECTIVE },
      { type: 'data-jaina-delegation', id: 'run_1:delegation:d1', data: DELEGATION },
      {
        type: 'data-jaina-clarification',
        id: 'run_1:clarification',
        data: { id: 'clar_1', question: 'Which ad account should I pause it in?' },
      },
    ],
  }) as unknown as JainaUIMessage;

/** The same turn as the conversation history hands it back. Written out, never projected. */
const persistedMessage = (): JainaChatMessage =>
  ({
    id: 'msg_1',
    role: 'assistant',
    runId: 'run_1',
    createdAt: '',
    status: 'done',
    // A clarification wins the content ladder, streamed or persisted.
    content: 'Which ad account should I pause it in?',
    renderAsReport: false,
    reasoning: [
      {
        stage: 'thinking',
        at: '',
        detail: 'Reading the account now.',
        data: { stage: 'thinking' },
      },
    ],
    toolCalls: [{ id: 'call_1', name: 'get_key_metrics', args: { ad_id: '9' }, metadata: {} }],
    toolResults: [
      { id: 'call_1', name: 'get_key_metrics', ok: true, cached: false, output: TOOL_OUTPUT },
      { id: 'call_gate', name: 'pause_meta_entity', ok: true, cached: false, output: undefined },
    ].slice(0, 1),
    pendingClarification: { id: 'clar_1', question: 'Which ad account should I pause it in?' },
    objectives: [OBJECTIVE],
    delegations: [DELEGATION],
    pendingToolApprovals: [APPROVAL],
    resolvedApprovals: {},
    deniedToolOutputs: [],
  }) as unknown as JainaChatMessage;

/** React mints `:r0:`-shaped ids per render pass; two renders of the same tree differ only there. */
const normalize = (html: string): string => html.replace(/:r[0-9a-z]+:/g, ':rID:');

describe('JainaMessageItem renders parts and persistence identically', () => {
  it('produces the same DOM from a part-set as from the persisted message', () => {
    const fromParts = render(
      <JainaMessageItem message={toJainaChatMessage(streamedMessage(), { isStreaming: false })} />,
      { wrapper },
    );
    const partsHtml = normalize(fromParts.container.innerHTML);
    cleanup();

    const fromPersisted = render(<JainaMessageItem message={persistedMessage()} />, { wrapper });
    const persistedHtml = normalize(fromPersisted.container.innerHTML);

    // A non-empty diff target: an equality that passes on two empty strings proves nothing.
    expect(partsHtml.length).toBeGreaterThan(500);
    expect(partsHtml).toBe(persistedHtml);
  });

  it('shows the turn prose, the gate and its before to after, and the delegated call', () => {
    render(
      <JainaMessageItem message={toJainaChatMessage(streamedMessage(), { isStreaming: false })} />,
      { wrapper },
    );

    // The clarification is the prose a reader sees, and it also raises its own banner.
    expect(screen.getAllByText('Which ad account should I pause it in?').length).toBeGreaterThan(0);

    // The gate: a uuid on a card is consent to nothing, so the change itself must be on screen.
    expect(screen.getByText('Pause ad set / ad')).toBeTruthy();
    expect(screen.getByText('Awaiting your approval')).toBeTruthy();
    // ACTIVE appears twice on purpose: once as the table's `before`, once in the exact input the
    // approval actually authorises. The table summarises; the argument list IS the call.
    expect(screen.getAllByText('ACTIVE').length).toBe(2);
    expect(screen.getByText('PAUSED')).toBeTruthy();

    // The card typesets the query inside curly quotes, so match on the substring.
    expect(screen.getByText(/summarise last week posts/)).toBeTruthy();
  });

  it('still renders the gate while the turn is streaming', () => {
    render(
      <JainaMessageItem message={toJainaChatMessage(streamedMessage(), { isStreaming: true })} />,
      { wrapper },
    );

    expect(screen.getByText('Pause ad set / ad')).toBeTruthy();
    expect(screen.getByText('PAUSED')).toBeTruthy();
  });

  it('takes no stream-state prop: streaming-ness is read off the message alone', () => {
    // No terminal verdict on the wire yet, which is the only situation where `isStreaming`
    // decides anything. Same parts, different `status` — and the output differs, which is
    // possible only because the component reads streaming-ness off the message.
    const inFlight = (): JainaUIMessage => {
      const message = streamedMessage();
      return { ...message, metadata: { runId: 'run_1' } };
    };

    const live = render(
      <JainaMessageItem message={toJainaChatMessage(inFlight(), { isStreaming: true })} />,
      { wrapper },
    );
    const liveHtml = live.container.innerHTML;
    cleanup();

    const done = render(
      <JainaMessageItem message={toJainaChatMessage(inFlight(), { isStreaming: false })} />,
      { wrapper },
    );

    expect(liveHtml).not.toBe(done.container.innerHTML);
  });

  it('a run that has declared itself finished renders finished, however the caller asks', () => {
    // `messageMetadata.status` rides the TERMINAL chunk and nothing else, so its presence is
    // proof the run ended — for a reader watching live and for one who joined the replay
    // halfway. A caller passing `isStreaming: true` must not put a finished turn, or a FAILED
    // one, back under a spinner.
    const live = render(
      <JainaMessageItem message={toJainaChatMessage(streamedMessage(), { isStreaming: true })} />,
      { wrapper },
    );
    const liveHtml = live.container.innerHTML;
    cleanup();

    const done = render(
      <JainaMessageItem message={toJainaChatMessage(streamedMessage(), { isStreaming: false })} />,
      { wrapper },
    );

    expect(liveHtml).toBe(done.container.innerHTML);
    expect(toJainaChatMessage(streamedMessage(), { isStreaming: true }).status).toBe('done');
  });

  it('renders a user turn as its own text', () => {
    render(
      <JainaMessageItem
        message={
          {
            id: 'msg_0',
            role: 'user',
            content: 'How is spend doing?',
            createdAt: '',
            status: 'done',
          } as JainaChatMessage
        }
      />,
      { wrapper },
    );

    expect(screen.getByText('How is spend doing?')).toBeTruthy();
  });
});

describe('a turn whose prose carries emphasis', () => {
  const marked = (): JainaChatMessage =>
    ({
      ...persistedMessage(),
      content: 'Spend on **ITESO** fell to [risk: 0.49 ROAS] over the [window: last 30 days].',
      pendingClarification: undefined,
    }) as unknown as JainaChatMessage;

  it('sets the judged figure in its severity tone rather than printing the mark', () => {
    render(<JainaMessageItem message={marked()} />, { wrapper });
    const risk = document.querySelector('[data-prose-mark="risk"]');
    expect(risk?.textContent).toBe('0.49 ROAS');
    expect(risk?.className).toContain('text-destructive');
    expect(document.querySelector('[data-prose-mark="window"]')?.className).toContain(
      'text-muted-foreground',
    );
    expect(document.body.textContent).not.toContain('[risk:');
  });
});

describe('a finished turn that produced no answer', () => {
  const emptyTurn = (status: JainaChatMessage['status']): JainaChatMessage =>
    ({
      id: `msg_${status}`,
      role: 'assistant',
      createdAt: '',
      status,
      content: '',
      renderAsReport: false,
    }) as unknown as JainaChatMessage;

  // With no thought to fall back on, a failed run with no answer used to read "Response complete."
  it('says the run failed rather than that it completed', () => {
    render(<JainaMessageItem message={emptyTurn('error')} />, { wrapper });
    expect(screen.getByText('Jaina could not finish this response.')).toBeTruthy();
    expect(screen.queryAllByText('Response complete.')).toHaveLength(0);
  });

  it('still says a finished empty turn completed', () => {
    render(<JainaMessageItem message={emptyTurn('done')} />, { wrapper });
    expect(screen.getByText('Response complete.')).toBeTruthy();
  });
});

describe('a build gate asked for a turn after the proposal', () => {
  // Only propose emits a proposal frame, and scaffold approvals are routed to the scaffold card
  // rather than the generic one — so a turn holding nothing but the gate used to render NO card and
  // NO buttons: the Approve the user asked for, invisible.
  const VERSION = '66666666-6666-4666-8666-666666666666';

  const withTree = ({ children }: { children: ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['paid-scaffold-tree', VERSION], {
      versionId: VERSION,
      rows: [],
      header: { scaffoldId: 'scaffold-1', brandId: '', adAccountId: null },
    });
    return <QueryClientProvider client={client}>{wrapper({ children })}</QueryClientProvider>;
  };

  it('renders the scaffold card with the gate’s Approve button', () => {
    const message = toJainaChatMessage(
      {
        id: 'msg_gate',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'paid_scaffold_build',
            toolCallId: 'call_build',
            state: 'approval-requested',
            input: { scaffold_version_id: VERSION, content_hash: 'abc' },
            approval: { id: 'appr_build' },
          },
        ],
      } as unknown as JainaUIMessage,
      { isStreaming: false },
    );

    render(<JainaMessageItem message={message} onApprovalDecision={() => {}} />, {
      wrapper: withTree,
    });

    expect(screen.getByText('Paid campaign scaffold')).toBeTruthy();
    expect(screen.getByText('Awaiting your approval')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve & create (paused)' })).toBeTruthy();
  });
});
