import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { OptimizerActionFeedRow } from '../useOptimizerData';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

let actions: OptimizerActionFeedRow[] = [];

// Spread the real module: `mock.module` replaces it for the whole PROCESS, so a partial
// replacement here would reach the next file in the run.
const realOptimizerData = await import('../useOptimizerData');
mock.module('../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerActions: () => ({ data: actions, isLoading: false }),
}));
mock.module('./OptimizerLogs', () => ({
  OptimizerLogs: () => <div>server-log</div>,
}));

const { OptimizerActivity } = await import('./OptimizerActivity');

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
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(cleanup);

describe('OptimizerActivity window', () => {
  it('defaults to 7 days and lets the operator pick 14 or 30', () => {
    renderActivity(<OptimizerActivity brandId="brand-1" currency="USD" />);
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
    renderActivity(<OptimizerActivity brandId="brand-1" currency="MXN" />);
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
    renderActivity(<OptimizerActivity brandId="brand-1" currency="MXN" />);
    expect(chip().getAttribute('data-platform')).toBe('tiktok_ads');
    expect(chip().textContent).toBe('TikTok');
    expect(within(receiptLine()).getByTestId('receipt-label').textContent).toMatch(/^TikTok /);
    expect(within(receiptLine()).getByText('tt-5d7')).toBeTruthy();
  });

  it('a Meta row: Meta chip and the fbtrace id', () => {
    actions = [action({ receipt: { fbtrace_id: 'AbC123traceZ' } })];
    renderActivity(<OptimizerActivity brandId="brand-1" currency="MXN" />);
    expect(chip().getAttribute('data-platform')).toBe('meta');
    expect(within(receiptLine()).getByTestId('receipt-label').textContent).toMatch(/^Meta /);
    expect(within(receiptLine()).getByText('AbC123traceZ')).toBeTruthy();
  });

  it('a malformed receipt falls back to Meta and invents no receipt line', () => {
    actions = [action({ receipt: { platform: 7, requestId: ['not', 'a', 'string'] } })];
    renderActivity(<OptimizerActivity brandId="brand-1" currency="MXN" />);
    expect(chip().getAttribute('data-platform')).toBe('meta');
    expect(screen.queryByTestId('receipt-token')).toBeNull();
  });
});
