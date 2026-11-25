import { afterEach, describe, expect, it } from 'bun:test';
import type {
  ClientReportDetailResponse,
  ClientReportListResponse,
  WeeklyClientReport,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { ClientReportsTab } from './ClientReportsTab';

const BRAND = 'brand-1';
const ID = '0b6c9b3e-6a4f-4d0c-9a51-4d8f2a0c7e11';

const report: WeeklyClientReport = {
  version: 1,
  generated_at: '2026-11-25T12:00:00.000Z',
  brand: {
    id: BRAND,
    name: 'Easy Fit',
    language: 'es',
    timezone: 'America/Mexico_City',
    currency: 'MXN',
  },
  week: { since: '2026-11-16', until: '2026-11-22' },
  month: '2026-11',
  next_month: '2026-12',
  metrics: [
    {
      key: 'leads',
      unit: 'count',
      lower_is_better: false,
      source: { tool: 'easyfit_fact_contact', definition: 'New Peaking contacts' },
      data_through: '2026-11-18',
      cadence: 'daily',
      week: {
        window: { since: '2026-11-12', until: '2026-11-18' },
        prior_window: { since: '2026-11-05', until: '2026-11-11' },
        value: 1014,
        prior: 900,
        change: 0.1267,
      },
      month: {
        window: { since: '2026-11-01', until: '2026-11-18' },
        prior_window: { since: '2026-10-01', until: '2026-10-18' },
        value: 2479,
        prior: 2199,
        change: 0.1273,
      },
      target: { month: '2026-11', value: 3981, forecast_gap: -0.12 },
      next_target: null,
      forecast: { month_end: { low: 3300, mid: 3500, high: 3700 }, next_month: null },
    },
  ],
  forecast_method: { name: 'Run rate with weekday seasonality', description: 'd', interval: '80%' },
  changes: [],
  recommendations: [],
  client_asks: [{ text: 'Confirm the 2026-12 targets (Leads).', reason: 'r' }],
  stale_sources: [
    {
      source: 'Peaking (CRM)',
      data_through: '2026-11-18',
      last_error_at: '2026-11-19T13:45:00.000Z',
      metrics: ['leads'],
    },
  ],
  gaps: [],
};

const summary = {
  id: ID,
  brand_id: BRAND,
  week: report.week,
  status: 'draft' as const,
  generated_at: report.generated_at,
  reviewed_at: null,
  stale_sources: 1,
};

function renderAs(canReview: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const list: ClientReportListResponse = {
    reports: [summary],
    can_review: canReview,
    can_set_targets: canReview,
  };
  const detail: ClientReportDetailResponse = {
    summary,
    draft: { report, email: { subject: 's', body: 'b' }, slack_text: 't' },
  };
  client.setQueryData(['client-reports', BRAND], list);
  client.setQueryData(['client-reports', BRAND, ID], detail);
  return render(
    <QueryClientProvider client={client}>
      <ClientReportsTab brandId={BRAND} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('ClientReportsTab', () => {
  it('leads with the stale-source warning, so stale figures never read as current', () => {
    renderAs(true);
    expect(screen.getByRole('alert').textContent).toContain(
      'Peaking (CRM) is complete only through 2026-11-18',
    );
    expect(screen.getByText('Data through 2026-11-18')).toBeTruthy();
  });

  it('shows the forecast range and the target', () => {
    renderAs(true);
    expect(screen.getByText('3,500 (3,300–3,700)')).toBeTruthy();
    expect(screen.getByText('3,981')).toBeTruthy();
  });

  it('gives staff the review and share actions on a draft, and a client neither', () => {
    renderAs(true);
    expect(screen.getByText('Mark reviewed')).toBeTruthy();
    expect(screen.getByText('Copy share link')).toBeTruthy();
    cleanup();
    renderAs(false);
    expect(screen.queryByText('Mark reviewed')).toBeNull();
    expect(screen.queryByText('Copy share link')).toBeNull();
    expect(screen.queryByText('Copy email draft')).toBeNull();
    expect(screen.getByText('Export PDF')).toBeTruthy();
  });
});
