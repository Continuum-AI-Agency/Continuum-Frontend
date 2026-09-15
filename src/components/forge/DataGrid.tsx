'use client';

import type { ApiRenderVariableKind } from '@continuum/contracts';
import {
  type ColumnDef,
  flexRender,
  type Header,
  type Row,
  type Table as TanTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Columns3,
  Hash,
  ImageIcon,
  List,
  Lock,
  type LucideIcon,
  Palette,
  ToggleLeft,
  Type,
  Video,
} from 'lucide-react';
import {
  type ClipboardEventHandler,
  type ComponentProps,
  type ComponentType,
  Fragment,
  type ReactNode,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// The one grid both Forge tables draw through: dense rows, a sticky typed header, a checkbox
// gutter. It is a rendering of a react-table instance — the caller owns columns, sorting,
// visibility and selection. It keeps which groups are collapsed unless the caller holds that
// itself — Renders does, because opening a job unmounts the grid.
//
// Deliberately in components/forge, not components/ui: two callers is not a design system.

/** The icon a column header carries for a variable kind — the "typed column" of the reference grid. */
export const KIND_ICONS: Record<ApiRenderVariableKind | 'reserved', LucideIcon> = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  enum: List,
  image: ImageIcon,
  video: Video,
  color: Palette,
  reserved: Lock,
};

/** The checkbox gutter. Header toggles the page, cell toggles the row. */
export function selectColumn<T>(): ColumnDef<T> {
  return {
    id: 'select',
    size: 32,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? 'indeterminate'
              : false
        }
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onClick={(event) => event.stopPropagation()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
      />
    ),
  };
}

/** What a custom row receives: the `tr` props to spread, plus the react-table row it draws. */
export type DataGridRowProps<T> = ComponentProps<typeof TableRow> & { row: Row<T> };

function DefaultRow<T>({ row: _row, ...props }: DataGridRowProps<T>) {
  return <TableRow {...props} />;
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/** Opt-in per column: `enableSorting: true` makes the header a toggle. */
function SortableHeader<T>({ header }: { header: Header<T, unknown> }) {
  const sorted = header.column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-hidden"
      onClick={header.column.getToggleSortingHandler()}
    >
      {flexRender(header.column.columnDef.header, header.getContext())}
      <Icon className={cn('size-3', !sorted && 'opacity-40')} aria-hidden />
    </button>
  );
}

function ColumnVisibilityMenu<T>({ table }: { table: TanTable<T> }) {
  const hideable = table.getAllLeafColumns().filter((column) => column.getCanHide());
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
            <Columns3 className="size-3.5" aria-hidden /> Columns
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        {hideable.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
          >
            {typeof column.columnDef.header === 'string' && column.columnDef.header
              ? column.columnDef.header
              : column.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DataGrid<T>({
  table,
  empty,
  onPaste,
  onRowClick,
  groupHeader,
  groupBy,
  columnVisibility,
  collapsedGroups,
  onCollapsedGroupsChange,
  RowComponent = DefaultRow,
  className,
}: {
  table: TanTable<T>;
  empty: ReactNode;
  onPaste?: ClipboardEventHandler<HTMLDivElement>;
  onRowClick?: (row: T) => void;
  /** One spanning line above the rows — "3 renders • 2 finished". */
  groupHeader?: ReactNode;
  /** Group rows under collapsible headers, in the order each group first appears. */
  groupBy?: (row: T) => { key: string; label: ReactNode };
  /** Show a "Columns" menu toggling every column that can hide. */
  columnVisibility?: boolean;
  /** Collapsed group keys, when the caller keeps them; otherwise the grid does. */
  collapsedGroups?: ReadonlySet<string>;
  onCollapsedGroupsChange?: (next: ReadonlySet<string>) => void;
  /** Draws each body row — pass one that wraps `tr` to make rows sortable by drag. */
  RowComponent?: ComponentType<DataGridRowProps<T>>;
  className?: string;
}) {
  const [ownCollapsed, setOwnCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const collapsed = collapsedGroups ?? ownCollapsed;
  const rows = table.getRowModel().rows;
  const width = table.getVisibleLeafColumns().length;
  const groups = groupBy ? groupRows(rows, groupBy) : [{ key: '', label: null, rows }];
  const toggleGroup = (key: string) => {
    const next = new Set(collapsed);
    if (!next.delete(key)) next.add(key);
    (onCollapsedGroupsChange ?? setOwnCollapsed)(next);
  };

  const grid = (
    <div className={cn('overflow-auto rounded-lg border bg-card', className)} onPaste={onPaste}>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-card">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const sortable =
                  !header.isPlaceholder &&
                  header.column.columnDef.enableSorting === true &&
                  header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    style={header.getSize() !== 150 ? { width: header.getSize() } : undefined}
                    aria-sort={sortable ? (sorted ? ARIA_SORT[sorted] : 'none') : undefined}
                    className="h-8 whitespace-nowrap text-2xs font-medium text-muted-foreground"
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <SortableHeader header={header} />
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {groupHeader && rows.length > 0 ? (
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableCell colSpan={width} className="h-7 py-0 text-2xs text-muted-foreground">
                {groupHeader}
              </TableCell>
            </TableRow>
          ) : null}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={width} className="h-24 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            groups.map((group) => {
              const open = !collapsed.has(group.key);
              return (
                <Fragment key={group.key}>
                  {groupBy ? (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={width} className="h-7 py-0">
                        <button
                          type="button"
                          aria-expanded={open}
                          className="inline-flex items-center gap-1.5 text-2xs font-medium"
                          onClick={() => toggleGroup(group.key)}
                        >
                          {open ? (
                            <ChevronDown className="size-3" aria-hidden />
                          ) : (
                            <ChevronRight className="size-3" aria-hidden />
                          )}
                          {group.label}
                          <span className="tabular-nums text-muted-foreground">
                            {group.rows.length}
                          </span>
                        </button>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {open
                    ? group.rows.map((row) => (
                        <RowComponent
                          key={row.id}
                          row={row}
                          data-state={row.getIsSelected() ? 'selected' : undefined}
                          className={cn('h-9', onRowClick && 'cursor-pointer')}
                          onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="py-1 align-middle">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </RowComponent>
                      ))
                    : null}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (!columnVisibility) return grid;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-end">
        <ColumnVisibilityMenu table={table} />
      </div>
      {grid}
    </div>
  );
}

function groupRows<T>(rows: Row<T>[], groupBy: (row: T) => { key: string; label: ReactNode }) {
  const groups = new Map<string, { key: string; label: ReactNode; rows: Row<T>[] }>();
  for (const row of rows) {
    const { key, label } = groupBy(row.original);
    const group = groups.get(key) ?? { key, label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}
