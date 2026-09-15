/**
 * DataGrid's additive props against a real react-table instance: sortable headers are opt-in
 * and keyboard-reachable, groups collapse with counts, columns hide, and a custom row wraps `tr`.
 * The two existing callers pass none of these, which is what the first test pins.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ComponentProps, useState } from 'react';
import { DataGrid, type DataGridRowProps } from './DataGrid';

type Job = { id: string; name: string; template: string };

const JOBS: Job[] = [
  { id: '1', name: 'Bravo', template: 'Promo' },
  { id: '2', name: 'Alpha', template: 'Hero' },
  { id: '3', name: 'Charlie', template: 'Promo' },
];

const COLUMNS: ColumnDef<Job>[] = [
  { accessorKey: 'name', header: 'Name', enableSorting: true },
  // sortable by react-table's defaults, but not opted in — must stay a plain header
  { accessorKey: 'template', header: 'Template' },
];

function Harness(props: Partial<ComponentProps<typeof DataGrid<Job>>>) {
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const table = useReactTable({
    data: JOBS,
    columns: COLUMNS,
    getRowId: (job) => job.id,
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return <DataGrid table={table} empty="Nothing" {...props} />;
}

const bodyNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent);

afterEach(cleanup);

describe('DataGrid', () => {
  test('renders every row in data order with no additive props', () => {
    render(<Harness />);
    expect(bodyNames()).toEqual(['BravoPromo', 'AlphaHero', 'CharliePromo']);
    // the only control is the opted-in sort toggle: no Columns menu, no group headers
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Name']);
  });

  test('an opted-in header toggles sorting from the keyboard-reachable button and reports aria-sort', () => {
    render(<Harness />);
    const [nameHeader, templateHeader] = screen.getAllByRole('columnheader');
    expect(nameHeader?.getAttribute('aria-sort')).toBe('none');
    expect(templateHeader?.hasAttribute('aria-sort')).toBe(false);
    expect(within(templateHeader!).queryByRole('button')).toBeNull();

    const toggle = within(nameHeader!).getByRole('button', { name: /Name/ });
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(nameHeader?.getAttribute('aria-sort')).toBe('ascending');
    expect(bodyNames()).toEqual(['AlphaHero', 'BravoPromo', 'CharliePromo']);
    fireEvent.click(toggle);
    expect(nameHeader?.getAttribute('aria-sort')).toBe('descending');
    expect(bodyNames()).toEqual(['CharliePromo', 'BravoPromo', 'AlphaHero']);
  });

  test('groups rows under collapsible headers with counts', () => {
    render(<Harness groupBy={(job) => ({ key: job.template, label: job.template })} />);
    const promo = screen.getByRole('button', { name: /Promo/ });
    expect(promo.textContent).toBe('Promo2');
    expect(promo.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /Hero/ }).textContent).toBe('Hero1');
    expect(screen.getByText('Charlie')).toBeTruthy();

    fireEvent.click(promo);
    expect(promo.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Bravo')).toBeNull();
    expect(screen.queryByText('Charlie')).toBeNull();
    expect(screen.getByText('Alpha')).toBeTruthy();

    fireEvent.click(promo);
    expect(screen.getByText('Charlie')).toBeTruthy();
  });

  test('hides a column through the visibility menu', async () => {
    render(<Harness columnVisibility />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Template' }));
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Name',
    ]);
    expect(screen.queryByText('Promo')).toBeNull();
  }, 30_000);

  test('draws body rows through a custom RowComponent', () => {
    function Sortable({ row, ...props }: DataGridRowProps<Job>) {
      return <tr data-testid={`sortable-${row.original.id}`} {...props} />;
    }
    render(<Harness RowComponent={Sortable} />);
    expect(screen.getByTestId('sortable-2').textContent).toBe('AlphaHero');
    expect(screen.getAllByTestId(/^sortable-/)).toHaveLength(3);
  });
});
