import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

import { BrandInsightsDataTable, type BrandInsightsTableRow } from './BrandInsightsDataTable';

const rows: BrandInsightsTableRow[] = [
  { id: 'row-1', title: 'First insight', secondaryValue: 'Jul 16' },
  { id: 'row-2', title: 'Second insight', secondaryValue: 'Jul 16' },
];

const baseProps = {
  rows,
  emptyTitle: 'Nothing here',
  emptyDescription: 'No rows.',
  countLabel: 'items',
  searchPlaceholder: 'Search items',
};

describe('BrandInsightsDataTable renderRowAction', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the action cell for every row when provided', () => {
    render(
      <BrandInsightsDataTable
        {...baseProps}
        renderRowAction={(row) => (
          <button type="button" aria-label={`Act on ${row.id}`}>
            go
          </button>
        )}
      />,
    );

    expect(screen.getByLabelText('Act on row-1')).toBeTruthy();
    expect(screen.getByLabelText('Act on row-2')).toBeTruthy();
  });

  it('renders no action column when omitted', () => {
    render(<BrandInsightsDataTable {...baseProps} />);

    expect(screen.queryByText('Actions')).toBeNull();
    // Two header cells only: Content + secondary.
    expect(screen.getAllByRole('columnheader').length).toBe(2);
  });
});
