'use client';

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RuleAction } from '@/lib/approvals/types';
import { getActionIcon } from './actionIcons';
import { useApprovalFormatters } from './formatters';

type Props = {
  actions: RuleAction[];
  onSelect: (id: string) => void;
};

export function QueueTable({ actions, onSelect }: Props) {
  const { actionTypeLabel, formatRelativeTime, scopeLabel, whyText } = useApprovalFormatters();

  const uiText = useTranslations('common');
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'created_at', desc: true }]);

  const columns = React.useMemo<ColumnDef<RuleAction>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: ({ column }) => <SortHeader column={column} label={uiText('queued_661ff40')} />,
        cell: ({ row }) => (
          <span className="font-data text-xs tabular-nums text-muted-foreground">
            {formatRelativeTime(row.original.created_at)}
          </span>
        ),
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'action_type',
        header: uiText('m_3deb745651'),
        cell: ({ row }) => {
          const Icon = getActionIcon(row.original.action_type);
          return (
            <Badge
              variant="secondary"
              className="gap-1.5 font-data text-2xs uppercase tracking-wide"
            >
              <Icon className="h-3 w-3" strokeWidth={1.5} />
              {actionTypeLabel(row.original.action_type)}
            </Badge>
          );
        },
      },
      {
        id: 'scope',
        header: uiText('m_4651a34e4d'),
        cell: ({ row }) => (
          <span className="font-data text-xs text-foreground">{scopeLabel(row.original)}</span>
        ),
      },
      {
        id: 'why',
        header: uiText('m_98365abf7a'),
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-[36rem] text-xs text-muted-foreground">
            {whyText(row.original)}
          </span>
        ),
      },
    ],
    [uiText, uiText],
  );

  const table = useReactTable({
    data: actions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} className="text-2xs uppercase tracking-wider">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                {uiText('m_77e8e4ed31')}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => onSelect(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SortHeader({
  column,
  label,
}: {
  column: {
    toggleSorting: (asc?: boolean) => void;
    getIsSorted: () => false | 'asc' | 'desc';
  };
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 px-2 text-2xs uppercase tracking-wider text-muted-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );
}
