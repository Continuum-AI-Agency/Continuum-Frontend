/**
 * What a person reviewing a proposed campaign actually sees. The tree is seeded straight into the
 * query cache (the card reads Postgres, not the wire), and drawn on the canvas's own Read pieces
 * at chat size (design C): changes first, the daily budget, "Open in canvas".
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
    currentVersionId = undefined as string | undefined,
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
      ...(currentVersionId ? { currentVersionId } : {}),
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
    expect(cell('budget')).toContain('$91.99 USD/day');
    expect(cell('expected')).toContain('≈ 4.5/day');
    expect(cell('expected')).toContain('$20.66 USD CPA');
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

  it('a version a correction replaced says so, and offers no approval of its own', () => {
    const decisions: unknown[] = [];
    renderCard(
      {
        approval: DEPLOY_APPROVAL,
        onDecide: (...args) => decisions.push(args),
        onDeploy: () => {},
        supersededByVersion: 3,
      },
      { rows: READY_ROWS, plan: PLAN, contentHash: HASH },
    );
    expect(screen.getByText('Superseded by v3')).toBeTruthy();
    expect(screen.getByTestId('scaffold-superseded').textContent).toContain('v3');
    expect(screen.queryByTestId('scaffold-deploy')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(screen.queryByText('Awaiting your approval')).toBeNull();
    expect(screen.queryByTestId('scaffold-gate-preview')).toBeNull();
    expect(decisions).toEqual([]);
  });

  it('reads a newer current version off the scaffold row when the thread holds none', () => {
    renderCard(
      { onDeploy: () => {} },
      {
        rows: READY_ROWS,
        plan: PLAN,
        contentHash: HASH,
        currentVersionId: '66666666-6666-4666-8666-666666666666',
      },
    );
    expect(screen.getByText('Superseded by a newer version')).toBeTruthy();
    expect(screen.queryByTestId('scaffold-deploy')).toBeNull();
  });

  it('the current version is not superseded', () => {
    renderCard(
      { onDeploy: () => {} },
      { rows: READY_ROWS, plan: PLAN, contentHash: HASH, currentVersionId: VERSION },
    );
    expect(screen.queryByTestId('scaffold-superseded')).toBeNull();
    expect(screen.getByTestId('scaffold-deploy')).toBeTruthy();
  });

  it('links to the scaffold on the campaign canvas', () => {
    renderCard();
    expect(screen.getByTestId('lectura-open-in-canvas').getAttribute('href')).toBe(
      '/scale/campaign-canvas?scaffold=scaffold-1',
    );
  });

  it('draws the campaign in Read at chat size: each ad set with its budget, and the total', async () => {
    renderCard();
    const read = await screen.findByTestId('lectura-chat-card');
    expect(read.textContent).toContain('Easy Fit | Summer');
    const lines = [...read.querySelectorAll('[data-testid="lectura-chat-adsets"] li')].map(
      (line) => line.textContent,
    );
    // No account currency resolves without a brand, so the figure prints bare — never as $.
    expect(lines).toEqual(['Prospecting61.99/day · 1 ad', 'Retargeting30.00/day · 1 ad']);
    expect(read.textContent).toContain('Daily budget91.99/day');
  });
});

/*
 * Every field the version will build, each with who supplied it. The rows carry the values and
 * `field_provenance`; the plan fills in only what a row read before the P5 columns lacks.
 */
describe('PaidScaffoldCard — every field, with who supplied it', () => {
  const P5_ROWS: PaidScaffoldNodeRow[] = [
    node({
      id: 'c',
      level: 'campaign',
      pathKey: 'c0',
      name: 'Easy Fit | Summer',
      payload: { objective: 'OUTCOME_SALES' },
      budgetMode: 'cbo',
      campaignDailyBudgetMinorUnits: 25_000,
      bidStrategy: 'COST_CAP',
      bidAmountMinorUnits: 1_800,
      fieldProvenance: {
        name: 'user_gave',
        budget_mode: 'user_gave',
        bid_strategy: 'jaina_filled',
      },
    }),
    node({
      id: 'a1',
      parentId: 'c',
      level: 'adset',
      pathKey: 'c0/a0',
      name: 'Prospecting',
      payload: {
        optimization_goal: 'OFFSITE_CONVERSIONS',
        targeting: { geo_locations: { countries: ['MX'] } },
        placement: {
          mode: 'manual',
          publisher_platforms: ['instagram'],
          instagram_positions: ['reels'],
        },
      },
      startTime: '2099-01-01T18:00:00+00:00',
      endTime: null,
      customEventType: 'PURCHASE',
      pixelId: '123456789012',
      fieldProvenance: { start_time: 'user_gave', custom_event_type: 'jaina_filled' },
    }),
    node({
      id: 'd1',
      parentId: 'a1',
      level: 'ad',
      pathKey: 'c0/a0/ad0',
      name: 'Try-on reel',
      payload: {
        creative: {
          message: 'Stretch that moves with you.',
          link_url: 'https://easyfit.example/summer',
        },
      },
      urlTags: 'utm_source=meta&utm_medium=paid',
      fieldProvenance: { url_tags: 'user_gave', message: 'jaina_filled' },
    }),
  ];

  const P5_PLAN: PaidScaffoldPlan = paidScaffoldPlanSchema.parse({
    ...PLAN,
    adsets: [
      {
        ...PLAN.adsets[0],
        daily_budget_minor_units: null,
        budget_source: 'derived',
        budget_held_by_campaign: true,
        audience: {
          kind: 'broad',
          targeting: { countries: ['MX'], age_min: 25, age_max: 54, genders: null },
          targeting_summary: 'MX · 25-54 · all genders',
          reach: null,
        },
      },
    ],
    budget_mode: 'cbo',
    campaign_daily_budget_minor_units: 25_000,
    campaign_bid: { strategy: 'COST_CAP', bid_amount_minor_units: 1_800, roas_floor: null },
  });

  const line = (pathKey: string, key: string) => {
    const found = screen
      .getAllByTestId('scaffold-field')
      .find(
        (entry) =>
          entry.getAttribute('data-path') === pathKey && entry.getAttribute('data-key') === key,
      );
    if (!found) throw new Error(`no field ${key} on ${pathKey}`);
    return found;
  };
  const pillOf = (entry: HTMLElement) =>
    entry.querySelector('[data-testid="field-provenance-pill"]')?.textContent ?? null;

  it('shows the campaign: name, objective, budget mode and figure, bid', () => {
    renderCard({}, { rows: P5_ROWS, plan: P5_PLAN, contentHash: HASH });
    expect(line('c0', 'name').textContent).toContain('Easy Fit | Summer');
    expect(pillOf(line('c0', 'name'))).toBe('You gave this');
    expect(line('c0', 'objective').textContent).toContain('Sales');
    expect(line('c0', 'budget_mode').textContent).toContain('Campaign budget (CBO)');
    expect(pillOf(line('c0', 'budget_mode'))).toBe('You gave this');
    expect(line('c0', 'campaign_daily_budget_minor_units').textContent).toContain('$250 USD/day');
    expect(line('c0', 'bid_strategy').textContent).toContain('Cost per result goal');
    expect(line('c0', 'bid_strategy').textContent).toContain('$18.00 USD');
    expect(pillOf(line('c0', 'bid_strategy'))).toBe('Jaina filled this');
  });

  it('shows the ad set: event, pixel, budget, bid, audience, location, placements, schedule', () => {
    renderCard({}, { rows: P5_ROWS, plan: P5_PLAN, contentHash: HASH });
    expect(line('c0/a0', 'name').textContent).toContain('Prospecting');
    expect(line('c0/a0', 'optimization_goal').textContent).toContain('Website conversions');
    expect(line('c0/a0', 'custom_event_type').textContent).toContain('Purchase');
    expect(pillOf(line('c0/a0', 'custom_event_type'))).toBe('Jaina filled this');
    expect(line('c0/a0', 'pixel_id').textContent).toContain('123456789012');
    expect(line('c0/a0', 'daily_budget_minor_units').textContent).toContain(
      'All of the campaign budget (CBO) · $250 USD/day',
    );
    expect(line('c0/a0', 'bid_strategy').textContent).toContain('Set by the campaign');
    expect(line('c0/a0', 'broad_targeting').textContent).toContain('Broad targeting');
    expect(line('c0/a0', 'location').textContent).toContain('MX · 25-54 · all genders');
    expect(line('c0/a0', 'placement_mode').textContent).toContain('instagram');
    expect(line('c0/a0', 'placement_mode').textContent).toContain('ig:reels');
    const schedule = line('c0/a0', 'start_time');
    expect(schedule.textContent).toContain('2099');
    expect(schedule.textContent).toContain('no end date');
    expect(pillOf(schedule)).toBe('You gave this');
  });

  it('shows the ad: creative, copy, URL and UTM — and what Jaina still asks for', () => {
    renderCard({}, { rows: P5_ROWS, plan: P5_PLAN, contentHash: HASH });
    expect(line('c0/a0/ad0', 'name').textContent).toContain('Try-on reel');
    expect(line('c0/a0/ad0', 'message').textContent).toContain('Stretch that moves with you.');
    expect(pillOf(line('c0/a0/ad0', 'message'))).toBe('Jaina filled this');
    expect(line('c0/a0/ad0', 'link').textContent).toContain('https://easyfit.example/summer');
    expect(line('c0/a0/ad0', 'url_tags').textContent).toContain('utm_source=meta&utm_medium=paid');
    expect(pillOf(line('c0/a0/ad0', 'url_tags'))).toBe('You gave this');
    // Nothing attached, nothing recorded: an open question.
    expect(line('c0/a0/ad0', 'creative').textContent).toContain('Not set yet');
    expect(pillOf(line('c0/a0/ad0', 'creative'))).toBe('Jaina asks');
    expect(pillOf(line('c0/a0/ad0', 'headline'))).toBe('Jaina asks');

    const pills = new Set(
      screen.getAllByTestId('field-provenance-pill').map((pill) => pill.textContent),
    );
    expect([...pills].sort()).toEqual(['Jaina asks', 'Jaina filled this', 'You gave this']);
  });

  it('under CBO prints the campaign budget once, and never an own budget on its ad sets', async () => {
    renderCard({}, { rows: P5_ROWS, plan: P5_PLAN, contentHash: HASH });
    const read = await screen.findByTestId('lectura-chat-card');
    expect(read.textContent).toContain('Daily budget$250 USD/day');
    const lines = [...read.querySelectorAll('[data-testid="lectura-chat-adsets"] li')].map(
      (line) => line.textContent,
    );
    expect(lines.every((line) => !line?.includes('/day'))).toBe(true);
    expect(read.textContent).not.toContain('Placeholder budget');
  });

  it("marks a copy's new test ad sets from the Backend's diff, on the card that approves it", async () => {
    renderCard(
      {
        structure: {
          scaffoldId: VERSION,
          parentScaffoldId: 'scaffold-1',
          version: 1,
          layout: 'diff',
          partId: 'campaign-structure:scaffold-1:diff',
          title: 'Easy Fit | Summer',
          counts: { campaigns: 1, adSets: 2, ads: 2, userGave: 0, jainaFilled: 0, jainaAsks: 0 },
          nodes: [],
          truncated: false,
          html: null,
          diff: {
            source: { kind: 'campaign', id: '120', name: 'Easy Fit | Spring' },
            entries: [
              {
                path_key: 'c0/a0',
                source_path_key: 'c0/a0',
                level: 'adset',
                name: 'Prospecting',
                change: 'changed',
                fields: [{ key: 'status', label: 'Status', before: 'ACTIVE', after: 'PAUSED' }],
              },
              {
                path_key: 'c0/a1',
                source_path_key: null,
                level: 'adset',
                name: 'Retargeting',
                change: 'added',
                fields: [
                  { key: 'name', label: 'Name', before: 'Prospecting', after: 'Retargeting' },
                  {
                    key: 'advantage_audience',
                    label: 'Advantage+ audience',
                    before: 'off',
                    after: 'on',
                  },
                ],
              },
            ],
          },
        },
      },
      { rows: READY_ROWS, plan: PLAN, contentHash: HASH },
    );
    const read = await screen.findByTestId('lectura-chat-card');
    // A copied ad set is created paused — that alone is not a change; the new one is.
    expect(read.querySelector('[data-testid="lectura-change-c0/a0"]')).toBeNull();
    const added = read.querySelector('[data-testid="lectura-change-c0/a1"]');
    expect(added?.getAttribute('data-mark')).toBe('added');
    expect(added?.textContent).toContain('Advantage+ audience: off→on');
    expect(added?.textContent).toContain('Based on Prospecting');
  });

  it('reads a version proposed before P5 as ABO, uncapped and unscheduled', () => {
    renderCard({}, { rows: READY_ROWS, plan: PLAN, contentHash: HASH });
    expect(line('c0', 'budget_mode').textContent).toContain('Ad set budgets (ABO)');
    expect(line('c0/a0', 'daily_budget_minor_units').textContent).toContain('$61.99 USD/day');
    expect(line('c0/a0', 'bid_strategy').textContent).toContain('Lowest cost (no cap)');
    expect(line('c0/a0', 'start_time').textContent).toContain(
      'Starts when activated · no end date',
    );
    expect(line('c0/a0', 'custom_event_type').textContent).toContain('From the objective');
    expect(line('c0/a0/ad0', 'url_tags').textContent).toContain('None');
    // No recorded provenance: a value reads as Jaina's, never as the person's.
    expect(pillOf(line('c0/a0', 'bid_strategy'))).toBe('Jaina filled this');
  });
});
