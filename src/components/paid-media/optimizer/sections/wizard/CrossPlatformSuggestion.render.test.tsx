import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioSuggestion } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const createMutateAsync = mock(async () => ({ portfolio_id: 'p-new' }));
const enrollMutateAsync = mock(async () => ({}));
const createPlatformMutateAsync = mock(async () => ({ portfolio_id: 'p-google' }));
const addMembersMutateAsync = mock(async () => ({ enrolled: 2, already: 0 }));
const runMutate = mock(() => {});

// Spread the real module: `mock.module` replaces it for the whole PROCESS, so a partial
// replacement here would reach the next file in the run.
const realOptimizerData = await import('../../useOptimizerData');
mock.module('../../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerAccountSnapshots: () => ({ data: [], isLoading: false, isError: false }),
  useOptimizerAccountEnrollments: () => ({ data: [], isLoading: false, isError: false }),
  useOptimizerAdsetInventory: () => ({
    data: [],
    fetchedAt: null,
    partial: false,
    truncated: false,
    refresh: () => {},
    canRefresh: true,
    isRefreshing: false,
    isLoading: false,
    isError: false,
  }),
  useOptimizerInsight: () => ({ data: null, isLoading: false }),
  useOptimizerMutations: () => ({
    create: { mutate: mock(() => {}), mutateAsync: createMutateAsync, isPending: false },
    enroll: { mutate: mock(() => {}), mutateAsync: enrollMutateAsync, isPending: false },
    createPlatform: {
      mutate: mock(() => {}),
      mutateAsync: createPlatformMutateAsync,
      isPending: false,
    },
    addMembers: { mutate: mock(() => {}), mutateAsync: addMembersMutateAsync, isPending: false },
    run: { mutate: runMutate, isPending: false },
  }),
}));
// The virtualized Meta picker is stubbed: this suite is about what the suggestion seeds. Its
// one control clears the Meta selection, as unticking every ad set would.
mock.module('../../picker/CampaignAdsetPicker', () => ({
  CampaignAdsetPicker: ({
    selectedAdsetIds,
    onChange,
  }: {
    selectedAdsetIds: string[];
    onChange: (ids: string[]) => void;
  }) => (
    <div>
      <div data-testid="meta-picker">{selectedAdsetIds.join(',')}</div>
      <button onClick={() => onChange([])} type="button">
        Untick every Meta ad set
      </button>
    </div>
  ),
}));
mock.module('../SuggestionExplorer', () => ({
  SuggestionExplorer: () => <div data-testid="explorer" />,
}));

const { PortfolioWizard } = await import('./PortfolioWizard');

const META = 'act_521903353286118';
const GOOGLE = '5251780631';

const metaOnly: PortfolioSuggestion = {
  objective: 'lead',
  name: 'Leads',
  level: 'adset',
  mode: 'efficiency',
  daily_total: 1600,
  cpa_target: 36,
  adset_ids: ['as-1', 'as-2'],
  summary: { adsets: 2, spend14: 4200, conv14: 60 },
  reason: '2 ad sets grouped by Leads objective',
};

const allPlatforms: PortfolioSuggestion = {
  ...metaOnly,
  name: 'Leads // All platforms',
  daily_total: 2100,
  cpa_target: 40,
  members: [
    { platform: 'meta', account_id: META, entity_id: 'as-1', level: 'adset' },
    { platform: 'meta', account_id: META, entity_id: 'as-2', level: 'adset' },
    {
      platform: 'google_ads',
      account_id: GOOGLE,
      entity_id: 'g-1',
      level: 'campaign',
      name: 'Search · Leads GDL',
    },
    {
      platform: 'google_ads',
      account_id: GOOGLE,
      entity_id: 'g-2',
      level: 'campaign',
      name: 'PMax · Leads',
    },
  ],
  by_platform: [
    {
      platform: 'meta',
      account_id: META,
      members: 2,
      daily_total: 1600,
      spend14: 4200,
      conv14: 60,
    },
    {
      platform: 'google_ads',
      account_id: GOOGLE,
      members: 2,
      daily_total: 500,
      spend14: 1400,
      conv14: 45,
    },
  ],
  currency: 'MXN',
  summary: { adsets: 4, spend14: 5600, conv14: 105 },
  reason: '2 ad sets on Meta and 2 campaigns on Google Ads, all buying Leads',
};

beforeEach(() => {
  createMutateAsync.mockClear();
  enrollMutateAsync.mockClear();
  createPlatformMutateAsync.mockClear();
  addMembersMutateAsync.mockClear();
  runMutate.mockClear();
});
afterEach(cleanup);

const renderWizard = (suggestions: PortfolioSuggestion[]) =>
  render(
    <PortfolioWizard
      adAccountId={META}
      brandId="6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64"
      currency="MXN"
      snapshots={[]}
      snapshotsError={false}
      snapshotsLoading={false}
      suggestions={suggestions}
      suggestionsEmptyMessage="None"
      suggestionsError={false}
      suggestionsLoading={false}
    />,
  );

function card(name: string): HTMLElement {
  const heading = screen.getByText(name, { selector: 'p' });
  const article = heading.closest('article');
  if (!article) throw new Error(`no card for ${name}`);
  return article;
}

describe('the Start step — a cross-platform suggestion card', () => {
  it('shows the platform chips and the member count of each platform', () => {
    renderWizard([allPlatforms, metaOnly]);
    const counts = within(card('Leads // All platforms')).getAllByTestId(
      'suggestion-platform-count',
    );
    expect(counts.map((li) => [li.dataset.platform, li.textContent])).toEqual([
      ['meta', 'Meta2 ad sets'],
      ['google_ads', 'Google2 campaigns'],
    ]);
    expect(within(card('Leads // All platforms')).getByText('Members')).toBeDefined();
  });

  it('leaves a Meta-only card exactly as it was: no chips, "Ad sets"', () => {
    renderWizard([allPlatforms, metaOnly]);
    const meta = card('Leads');
    expect(within(meta).queryAllByTestId('suggestion-platform-count')).toEqual([]);
    expect(within(meta).getByText('Ad sets')).toBeDefined();
  });
});

describe('the Assets step — pre-selection across platforms', () => {
  function pick(name: string) {
    fireEvent.click(within(card(name)).getByRole('button', { name: /Use this/ }));
  }

  it('pre-selects the Meta ad sets and every proposed Google campaign', () => {
    renderWizard([allPlatforms, metaOnly]);
    pick('Leads // All platforms');
    expect(screen.getByTestId('meta-picker').textContent).toBe('as-1,as-2');
    const section = screen.getByTestId('wizard-other-platform-members');
    const rows = within(section).getAllByTestId('wizard-other-platform-member');
    expect(rows.map((row) => row.dataset.platform)).toEqual(['google_ads', 'google_ads']);
    for (const box of within(section).getAllByRole('checkbox')) {
      expect(box.getAttribute('aria-checked')).toBe('true');
    }
    expect(within(section).getByText('Search · Leads GDL')).toBeDefined();
    // Create enrolls them now; the notice says so, and that the optimizer only recommends there.
    expect(section.textContent).toContain('Create adds the ticked ones to the portfolio');
    expect(section.textContent).not.toContain('available yet');
  });

  it('lets a proposed campaign be unticked, and keeps it listed', () => {
    renderWizard([allPlatforms]);
    pick('Leads // All platforms');
    const section = screen.getByTestId('wizard-other-platform-members');
    fireEvent.click(within(section).getAllByRole('checkbox')[1]);
    const boxes = within(section).getAllByRole('checkbox');
    expect(boxes.map((box) => box.getAttribute('aria-checked'))).toEqual(['true', 'false']);
  });

  it('shows no other-platform section for a Meta-only suggestion', () => {
    renderWizard([metaOnly]);
    pick('Leads');
    expect(screen.getByTestId('meta-picker').textContent).toBe('as-1,as-2');
    expect(screen.queryByTestId('wizard-other-platform-members')).toBeNull();
  });
});

describe('Create — the Google campaigns are enrolled', () => {
  function pick(name: string) {
    fireEvent.click(within(card(name)).getByRole('button', { name: /Use this/ }));
  }
  const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
  const GOOGLE_MEMBERS = [
    {
      platform: 'google_ads',
      account_id: GOOGLE,
      entity_id: 'g-1',
      level: 'campaign',
      name: 'Search · Leads GDL',
    },
    {
      platform: 'google_ads',
      account_id: GOOGLE,
      entity_id: 'g-2',
      level: 'campaign',
      name: 'PMax · Leads',
    },
  ];

  it('a mixed portfolio: the Meta create and enroll, then the Google members, recommend-only', async () => {
    renderWizard([allPlatforms]);
    pick('Leads // All platforms');
    next();
    next();
    const summary = screen.getAllByTestId('wizard-summary-platform');
    expect(summary.map((li) => li.textContent)).toEqual([
      'Meta · 2 ad sets',
      'Google · 2 campaigns · recommend-only',
    ]);
    // The stubbed picker carries no live budgets, so the daily total is typed.
    fireEvent.change(screen.getByLabelText(/^Daily budget/), { target: { value: '2100' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create & enroll 2 ad sets + 2 Google campaigns' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    const [createRequest] = createMutateAsync.mock.calls[0] as unknown as [
      { ad_account_id: string; config: { apply_mode: string } },
    ];
    expect(createRequest.ad_account_id).toBe(META);
    expect(createRequest.config.apply_mode).toBe('recommend');
    expect(enrollMutateAsync).toHaveBeenCalledTimes(1);
    expect(createPlatformMutateAsync).not.toHaveBeenCalled();
    expect(addMembersMutateAsync.mock.calls[0]).toEqual([
      { portfolio_id: 'p-new', members: GOOGLE_MEMBERS },
    ] as never);
    expect(runMutate).toHaveBeenCalledWith('p-new');
  });

  it('a Google-only portfolio: every Meta ad set unticked, born on the Google account', async () => {
    renderWizard([allPlatforms]);
    pick('Leads // All platforms');
    fireEvent.click(screen.getByRole('button', { name: 'Untick every Meta ad set' }));
    const section = screen.getByTestId('wizard-other-platform-members');
    fireEvent.click(within(section).getAllByRole('checkbox')[1]);
    next();
    next();
    expect(screen.getAllByTestId('wizard-summary-platform').map((li) => li.textContent)).toEqual([
      'Google · 1 campaign · recommend-only',
    ]);
    // No Meta selection, so no live budget to match: the person types one.
    fireEvent.change(screen.getByLabelText(/^Daily budget/), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create & enroll 1 Google campaign' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(enrollMutateAsync).not.toHaveBeenCalled();
    const [request] = createPlatformMutateAsync.mock.calls[0] as unknown as [
      {
        platform: string;
        account_id: string;
        config: { apply_mode: string; level: string; daily_total: number };
      },
    ];
    expect(request.platform).toBe('google_ads');
    expect(request.account_id).toBe(GOOGLE);
    expect(request.config).toMatchObject({
      apply_mode: 'recommend',
      level: 'campaign',
      daily_total: 500,
    });
    expect(addMembersMutateAsync.mock.calls[0]).toEqual([
      { portfolio_id: 'p-google', members: [GOOGLE_MEMBERS[0]] },
    ] as never);
  });

  it('keeps autopilot off on a Google-only portfolio: choosing it blocks Create', () => {
    renderWizard([allPlatforms]);
    pick('Leads // All platforms');
    fireEvent.click(screen.getByRole('button', { name: 'Untick every Meta ad set' }));
    next();
    next();
    fireEvent.change(screen.getByLabelText(/^Daily budget/), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /^Autopilot/ }));
    expect(screen.getByRole('status').textContent).toBe(
      'Autopilot writes only to Meta: a portfolio with no Meta ad set runs on recommendations.',
    );
    const create = screen.getByRole('button', { name: /Create & enroll/ }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
  });

  it('refuses to leave Assets with nothing ticked on any platform', () => {
    renderWizard([allPlatforms]);
    pick('Leads // All platforms');
    fireEvent.click(screen.getByRole('button', { name: 'Untick every Meta ad set' }));
    const section = screen.getByTestId('wizard-other-platform-members');
    for (const box of within(section).getAllByRole('checkbox')) fireEvent.click(box);
    expect(screen.getByRole('status').textContent).toBe('Select at least one ad set or campaign.');
  });
});
