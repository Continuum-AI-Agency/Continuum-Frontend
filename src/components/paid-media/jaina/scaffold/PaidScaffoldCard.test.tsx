/**
 * What a person reviewing a proposed campaign actually sees. The tree is seeded straight into the
 * query cache (the card reads Postgres, not the wire), and happy-dom measures every box at 0px —
 * which is the narrow floating panel on the canvas page, so the outline renders, not React Flow.
 *
 * Positive observables only: Frontend tests are not typechecked, so "it rendered" proves nothing.
 */

import { afterEach, describe, expect, it } from 'bun:test';
import {
  type JainaToolApprovalRequiredPayload,
  type PaidScaffoldPlan,
  paidScaffoldPlanSchema,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { seededScaffoldState } from '@/lib/jaina/uiMessageProjection';
import type { PaidScaffoldNodeRow } from '@/lib/paid-media/scaffoldTree';
import { PaidScaffoldCard } from './PaidScaffoldCard';

afterEach(cleanup);

const VERSION = '55555555-5555-4555-8555-555555555555';

const node = (
  fields: Partial<PaidScaffoldNodeRow> & Pick<PaidScaffoldNodeRow, 'id' | 'level' | 'pathKey'>,
): PaidScaffoldNodeRow => ({
  parentId: null,
  ordinal: 0,
  name: fields.pathKey,
  productKey: null,
  angleKey: null,
  conceptKey: null,
  payload: {},
  status: 'pending',
  metaObjectId: null,
  metaCreativeId: null,
  errorMessage: null,
  attempt: 0,
  creativeAssetId: null,
  creativeMedia: null,
  dailyBudgetMinorUnits: null,
  ...fields,
});

const ROWS: PaidScaffoldNodeRow[] = [
  node({ id: 'c', level: 'campaign', pathKey: 'c0', name: 'Easy Fit | Summer' }),
  node({
    id: 'a1',
    parentId: 'c',
    level: 'adset',
    pathKey: 'c0/a0',
    name: 'Prospecting',
    payload: { targeting: { geo_locations: { countries: ['US'] } } },
    dailyBudgetMinorUnits: 6199,
  }),
  node({
    id: 'a2',
    parentId: 'c',
    level: 'adset',
    pathKey: 'c0/a1',
    ordinal: 1,
    name: 'Retargeting',
    dailyBudgetMinorUnits: 3000,
  }),
  node({ id: 'd1', parentId: 'a1', level: 'ad', pathKey: 'c0/a0/ad0' }),
  node({ id: 'd2', parentId: 'a2', level: 'ad', pathKey: 'c0/a1/ad0', creativeAssetId: 'asset-1' }),
];

const HASH = 'a'.repeat(64);

/** Parsed, so a fixture that drifts from the contract fails here rather than passing blind. */
const PLAN: PaidScaffoldPlan = paidScaffoldPlanSchema.parse({
  schema_version: 1,
  objective: 'OUTCOME_SALES',
  currency: 'USD',
  adsets: [
    {
      path_key: 'c0/a0',
      name: 'Prospecting',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      daily_budget_minor_units: 6199,
      budget_basis: '3 conversions/day at $20.66 CPA',
      budget_source: 'derived',
      meta_floor_minor_units: 100,
      raised_to_floor: false,
      expected_conversions_per_day: 3,
      audience: {
        kind: 'group',
        group_version_id: '11111111-1111-4111-8111-111111111111',
        group_name: 'Purchasers LAL',
        member_count: 2,
        members: [
          { label: 'Lookalike 1% · purchasers', kind: 'lookalike' },
          { label: 'Site visitors 30d', kind: 'website' },
        ],
        targeting_summary: 'US · 25-54 · all genders',
        reach: { lower: 1_200_000, upper: 1_400_000 },
      },
      promoted_object: null,
    },
    {
      path_key: 'c0/a1',
      name: 'Retargeting',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      daily_budget_minor_units: 3000,
      budget_basis: 'user',
      budget_source: 'user',
      meta_floor_minor_units: 100,
      raised_to_floor: false,
      expected_conversions_per_day: 1.5,
      audience: {
        kind: 'group',
        group_version_id: '11111111-1111-4111-8111-111111111111',
        group_name: 'Purchasers LAL',
        member_count: 2,
        members: [],
        targeting_summary: 'US · 25-54 · all genders',
        reach: null,
      },
      promoted_object: null,
    },
  ],
  ads: [],
  evidence: [
    {
      decision: 'budget',
      path_key: 'c0/a0',
      claim: 'Sized for 3 conversions a day at the account CPA.',
      metrics: [
        { label: 'CPA', value: 20.66, unit: 'USD', window: 'last_30d', source: 'meta_insights' },
      ],
      provenance: 'server',
      author_id: null,
    },
  ],
  expected: {
    daily_budget_minor_units: 9199,
    currency: 'USD',
    cpa: 20.66,
    cpa_window: 'last_30d',
    conversions_per_day: 4.45,
    basis: 'budget ÷ CPA',
  },
  optimizer_enrollment: {
    portfolio: { new_name: 'Easy Fit | Summer' },
    apply_mode: 'recommend',
    autopilot_scopes: {
      budget: false,
      creative_swap: false,
      audience_change: false,
      new_audience: false,
      new_creatives: false,
    },
  },
  blockers: [],
});

/** Every ad set targeted and every ad carrying a creative — nothing stands in Deploy's way. */
const READY_ROWS: PaidScaffoldNodeRow[] = ROWS.map((row) =>
  row.level === 'adset'
    ? { ...row, payload: { targeting: { geo_locations: { countries: ['US'] } } } }
    : row.level === 'ad'
      ? { ...row, creativeAssetId: 'asset-1', creativeMedia: { kind: 'image' } }
      : row,
);

const DEPLOY_APPROVAL: JainaToolApprovalRequiredPayload = {
  approvalId: 'appr_deploy',
  toolCallId: 'call_deploy',
  toolName: 'paid_scaffold_deploy',
  input: { scaffold_version_id: VERSION, content_hash: HASH },
  expiresAt: '2099-01-01T00:00:00.000Z',
  preview: {
    subject: 'Deploy paused · Easy Fit | Summer v2',
    rows: [{ field: 'campaign · Easy Fit | Summer', before: null, after: 'PAUSED' }],
  },
};

const BUILD_APPROVAL: JainaToolApprovalRequiredPayload = {
  approvalId: 'appr_build',
  toolCallId: 'call_build',
  toolName: 'paid_scaffold_build',
  input: { scaffold_version_id: VERSION, content_hash: 'abc' },
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const renderCard = (
  props: Partial<ComponentProps<typeof PaidScaffoldCard>> = {},
  {
    rows = ROWS,
    plan = null as PaidScaffoldPlan | null,
    contentHash = null as string | null,
    name = 'Easy Fit | Summer' as string | null,
    adAccountId = null as string | null,
    lifecycle = 'proposed',
  } = {},
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // brandId '' keeps the currency read disabled, so nothing reaches for Supabase.
  client.setQueryData(['paid-scaffold-tree', VERSION], {
    versionId: VERSION,
    rows,
    header: {
      scaffoldId: 'scaffold-1',
      brandId: '',
      adAccountId,
      lifecycle,
      name,
      version: 2,
      contentHash,
      plan,
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <PaidScaffoldCard
        scaffold={seededScaffoldState(VERSION)}
        approval={null}
        resolution={null}
        denial={null}
        optimisticDecision={null}
        isStreaming={false}
        {...props}
      />
    </QueryClientProvider>,
  );
};

describe('PaidScaffoldCard', () => {
  it('requests the selected immutable creative slot from its preview button', async () => {
    const requests: string[] = [];
    renderCard(
      { onRequestCreative: (query) => requests.push(query) },
      {
        adAccountId: 'act_1',
        contentHash: 'a'.repeat(64),
        lifecycle: 'proposed',
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate / Enrich' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toContain('paid_creative_generate');
    expect(requests[0]).toContain(VERSION);
    expect(requests[0]).toContain('c0/a0/ad0');
    expect(requests[0]).toContain('expected_asset_id":null');
    expect(requests[0]).toContain('generation permission gate');
  });

  it('highlights combined publication and sends either human-selected mode', () => {
    const decisions: unknown[] = [];
    const approval = { ...BUILD_APPROVAL, toolName: 'paid_scaffold_publish' };
    renderCard({ approval, onDecide: (...args) => decisions.push(args) });
    const primary = screen.getByRole('button', { name: 'Publish & auto-enroll' });
    expect(primary.className).toContain('bg-primary');
    fireEvent.click(primary);
    fireEvent.click(screen.getByRole('button', { name: 'Publish only' }));
    expect(decisions).toEqual([
      [approval, 'approve', 'publish_and_enroll'],
      [approval, 'approve', 'publish_only'],
    ]);
  });
  it('calls a bare proposal a proposal, not a gate nobody can answer', () => {
    renderCard();
    expect(screen.getByText('Proposed — nothing on Meta yet')).toBeTruthy();
    expect(screen.queryByText('Awaiting your approval')).toBeNull();
    // No chat to carry an operator action and no gate open: no action at all.
    expect(screen.queryByTestId('scaffold-deploy')).toBeNull();
  });

  it('offers ONE Deploy paused that opens the gate with the version and its hash', () => {
    const calls: { action: unknown; text: string }[] = [];
    renderCard(
      { onDeploy: (action, text) => calls.push({ action, text }) },
      { rows: READY_ROWS, plan: PLAN, contentHash: HASH },
    );
    const deploy = screen.getByTestId('scaffold-deploy');
    expect(deploy.textContent).toBe('Deploy paused');
    expect(deploy.getAttribute('data-action')).toBe('open');
    expect((deploy as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryAllByRole('button', { name: /Approve &/ })).toHaveLength(0);
    fireEvent.click(deploy);
    expect(calls).toEqual([
      {
        action: {
          tool: 'paid_scaffold_deploy',
          input: { scaffold_version_id: VERSION, content_hash: HASH },
        },
        text: 'Deploy paused: Easy Fit | Summer v2',
      },
    ]);
  });

  it('disables Deploy paused and names every blocker', () => {
    renderCard({ onDeploy: () => {} }, { plan: PLAN, contentHash: HASH });
    expect((screen.getByTestId('scaffold-deploy') as HTMLButtonElement).disabled).toBe(true);
    const blockers = screen.getAllByTestId('scaffold-deploy-blocker');
    const byCode = Object.fromEntries(
      blockers.map((node) => [node.getAttribute('data-code'), node.textContent ?? '']),
    );
    expect(byCode.adset_without_audience).toContain('Retargeting');
    expect(byCode.ad_without_creative).toContain('1 ad has no creative');
  });

  it('says a refusal the compiler raised per ad set once, with its count', () => {
    const blocked = paidScaffoldPlanSchema.parse({
      ...PLAN,
      blockers: [
        { code: 'page_unresolved', path_key: 'c0/a0', message: 'No single Facebook Page' },
        { code: 'page_unresolved', path_key: 'c0/a1', message: 'No single Facebook Page' },
      ],
    });
    renderCard({ onDeploy: () => {} }, { rows: READY_ROWS, plan: blocked, contentHash: HASH });
    const lines = screen.getAllByTestId('scaffold-deploy-blocker');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toBe('No single Facebook Page (2 ad sets)');
    expect((screen.getByTestId('scaffold-deploy') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a refused Deploy clears "Opening…", shows the Backend\'s reason, and can be retried', () => {
    let settle: ((outcome: { ok: true } | { ok: false; reason: string }) => void) | undefined;
    renderCard(
      {
        onDeploy: (_action, _text, onSettled) => {
          settle = onSettled;
        },
      },
      { rows: READY_ROWS, plan: PLAN, contentHash: HASH },
    );
    const deploy = screen.getByTestId('scaffold-deploy') as HTMLButtonElement;
    fireEvent.click(deploy);
    // In flight: a second click is not a second gate.
    expect(deploy.disabled).toBe(true);
    expect(screen.getByText('Opening the approval below…')).toBeTruthy();
    act(() => settle?.({ ok: false, reason: 'Deploy is blocked: no single Facebook Page' }));
    expect(screen.getByTestId('scaffold-deploy-error').textContent).toBe(
      'Deploy is blocked: no single Facebook Page',
    );
    expect(screen.queryByText('Opening the approval below…')).toBeNull();
    expect((screen.getByTestId('scaffold-deploy') as HTMLButtonElement).disabled).toBe(false);
  });

  it('blocks a version with no typed plan by name, once its row has been read', () => {
    renderCard({ onDeploy: () => {} }, { rows: READY_ROWS, plan: null, contentHash: HASH });
    expect((screen.getByTestId('scaffold-deploy') as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByTestId('scaffold-deploy-blockers').querySelector('[data-code="no_plan"]'),
    ).toBeTruthy();
  });

  it('refuses to deploy a version with no content hash, and says why', () => {
    renderCard({ onDeploy: () => {} }, { rows: READY_ROWS, plan: PLAN, contentHash: null });
    expect((screen.getByTestId('scaffold-deploy') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('scaffold-deploy-blockers').textContent).toContain(
      'before one-click deploy',
    );
  });

  it('names a pre-wave frame from its campaign skeleton, else calls it a scaffold', () => {
    renderCard(
      {
        scaffold: {
          ...seededScaffoldState(VERSION),
          plan: { campaigns: [{ name: 'Legacy Summer' }] },
        },
      },
      { rows: [], name: null },
    );
    expect(screen.getByText('Legacy Summer')).toBeTruthy();

    cleanup();
    renderCard({}, { rows: [], name: null });
    expect(screen.getByText('Scaffold')).toBeTruthy();
  });

  it('answers an open deploy gate with the same button, and shows what it creates', () => {
    const decisions: string[] = [];
    renderCard(
      {
        approval: DEPLOY_APPROVAL,
        onDecide: (_approval, decision) => decisions.push(decision),
        onDeploy: () => decisions.push('opened-another'),
      },
      { rows: READY_ROWS, plan: PLAN, contentHash: HASH },
    );
    expect(screen.getByText('Awaiting your approval')).toBeTruthy();
    expect(screen.getByTestId('scaffold-gate-preview').textContent).toContain('PAUSED');
    const deploy = screen.getByTestId('scaffold-deploy');
    expect(deploy.getAttribute('data-action')).toBe('approve');
    fireEvent.click(deploy);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(decisions).toEqual(['approve', 'deny']);
  });

  it('answers a legacy build gate with the label that says what it does', () => {
    renderCard(
      { approval: BUILD_APPROVAL, onDecide: () => {} },
      { rows: READY_ROWS, plan: PLAN, contentHash: HASH },
    );
    expect(screen.getByTestId('scaffold-deploy').textContent).toBe('Approve & create (paused)');
  });

  it('says the gate was declined from the resolution alone', () => {
    renderCard({
      resolution: {
        approvalId: 'appr_build',
        toolCallId: 'call_build',
        toolName: 'paid_scaffold_build',
        decision: 'denied',
      },
    });
    expect(screen.getByText('Declined — nothing created')).toBeTruthy();
  });

  it('summarises the plan: objective, budget, expected results, audiences, creatives, optimizer', () => {
    renderCard({}, { rows: READY_ROWS, plan: PLAN, contentHash: HASH });
    const cell = (key: string) => screen.getByTestId(`scaffold-summary-${key}`).textContent;
    expect(cell('objective')).toContain('Sales');
    expect(cell('budget')).toContain('$91.99/day');
    expect(cell('expected')).toContain('≈ 4.5/day');
    expect(cell('expected')).toContain('$20.66 CPA');
    expect(cell('audiences')).toContain('1');
    expect(cell('creatives')).toContain('2 of 2');
    expect(cell('optimizer')).toContain('Recommend · autopilot off');
  });

  it('shows why, with the numbers each claim rests on', () => {
    renderCard({}, { rows: READY_ROWS, plan: PLAN, contentHash: HASH });
    const item = screen.getByTestId('scaffold-evidence-item');
    expect(item.getAttribute('data-decision')).toBe('budget');
    expect(item.textContent).toContain('Sized for 3 conversions a day');
    expect(screen.getByTestId('scaffold-evidence-metric').textContent).toContain('$20.66');
    expect(screen.getByTestId('scaffold-evidence-metric').textContent).toContain('last 30d');
  });

  it('lists a shared audience once, with its reach, members and every ad set it feeds', () => {
    renderCard({}, { rows: READY_ROWS, plan: PLAN, contentHash: HASH });
    const audiences = screen.getAllByTestId('scaffold-audience');
    expect(audiences).toHaveLength(1);
    const text = audiences[0]?.textContent ?? '';
    expect(text).toContain('Purchasers LAL');
    expect(text).toContain('US · 25-54 · all genders');
    expect(text).toContain('1.2M–1.4M people');
    expect(text).toContain('Lookalike 1% · purchasers');
    expect(text).toContain('Prospecting, Retargeting');
  });

  it('counts from the rows even when the frame carried no summary', () => {
    renderCard();
    expect(screen.getByText(/1 campaign · 2 ad sets · 2 ads/)).toBeTruthy();
  });

  it('links to the scaffold on the campaign canvas', () => {
    renderCard();
    expect(screen.getByTestId('scaffold-open-canvas').getAttribute('href')).toBe(
      '/scale/campaign-canvas?scaffold=scaffold-1',
    );
  });

  it('draws an outline, not an unreadable graph, in a narrow panel', () => {
    renderCard();
    const outline = screen.getByTestId('scaffold-outline');
    expect(outline.textContent).toContain('Easy Fit | Summer');
    expect(outline.textContent).toContain('Prospecting');
    // No account currency resolves without a brand, so the figure prints bare — never as $.
    expect(outline.textContent).toContain('61.99/day');
    expect(outline.textContent).toContain('30.00/day');
  });
});
