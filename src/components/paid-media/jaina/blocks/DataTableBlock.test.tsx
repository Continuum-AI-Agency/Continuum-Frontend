import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { DataTableBlockV2 } from '@/lib/jaina/schemas';
import { DataTableBlock } from './DataTableBlock';

afterEach(cleanup);

const baseBlock: DataTableBlockV2 = {
  block_id: 'creative-table',
  category: 'data_table',
  scope: 'account',
  title: 'Winning creatives',
  priority: 'primary',
  provenance: null,
  columns: [
    { key: 'creative', label: 'Creative', format: 'creative', align: 'left' },
    { key: 'headline', label: 'Headline', format: 'text', align: 'left' },
    { key: 'placement', label: 'Placement', format: 'text', align: 'left' },
    { key: 'spend', label: 'Spend', format: 'currency', align: 'right' },
    { key: 'cpa', label: 'Cost per result', format: 'currency', align: 'right' },
    { key: 'impressions', label: 'Impressions', format: 'number', align: 'right' },
  ],
  rows: [
    {
      creative: 'Spring launch',
      headline: 'Move with confidence',
      placement: null,
      spend: 1250,
      cpa: null,
      impressions: 98231,
    },
  ],
  notes: 'Based on the selected reporting window.',
  dataset_id: 'dataset-1',
  row_meta: [{}],
  render_mode: 'creative_cards',
  card_fields: {
    creative: 'creative',
    title: 'headline',
    subtitle: 'placement',
    metrics: ['spend', 'cpa'],
  },
};

describe('DataTableBlock', () => {
  it('renders only explicitly mapped creative-card fields with column labels and formats', () => {
    render(<DataTableBlock block={baseBlock} isStreaming={false} />);

    const list = screen.getByRole('list', { name: 'Winning creatives' });
    const card = within(list).getByRole('article', { name: 'Move with confidence' });

    expect(within(card).getByRole('heading', { name: 'Move with confidence' })).toBeTruthy();
    expect(within(card).getByText('Preview unavailable')).toBeTruthy();
    expect(within(card).getByText('Spend')).toBeTruthy();
    expect(within(card).getByText('$1,250.00')).toBeTruthy();
    expect(within(card).getByText('Cost per result')).toBeTruthy();
    expect(within(card).getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('Impressions')).toBeNull();
    expect(screen.queryByText('98,231')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Based on the selected reporting window.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Data provenance' })).toBeTruthy();
  });

  it('leaves ordinary data tables unchanged', () => {
    render(
      <DataTableBlock
        block={{ ...baseBlock, render_mode: 'table', card_fields: null }}
        isStreaming={false}
      />,
    );

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Impressions' })).toBeTruthy();
    expect(within(table).getByText('98,231')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Winning creatives' })).toBeNull();
  });
});
