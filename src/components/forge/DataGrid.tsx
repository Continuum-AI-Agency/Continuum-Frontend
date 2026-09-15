'use client';

import type { ApiRenderVariableKind } from '@continuum/contracts';
import {
  type Column,
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
  type RefObject,
  useLayoutEffect,
  useRef,
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
// gutter, and leading columns that can stay in view while the rest scrolls sideways. It is a
// rendering of a react-table instance — the caller owns columns, sorting, visibility and
// selection. It keeps which groups are collapsed unless the caller holds that itself — Renders
// does, because opening a job unmounts the grid.
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

/**
 * Opt-in per column through `meta`: `sticky: 'left'` keeps the column in view while the grid
 * scrolls sideways — the columns that say which row you are looking at.
 */
export type DataGridColumnMeta = { sticky?: 'left' };

export const STICKY_LEFT: DataGridColumnMeta = { sticky: 'left' };

// react-table types `meta` as an empty interface other columns fill with their own fields.
const isSticky = <T,>(column: Column<T>) =>
  (column.columnDef.meta as DataGridColumnMeta | undefined)?.sticky === 'left';

// Sticky cells must be opaque, so a row's tint is opaque too and the sticky cells inherit it.
const ROW_SURFACE =
  'bg-card hover:bg-[color-mix(in_oklab,var(--color-muted)_50%,var(--color-card))]';
const STUCK_EDGE = 'shadow-[inset_-1px_0_0_var(--color-border),8px_0_8px_-8px_rgb(0_0_0/0.18)]';

/**
 * Each sticky column's `left`: the widths of the sticky columns before it, measured from the header
 * row, because a cell's content decides its width and a size in the column def does not.
 */
function useStickyOffsets(headerRow: RefObject<HTMLTableRowElement | null>, ids: string[]) {
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const signature = ids.join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature stands for the sticky ids.
  useLayoutEffect(() => {
    const row = headerRow.current;
    if (!row || !signature) return;
    const cells = [...row.querySelectorAll<HTMLElement>('th[data-sticky]')];
    const measure = () => {
      let left = 0;
      const next: Record<string, number> = {};
      for (const cell of cells) {
        next[cell.dataset.columnId ?? ''] = left;
        left += cell.offsetWidth;
      }
      setOffsets((current) =>
        Object.keys(next).every((id) => current[id] === next[id]) ? current : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const cell of cells) observer.observe(cell);
    return () => observer.disconnect();
  }, [signature]);
  return offsets;
}

/** The checkbox gutter. Header toggles the page, cell toggles the row. Always in view. */
export function selectColumn<T>(): ColumnDef<T> {
  return {
    id: 'select',
    size: 32,
    meta: STICKY_LEFT,
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
  const leafColumns = table.getVisibleLeafColumns();
  const width = leafColumns.length;
  const stickyIds = leafColumns.filter(isSticky).map((column) => column.id);
  const headerRow = useRef<HTMLTableRowElement>(null);
  const stickyLeft = useStickyOffsets(headerRow, stickyIds);
  const [scrolled, setScrolled] = useState(false);
  /** Props that pin a cell of a sticky column; nothing for any other column. */
  const stickyProps = (column: Column<T>, surface: string) =>
    isSticky(column)
      ? {
          'data-sticky': 'left',
          'data-column-id': column.id,
          style: { left: stickyLeft[column.id] ?? 0 },
          className: cn(
            'sticky z-[1]',
            surface,
            scrolled && column.id === stickyIds.at(-1) && STUCK_EDGE,
          ),
        }
      : null;
  const groups = groupBy ? groupRows(rows, groupBy) : [{ key: '', label: null, rows }];
  const toggleGroup = (key: string) => {
    const next = new Set(collapsed);
    if (!next.delete(key)) next.add(key);
    (onCollapsedGroupsChange ?? setOwnCollapsed)(next);
  };

  const grid = (
    <div
      className={cn('overflow-auto rounded-lg border bg-card', className)}
      data-scrolled={scrolled || undefined}
      onPaste={onPaste}
      onScroll={(event) => setScrolled(event.currentTarget.scrollLeft > 0)}
    >
      {/* This div scrolls, not the table's own wrapper, so the grid knows when it has scrolled. */}
      <Table className="text-xs" containerClassName="overflow-visible">
        <TableHeader className="sticky top-0 z-10 bg-card">
          {table.getHeaderGroups().map((group, index, groups) => (
            <TableRow
              key={group.id}
              ref={index === groups.length - 1 ? headerRow : undefined}
              className="hover:bg-transparent"
            >
              {group.headers.map((header) => {
                const sortable =
                  !header.isPlaceholder &&
                  header.column.columnDef.enableSorting === true &&
                  header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const sticky = stickyProps(header.column, 'bg-card');
                return (
                  <TableHead
                    key={header.id}
                    {...sticky}
                    style={{
                      ...(header.getSize() !== 150 ? { width: header.getSize() } : {}),
                      ...sticky?.style,
                    }}
                    aria-sort={sortable ? (sorted ? ARIA_SORT[sorted] : 'none') : undefined}
                    className={cn(
                      'h-8 whitespace-nowrap text-2xs font-medium text-muted-foreground',
                      sticky?.className,
                    )}
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
                <div className="sticky left-2 w-max">{groupHeader}</div>
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
                          className="sticky left-2 flex w-max items-center gap-1.5 text-2xs font-medium"
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
                          className={cn('h-9', ROW_SURFACE, onRowClick && 'cursor-pointer')}
                          onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                        >
                          {row.getVisibleCells().map((cell) => {
                            const sticky = stickyProps(cell.column, 'bg-inherit');
                            return (
                              <TableCell
                                key={cell.id}
                                {...sticky}
                                className={cn('py-1 align-middle', sticky?.className)}
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            );
                          })}
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
