/**
 * DataGrid's additive props against a real react-table instance: sortable headers are opt-in
 * and keyboard-reachable, groups collapse with counts, columns hide, a custom row wraps `tr`,
 * and sticky columns are opt-in. The first test pins a grid that asks for none of these.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ComponentProps, useState } from 'react';
import { installPickerDomGlobals } from '@/components/automations/workspace/pickers/pickerTestHarness';
import {
  DataGrid,
  type DataGridMenuTarget,
  type DataGridRowProps,
  STICKY_LEFT,
  selectColumn,
} from './DataGrid';

// Base UI waits on a MutationObserver as a popup or dialog animates; happy-dom's, lifted per file
// (a global shim in the shared setup drops other files' tests).
installPickerDomGlobals();

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

function Harness({
  columns = COLUMNS,
  ...props
}: Partial<ComponentProps<typeof DataGrid<Job>>> & { columns?: ColumnDef<Job>[] }) {
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [selection, setSelection] = useState({});
  const table = useReactTable({
    data: JOBS,
    columns,
    getRowId: (job) => job.id,
    state: { columnVisibility: visibility, rowSelection: selection },
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
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

  test('opted-in columns stick left past the widths before them; the last one casts an edge once scrolled', () => {
    // happy-dom lays nothing out, so the header cells report the widths a browser would.
    const widths: Record<string, number> = { select: 40, name: 180 };
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return widths[this.dataset.columnId ?? ''] ?? 0;
      },
    });
    try {
      render(
        <Harness
          columns={[selectColumn<Job>(), { ...COLUMNS[0]!, meta: STICKY_LEFT }, COLUMNS[1]!]}
        />,
      );
      const [selectHeader, nameHeader, templateHeader] = screen.getAllByRole('columnheader');
      const [selectCell, nameCell, templateCell] = within(
        screen.getAllByRole('row')[1]!,
      ).getAllByRole('cell');
      for (const [header, cell, left] of [
        [selectHeader, selectCell, '0px'],
        [nameHeader, nameCell, '40px'],
      ] as const) {
        expect(header?.getAttribute('data-sticky')).toBe('left');
        expect(header?.style.left).toBe(left);
        expect(cell?.getAttribute('data-sticky')).toBe('left');
        expect(cell?.style.left).toBe(left);
      }
      // Not opted in: scrolls with the grid.
      expect(templateHeader?.hasAttribute('data-sticky')).toBe(false);
      expect(templateCell?.hasAttribute('data-sticky')).toBe(false);

      const edged = () =>
        screen
          .getAllByRole('cell')
          .concat(screen.getAllByRole('columnheader'))
          .filter((cell) => cell.className.includes('shadow-'))
          .map((cell) => cell.dataset.columnId);
      expect(edged()).toEqual([]);
      const scroller = screen.getByRole('table').closest('.overflow-auto') as HTMLElement;
      fireEvent.scroll(scroller, { target: { scrollLeft: 120 } });
      expect(scroller.dataset.scrolled).toBe('true');
      // Only the last sticky column, in every row and the header.
      expect(new Set(edged())).toEqual(new Set(['name']));
      expect(edged()).toHaveLength(4);
      fireEvent.scroll(scroller, { target: { scrollLeft: 0 } });
      expect(edged()).toEqual([]);
    } finally {
      if (offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
    }
  });

  test('draws body rows through a custom RowComponent', () => {
    function Sortable({ row, ...props }: DataGridRowProps<Job>) {
      return <tr data-testid={`sortable-${row.original.id}`} {...props} />;
    }
    render(<Harness RowComponent={Sortable} />);
    expect(screen.getByTestId('sortable-2').textContent).toBe('AlphaHero');
    expect(screen.getAllByTestId(/^sortable-/)).toHaveLength(3);
  });

  test('every header and cell names its column, and every row its id', () => {
    render(<Harness />);
    const header = screen.getByRole('columnheader', { name: 'Template' });
    expect(header.getAttribute('data-column-id')).toBe('template');
    const alpha = screen.getByText('Alpha').closest('tr')!;
    expect(alpha.getAttribute('data-row-id')).toBe('2');
    expect(within(alpha).getByText('Hero').closest('td')?.getAttribute('data-column-id')).toBe(
      'template',
    );
  });

  test('a right-click says what it landed on, and counts as clicking that row', async () => {
    const targets: DataGridMenuTarget[] = [];
    const clicked: string[] = [];
    render(
      <Harness
        onRowClick={(job) => clicked.push(job.name)}
        contextMenu={{
          content: (target) => {
            targets.push(target);
            return (
              <span role="menuitem" tabIndex={-1}>
                Item
              </span>
            );
          },
        }}
      />,
    );
    fireEvent.contextMenu(screen.getByText('Hero'));
    await screen.findByRole('menuitem');
    expect(targets.at(-1)).toEqual({ rowId: '2', columnId: 'template', header: false });
    expect(clicked).toEqual(['Alpha']);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));
    fireEvent.contextMenu(screen.getByRole('columnheader', { name: 'Template' }));
    await screen.findByRole('menuitem');
    expect(targets.at(-1)).toEqual({ rowId: null, columnId: 'template', header: true });
  });

  test('shift-click ticks every row from the last one ticked', () => {
    render(<Harness columns={[selectColumn<Job>(), ...COLUMNS]} />);
    const boxes = () => screen.getAllByLabelText('Select row');
    fireEvent.click(boxes()[0]!);
    fireEvent.click(boxes()[2]!, { shiftKey: true });
    expect(boxes().map((box) => box.getAttribute('aria-checked'))).toEqual([
      'true',
      'true',
      'true',
    ]);
  });
});
