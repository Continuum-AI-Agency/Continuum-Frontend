/**
 * JG-frontend-null-currency-label: every money cell a Jaina block prints follows the ONE money
 * rule (`formatMoney`, @continuum/contracts, M1 since 2026-10-13): unknown currency → the bare
 * figure, any known one → its symbol before and its code after, `$1,250 MXN` / `$1,250 USD`. The Backend materializer and the Optimizer prose follow it;
 * these two blocks dressed the figure themselves — "(currency unknown)" on a null, "MX$" on
 * MXN — so the same figure read differently on two surfaces of one answer.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { formatMoney } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import type { DataTableBlockV2, MetricGridBlockV2 } from '@/lib/jaina/schemas';

mock.module('@/lib/api/http', () => ({
  http: { request: mock(async () => ({ thumbnail_url: null, image_url: null })) },
}));

const { DataTableBlock } = await import('./DataTableBlock');
const { default: MetricGridBlock } = await import('./MetricGridBlock');

afterEach(cleanup);

const SPEND = 2888.59;

const table = (currency: string | null): DataTableBlockV2 => ({
  block_id: 'spend-by-campaign',
  category: 'data_table',
  scope: 'account',
  title: 'Spend by campaign',
  priority: 'primary',
  provenance: null,
  columns: [
    { key: 'entity', label: 'Campaign', format: 'text', align: 'left' },
    { key: 'spend', label: 'Spend', format: 'currency', align: 'right' },
  ],
  rows: [{ entity: 'OCTUBRE// ALEIRA // MENSAJES // 2026', spend: SPEND }],
  notes: null,
  dataset_id: 'dataset-1',
  row_meta: [currency ? { currency } : {}],
  render_mode: 'table',
  card_fields: null,
});

const grid = (unit: string | null): MetricGridBlockV2 => ({
  block_id: 'live-metrics',
  category: 'metric_grid',
  scope: 'account',
  title: 'Live delivery',
  priority: 'primary',
  provenance: null,
  dataset_id: 'live:summary',
  evidence_refs: ['meta:insights'],
  metrics: [
    {
      label: 'Delivered spend',
      value: SPEND,
      unit,
      format: 'currency',
      change: null,
      change_direction: null,
      severity: 'neutral',
    },
  ],
});

describe('DataTableBlock money cells', () => {
  it('a null-currency cell prints the bare figure, with no "(currency unknown)" noise', () => {
    render(<DataTableBlock block={table(null)} isStreaming={false} />);
    expect(screen.getByText(formatMoney(SPEND, null))).toBeTruthy();
    expect(screen.queryByText(/currency unknown/)).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it('an MXN cell prints "$" before the figure and MXN after it, never the locale\u2019s "MX$"', () => {
    render(<DataTableBlock block={table('MXN')} isStreaming={false} />);
    expect(screen.getByText(formatMoney(SPEND, 'MXN'))).toBeTruthy();
    expect(formatMoney(SPEND, 'MXN')).toBe('$2,889 MXN');
    expect(screen.queryByText(/MX\$/)).toBeNull();
  });
});

describe('MetricGridBlock money values', () => {
  it('a null-unit value prints the bare figure, with no "(currency unknown)" noise', () => {
    render(<MetricGridBlock block={grid(null)} isStreaming={false} />);
    expect(screen.getByText(formatMoney(SPEND, null))).toBeTruthy();
    expect(screen.queryByText(/currency unknown/)).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it('an MXN value prints "$" before the figure and MXN after it, never the locale\u2019s "MX$"', () => {
    render(<MetricGridBlock block={grid('MXN')} isStreaming={false} />);
    expect(screen.getByText(formatMoney(SPEND, 'MXN'))).toBeTruthy();
    expect(screen.queryByText(/MX\$/)).toBeNull();
  });
});
