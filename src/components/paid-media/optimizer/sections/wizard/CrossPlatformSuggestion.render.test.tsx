import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioSuggestion } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const createMutateAsync = mock(async () => ({ portfolio_id: 'p-new' }));
const enrollMutateAsync = mock(async () => ({}));

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
    run: { mutate: mock(() => {}), isPending: false },
  }),
}));
// The virtualized Meta picker is stubbed: this suite is about what the suggestion seeds.
mock.module('../../picker/CampaignAdsetPicker', () => ({
  CampaignAdsetPicker: ({ selectedAdsetIds }: { selectedAdsetIds: string[] }) => (
    <div data-testid="meta-picker">{selectedAdsetIds.join(',')}</div>
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
    // Honest about enrolment: nothing writes a Google campaign into a portfolio yet.
    expect(section.textContent).toContain('Create enrolls the Meta ad sets only');
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
