import { afterEach, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TrendsDataTable } from '@/components/organic/TrendsDataTable';

afterEach(cleanup);

const trend = {
  id: '1',
  title: 'Test Trend',
  summary: 'This is a summary',
  momentum: 'rising' as const,
  platforms: ['instagram'] as never,
  tags: [],
};

// Clicking a row reveals the detail panel for that trend, and clicking it again hides it.
test('TrendsDataTable expands a row on click', () => {
  render(
    <TrendsDataTable
      data={[trend]}
      selectedTrendIds={[]}
      onToggleTrend={() => {}}
      activePlatforms={['instagram']}
    />,
  );

  expect(screen.queryByText('Distribution')).toBeNull();

  const row = screen.getByText('Test Trend').closest('tr');
  if (!row) throw new Error('trend row not rendered');

  fireEvent.click(row);
  expect(screen.getByText('Distribution')).toBeTruthy();

  fireEvent.click(row);
  expect(screen.queryByText('Distribution')).toBeNull();
});
