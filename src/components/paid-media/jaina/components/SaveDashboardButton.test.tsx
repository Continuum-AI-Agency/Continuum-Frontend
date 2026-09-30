/**
 * What a saved dashboard remembers about the report it came from.
 *
 * `source_prompt` is what "Ask Jaina to refresh" sends. Hard-coded null, the panel fell back
 * to `Refresh the analysis "<title>" with today's data` — a template, not the question — so a
 * dashboard saved from "compare Q3 spend by placement against Q2" refreshed into a generic
 * account summary under that name.
 *
 * The `data_scope` frame is what says which period the figures cover. Four production rows
 * were saved without one and with `window_label` null; a reopened dashboard showed figures
 * with no statement of their window. The save now keeps the report's own frame first even
 * when the person hid it, persists its window, and refuses a report that has no frame.
 *
 * This renders the real chain a person clicks through — JainaMessageItem → JainaReportV2 →
 * SaveDashboardButton — so the prop hops are covered by the same assertion as the write.
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
import { DASHBOARD_SCOPE_MISSING_MESSAGE } from '@/lib/jaina/dashboardBlocks';
import type { CheckpointBlockV2, CheckpointReportV2 } from '@/lib/jaina/schemas';
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
const THE_WINDOW = '2026-08-23 → 2026-09-21';

const scopeFrame = {
  block_id: 'scope',
  category: 'data_scope',
  scope: 'current_account',
  title: 'Scope',
  priority: 1,
  provenance: null,
  dates: THE_WINDOW,
  timezone: 'America/Mexico_City',
  source: 'api',
  notes: [],
} as unknown as CheckpointBlockV2;

const placements = {
  block_id: 'placements',
  category: 'narrative',
  scope: 'current_account',
  title: 'Placement shift',
  priority: 0,
  provenance: null,
  body: 'Reels took 18 points of share.',
  highlights: [],
  citations: [],
} as unknown as CheckpointBlockV2;

const reportWith = (blocks: CheckpointBlockV2[]) =>
  ({
    language: 'en',
    executive_summary: 'Placement spend shifted to Reels.',
    reasoning_trace: '',
    blocks,
    follow_up_questions: [],
    media_map: {},
    handoff_trace: [],
    execution_objectives: [],
    cached_sources: [],
    _meta: {
      schema_version: '2',
      block_count: blocks.length,
      has_charts: false,
      has_media: false,
      primary_scope: 'current_account',
    },
  }) as CheckpointReportV2;

const message = (reportV2: CheckpointReportV2): JainaChatMessage =>
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

function mount(reportV2: CheckpointReportV2, regeneratePrompt?: string) {
  return render(
    <ToastProvider>
      <JainaBrandScopeProvider adAccountId="act_99" brandId="0f1c1c1e-0000-4000-8000-00000000000b">
        <MessageScrollerProvider>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent>
                <JainaMessageItem message={message(reportV2)} regeneratePrompt={regeneratePrompt} />
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
      </JainaBrandScopeProvider>
    </ToastProvider>,
  );
}

function openTheDialog() {
  saveDashboardMock.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Save the visible modules as a dashboard' }));
}

async function saveTheDashboard(): Promise<Record<string, unknown>> {
  openTheDialog();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveDashboardMock).toHaveBeenCalledTimes(1));
  return saveDashboardMock.mock.calls[0]?.[0] as Record<string, unknown>;
}

const categoriesOf = (payload: Record<string, unknown>) =>
  (payload.blocks as Array<{ category: string }>).map((block) => block.category);

describe('saving a Jaina report as a dashboard', () => {
  it('keeps the question the person actually asked, not a template', async () => {
    mount(reportWith([scopeFrame, placements]), THE_QUESTION);
    const payload = await saveTheDashboard();
    expect(payload.source_prompt).toBe(THE_QUESTION);
    // The title is the closest thing to a name, and it is NOT the question.
    expect(payload.source_title).toBe('Scope');
    expect(payload.source_prompt).not.toBe(payload.source_title);
  });

  it('stores null rather than an empty string when the turn carries no question', async () => {
    mount(reportWith([scopeFrame, placements]));
    const payload = await saveTheDashboard();
    expect(payload.source_prompt).toBeNull();
  });

  it('keeps the scope frame first and names the window it states', async () => {
    mount(reportWith([scopeFrame, placements]), THE_QUESTION);
    const payload = await saveTheDashboard();
    expect(categoriesOf(payload)).toEqual(['data_scope', 'narrative']);
    expect(payload.window_label).toBe(THE_WINDOW);
    expect(payload.scope).toBe('current_account');
  });

  it('puts the frame back when the person hid it, so the figures are never saved naked', async () => {
    mount(reportWith([scopeFrame, placements]), THE_QUESTION);
    fireEvent.click(screen.getByRole('button', { name: 'Hide Scope module' }));
    await waitFor(() => expect(screen.queryByTestId('module-scope')).toBeNull());
    const payload = await saveTheDashboard();
    expect(categoriesOf(payload)).toEqual(['data_scope', 'narrative']);
    expect(payload.window_label).toBe(THE_WINDOW);
  });

  it('refuses a report with no scope frame and says what is missing', async () => {
    mount(reportWith([placements]), THE_QUESTION);
    openTheDialog();
    expect(screen.getByText(DASHBOARD_SCOPE_MISSING_MESSAGE)).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(saveDashboardMock).not.toHaveBeenCalled();
  });
});
