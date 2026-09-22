/**
 * What a saved dashboard remembers about the question it answered.
 *
 * `source_prompt` is the whole point of the row: "Ask Jaina to refresh" sends it back as the
 * prompt. Hard-coded null, the panel fell back to `Refresh the analysis "<title>" with today's
 * data` — a template, not the question — so a dashboard saved from "compare Q3 spend by
 * placement against Q2" refreshed into a generic account summary under that name.
 *
 * This renders the real chain a person clicks through — JainaMessageItem → JainaReportV2 →
 * SaveDashboardButton — so the two prop hops are covered by the same assertion as the write.
 * Only the Supabase write itself is replaced.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { JainaBrandScopeProvider } from '@/lib/jaina/brandScope';
import type { CheckpointReportV2 } from '@/lib/jaina/schemas';
import type { JainaChatMessage } from '../types';

const saveDashboardMock = mock(async (input: Record<string, unknown>) => ({
  ...input,
  id: '0f1c1c1e-0000-4000-8000-000000000001',
  created_at: '2026-09-21T00:00:00Z',
  updated_at: '2026-09-21T00:00:00Z',
}));

const dashboardsClient = await import('@/lib/jaina/dashboards.client');
// Spread the real module: a partial `mock.module` deletes the other exports for every file
// that loads later in the run.
mock.module('@/lib/jaina/dashboards.client', () => ({
  ...dashboardsClient,
  saveDashboard: saveDashboardMock,
}));

mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

mock.module('../blocks/BlockRenderer', () => ({
  BlockRenderer: ({ block }: { block: { block_id: string; title: string } }) => (
    <article data-testid={`module-${block.block_id}`}>{block.title}</article>
  ),
}));

const { JainaMessageItem } = await import('./JainaMessageItem');

afterEach(cleanup);

const THE_QUESTION = 'Compare Q3 spend by placement against Q2, and say what moved.';

const reportV2 = {
  language: 'en',
  executive_summary: 'Placement spend shifted to Reels.',
  reasoning_trace: '',
  blocks: [
    {
      block_id: 'placements',
      category: 'narrative',
      scope: 'current_account',
      title: 'Placement shift',
      priority: 0,
      provenance: null,
      body: 'Reels took 18 points of share.',
      highlights: [],
      citations: [],
    },
  ],
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
    primary_scope: 'current_account',
  },
} as CheckpointReportV2;

const message = (): JainaChatMessage =>
  ({
    id: 'msg_1',
    role: 'assistant',
    runId: 'run_1',
    createdAt: '',
    status: 'done',
    content: 'Placement spend shifted to Reels.',
    renderAsReport: false,
    reasoning: [],
    toolCalls: [],
    objectives: [],
    delegations: [],
    approvals: [],
    reportV2,
  }) as unknown as JainaChatMessage;

function mount(regeneratePrompt?: string) {
  return render(
    <ToastProvider>
      <JainaBrandScopeProvider adAccountId="act_99" brandId="0f1c1c1e-0000-4000-8000-00000000000b">
        <MessageScrollerProvider>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent>
                <JainaMessageItem message={message()} regeneratePrompt={regeneratePrompt} />
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
      </JainaBrandScopeProvider>
    </ToastProvider>,
  );
}

async function saveTheDashboard(): Promise<Record<string, unknown>> {
  saveDashboardMock.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Save the visible modules as a dashboard' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveDashboardMock).toHaveBeenCalledTimes(1));
  return saveDashboardMock.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe('saving a Jaina report as a dashboard', () => {
  it('keeps the question the person actually asked, not a template', async () => {
    mount(THE_QUESTION);
    const payload = await saveTheDashboard();
    expect(payload.source_prompt).toBe(THE_QUESTION);
    // The title is the closest thing to a name, and it is NOT the question.
    expect(payload.source_title).toBe('Placement shift');
    expect(payload.source_prompt).not.toBe(payload.source_title);
  });

  it('stores null rather than an empty string when the turn carries no question', async () => {
    mount(undefined);
    const payload = await saveTheDashboard();
    expect(payload.source_prompt).toBeNull();
  });

  it('leaves the window unnamed, because a V2 report carries no window to name', async () => {
    mount(THE_QUESTION);
    const payload = await saveTheDashboard();
    expect(payload.window_label).toBeNull();
    expect(payload.scope).toBe('current_account');
  });
});
