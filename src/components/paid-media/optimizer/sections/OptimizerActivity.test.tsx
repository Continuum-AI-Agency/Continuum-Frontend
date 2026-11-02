import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { OptimizerLogRow } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { OptimizerActionFeedRow } from '../useOptimizerData';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

let actions: OptimizerActionFeedRow[] = [];
let actionsLoading = false;
let logs: OptimizerLogRow[] = [];

// Spread the real module: `mock.module` replaces it for the whole PROCESS, so a partial
// replacement here would reach the next file in the run.
const realOptimizerData = await import('../useOptimizerData');
mock.module('../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerActions: () => ({ data: actions, isLoading: actionsLoading }),
  // The page lists the server log's platform rows beside the actions; the Server log's own
  // behaviour is covered where it lives.
  useOptimizerLogs: () => ({ data: logs, isLoading: false }),
}));
mock.module('@/components/settings/account/OptimizerNotificationsSection', () => ({
  OptimizerNotificationsSection: () => <div data-testid="notifications-section" />,
}));

const { OptimizerActivity } = await import('./OptimizerActivity');
const { optimizerQueryKeys } = realOptimizerData;
const { activityDays } = await import('./pages/activity/activityModel');
const { changeHistoryWindow } = await import('./google/campaignExplorerModel');

let queryClient = new QueryClient();
const renderActivity = (ui: ReactElement) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

const action = (over: Partial<OptimizerActionFeedRow> = {}): OptimizerActionFeedRow =>
  ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ts: new Date().toISOString(),
    family: 'money',
    op: 'budget',
    portfolio_id: '11111111-1111-4111-8111-111111111111',
    portfolio_name: 'Leads // All platforms',
    entity_id: '22510593721',
    before: { minor: 40000 },
    after: { minor: 48000 },
    actor_kind: 'autopilot',
    reversible: false,
    ...over,
  }) as OptimizerActionFeedRow;

beforeEach(() => {
  actions = [];
  actionsLoading = false;
  logs = [];
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(cleanup);

describe('OptimizerActivity window', () => {
  it('defaults to 7 days and lets the operator pick 14 or 30', () => {
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    const seven = screen.getByRole('button', { name: '7d' });
    const fourteen = screen.getByRole('button', { name: '14d' });
    const thirty = screen.getByRole('button', { name: '30d' });
    expect(seven.getAttribute('aria-pressed')).toBe('true');
    expect(fourteen.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(thirty);
    expect(thirty.getAttribute('aria-pressed')).toBe('true');
    expect(seven.getAttribute('aria-pressed')).toBe('false');
  });
});

// optimizer_list_actions sends no platform column. The receipt every Google and TikTok
// applier writes names its platform, so each row is told apart with no migration.
describe('OptimizerActivity rows name the platform their receipt names', () => {
  const chip = () => screen.getByTestId('platform-chip');
  const receiptLine = () => screen.getByTestId('receipt-token');

  it('a Google receipt: Google chip and the Google request id', () => {
    actions = [
      action({
        receipt: {
          platform: 'google_ads',
          requestId: 'gReq-0c1',
          resourceNames: ['customers/1/campaignBudgets/2'],
        },
      }),
    ];
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    expect(chip().getAttribute('data-platform')).toBe('google_ads');
    expect(chip().textContent).toBe('Google');
    expect(within(receiptLine()).getByTestId('receipt-label').textContent).toMatch(/^Google /);
    expect(within(receiptLine()).getByText('gReq-0c1')).toBeTruthy();
  });

  it('a TikTok scheduled receipt: TikTok chip and the TikTok request id', () => {
    actions = [
      action({
        receipt: { platform: 'tiktok_ads', requestId: 'tt-5d7', scheduled: 'next_day' },
      }),
    ];
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    expect(chip().getAttribute('data-platform')).toBe('tiktok_ads');
    expect(chip().textContent).toBe('TikTok');
    expect(within(receiptLine()).getByTestId('receipt-label').textContent).toMatch(/^TikTok /);
    expect(within(receiptLine()).getByText('tt-5d7')).toBeTruthy();
  });

  it('a Meta row: Meta chip and the fbtrace id', () => {
    actions = [action({ receipt: { fbtrace_id: 'AbC123traceZ' } })];
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    expect(chip().getAttribute('data-platform')).toBe('meta');
    expect(within(receiptLine()).getByTestId('receipt-label').textContent).toMatch(/^Meta /);
    expect(within(receiptLine()).getByText('AbC123traceZ')).toBeTruthy();
  });

  it('a malformed receipt falls back to Meta and invents no receipt line', () => {
    actions = [action({ receipt: { platform: 7, requestId: ['not', 'a', 'string'] } })];
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    expect(chip().getAttribute('data-platform')).toBe('meta');
    expect(screen.queryByTestId('receipt-token')).toBeNull();
  });
});

// PP-DT-C-creative-insights-layout-shift-0.955 (Optimizer Activity, CLS 0.151 on a phone): the
// Notifications block sat under the feed while the feed's skeleton loaded, and the timeline that
// replaced the skeleton pushed it down. It is drawn once the feed has settled, never under a
// skeleton that is about to change height.
describe('OptimizerActivity keeps the Notifications block off a loading feed', () => {
  it('leaves it out while the action feed loads', () => {
    actionsLoading = true;
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    expect(screen.queryByText('Notifications')).toBeNull();
    expect(screen.queryByTestId('notifications-section')).toBeNull();
  });

  it('draws it under the feed once the feed has answered', () => {
    actions = [action()];
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    expect(screen.getByText('Notifications')).toBeTruthy();
    const feed = screen.getByTestId('action-timeline');
    const notifications = screen.getByTestId('notifications-section');
    expect(feed.compareDocumentPosition(notifications) & 4).toBe(4);
  });
});

// G13: the spend line with a dot per event, and the same events as the list below it. The page
// reads the action feed, the server log's platform rows and the account's daily spend; the two
// feeds are mocked above and the spend read is seeded into the cache, so nothing reaches the
// network.
describe('OptimizerActivity — the timeline (G13)', () => {
  const human = (over: Partial<OptimizerActionFeedRow> = {}) =>
    action({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      family: 'settings',
      op: 'setting',
      entity_id: 'autopilot_paused',
      before: { value: 'false' },
      after: { value: 'true' },
      actor_kind: 'human',
      ...over,
    });
  const drift: OptimizerLogRow = {
    id: 41,
    portfolio_id: '22222222-2222-4222-8222-222222222222',
    portfolio_name: 'Tours Programados - Octubre',
    ts: new Date().toISOString(),
    level: 'warn',
    event: 'roster_drift_detected',
    fields: { seen: 0, missing: 3 },
  };
  const seedAccounts = (accounts: unknown[]) =>
    queryClient.setQueryData(optimizerQueryKeys.adAccounts('brand-1'), accounts);
  const markers = () => screen.getAllByTestId('activity-marker');
  const entry = (eventId: string) =>
    screen.getByTestId('action-timeline').querySelector(`[data-event-id="${eventId}"]`);

  beforeEach(() => {
    seedAccounts([]);
  });

  it('draws a dot per action, coloured by the hand that made it, with the counts as its legend', () => {
    actions = [action(), human()];
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    expect(markers().map((marker) => marker.getAttribute('data-source'))).toEqual([
      'optimizer',
      'team',
    ]);
    const tabs = screen.getByTestId('activity-source-filter');
    expect(within(tabs).getByRole('button', { name: /^All 2$/ })).toBeTruthy();
    expect(within(tabs).getByRole('button', { name: /^Optimizer 1$/ })).toBeTruthy();
    expect(within(tabs).getByRole('button', { name: /^Team 1$/ })).toBeTruthy();
  });

  it('narrows the list and its dots to one hand together', () => {
    actions = [action(), human()];
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    fireEvent.click(screen.getByRole('button', { name: /^Team 1$/ }));
    expect(markers().map((marker) => marker.getAttribute('data-source'))).toEqual(['team']);
    const rows = screen.getByTestId('action-timeline').querySelectorAll('li[data-action-id]');
    expect(Array.from(rows).map((row) => row.getAttribute('data-action-id'))).toEqual([
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });

  it('lights the row of the dot pointed at, and the dot of the row pointed at', () => {
    actions = [action(), human()];
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    const optimizerDot = markers().find((m) => m.getAttribute('data-source') === 'optimizer');
    fireEvent.pointerEnter(optimizerDot as HTMLElement);
    expect(
      entry('action:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')?.getAttribute('data-highlighted'),
    ).toBe('true');
    expect(
      entry('action:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')?.hasAttribute('data-highlighted'),
    ).toBe(false);
    fireEvent.pointerOver(entry('action:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') as Element);
    const lit = markers().find((m) => m.getAttribute('aria-pressed') === 'true');
    expect(lit?.getAttribute('data-source')).toBe('team');
  });

  it('lists a roster that drifted as the platform’s, beside the writes', () => {
    actions = [action()];
    logs = [drift];
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    expect(markers().map((marker) => marker.getAttribute('data-source'))).toEqual([
      'optimizer',
      'platform',
    ]);
    const row = entry(`log:41:${drift.ts}`);
    expect(row?.textContent).toContain('Roster drift');
    expect(row?.textContent).toContain('Tours Programados - Octubre');
  });

  it('shades the days the account showed no ad, and lists the day it stopped', () => {
    actions = [action()];
    seedAccounts([
      {
        platform: 'meta_ads',
        account_id: 'act_521903353286118',
        name: 'Easy Fit',
        status: null,
        currency: 'MXN',
      },
    ]);
    const days = activityDays(7);
    const complete = days.filter((day) => day.complete);
    queryClient.setQueryData(
      [
        'activity-spend',
        'brand-1',
        'meta',
        'act_521903353286118',
        complete[0]?.key,
        complete.at(-1)?.key,
      ],
      {
        currency: 'MXN',
        metrics: { spend: 1900, roas: 0, ctr: 0 },
        trends: [
          { date: complete[0]?.key, spend: 900, impressions: 4000 },
          { date: complete[1]?.key, spend: 1000, impressions: 5100 },
        ],
      },
    );
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    expect(screen.getAllByTestId('activity-dark-day')).toHaveLength(5);
    expect(screen.getByTestId('activity-spend-figure').textContent).toContain('$1,900 MXN');
    const stopped = screen.getByTestId('activity-delivery-entry');
    expect(stopped.textContent).toContain('No ads shown');
    expect(stopped.getAttribute('data-event-id')).toBe(`delivery:stopped:${complete[2]?.key}`);
  });

  it('lists a change made in Google Ads as the platform’s, and leaves Continuum’s own API writes out', () => {
    actions = [action()];
    const customer = '5251780631';
    seedAccounts([
      {
        platform: 'google_ads',
        account_id: customer,
        name: 'Easy Fit',
        status: null,
        currency: 'MXN',
      },
    ]);
    const complete = activityDays(7).filter((day) => day.complete);
    queryClient.setQueryData(
      ['activity-spend', 'brand-1', 'google_ads', customer, complete[0]?.key, complete.at(-1)?.key],
      {
        currency: 'MXN',
        metrics: { spend: 7000, roas: 0, ctr: 0 },
        trends: complete.map((day) => ({ date: day.key, spend: 1000, impressions: 900 })),
      },
    );
    const range = changeHistoryWindow();
    const at = new Date();
    at.setHours(at.getHours() - 1);
    const change = (clientType: string) => ({
      at: at.toISOString(),
      resourceType: 'CAMPAIGN',
      operation: 'UPDATE',
      campaignName: 'Search | Octubre | Easy Fit',
      changedFields: ['status'],
      clientType,
      before: { status: 'ENABLED' },
      after: { status: 'PAUSED' },
    });
    queryClient.setQueryData(
      [
        'optimizer',
        'google',
        'brand-1',
        customer,
        'change_history',
        range.since,
        range.until,
        'account',
      ],
      {
        scope: 'change_history',
        customerId: customer,
        currency: 'MXN',
        timeZone: 'America/Mexico_City',
        coverage: { requested: range, read: range, truncated: false },
        changes: [change('GOOGLE_ADS_WEB_CLIENT'), change('GOOGLE_ADS_API')],
      },
    );
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    const changes = screen.getAllByTestId('activity-change-entry');
    expect(changes).toHaveLength(1);
    expect(changes[0]?.textContent).toContain('Campaign changed');
    expect(changes[0]?.textContent).toContain('status enabled → paused · in Google Ads');
    expect(
      markers()
        .map((marker) => marker.getAttribute('data-source'))
        .sort(),
    ).toEqual(['optimizer', 'platform']);
  });

  it('keeps the Server log one switch away, with the window it shares', () => {
    renderActivity(<OptimizerActivity brandId="brand-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Server log' }));
    expect(screen.queryByTestId('activity-chart')).toBeNull();
    expect(screen.getByRole('button', { name: '7d' }).getAttribute('aria-pressed')).toBe('true');
  });
});
