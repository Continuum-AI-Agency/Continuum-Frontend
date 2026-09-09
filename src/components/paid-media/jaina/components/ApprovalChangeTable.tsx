'use client';

import type { JainaApprovalPreview } from '@continuum/contracts';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * What approving this call will actually change — one row per field, before → after.
 *
 * A person deciding on a gated Meta write is deciding about a budget or a status, not
 * about a uuid. The rows are computed by the gated tool's registry entry from the
 * proposed input ALONE, so this table and the call that runs read the same values; the
 * exact-input list stays below it because the table summarises and the list IS the call.
 */

type PreviewRow = JainaApprovalPreview['rows'][number];

/** Signed, one decimal — `+25.0%`. Direction is the whole message, so it carries a tone. */
const formatChangePct = (pct: number): string => `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;

const changeTone = (pct: number): string => {
  if (pct > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (pct < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-muted-foreground';
};

const formatSide = (value: PreviewRow['before'], unit?: string): string => {
  if (value === null || value === undefined) return '—';
  return unit ? `${String(value)} ${unit}` : String(value);
};

export function ApprovalChangeTable({ preview }: { preview: JainaApprovalPreview }) {
  if (preview.rows.length === 0) return null;

  return (
    <Table className="caption-top">
      {preview.subject ? (
        <TableCaption className="mt-0 mb-1.5 text-left text-foreground/80">
          {preview.subject}
        </TableCaption>
      ) : null}
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 px-2 text-xs font-medium">Field</TableHead>
          <TableHead className="h-8 px-2 text-xs font-medium">Before</TableHead>
          <TableHead className="h-8 px-2 text-xs font-medium">After</TableHead>
          <TableHead className="h-8 px-2 text-right text-xs font-medium">Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {preview.rows.map((row) => (
          <TableRow key={row.field} className="hover:bg-transparent">
            <TableCell className="px-2 py-1.5 font-mono text-muted-foreground text-xs">
              {row.field}
            </TableCell>
            <TableCell className="px-2 py-1.5 text-muted-foreground text-xs tabular-nums">
              {formatSide(row.before, row.unit)}
            </TableCell>
            <TableCell className="px-2 py-1.5 font-medium text-xs tabular-nums">
              {formatSide(row.after, row.unit)}
            </TableCell>
            <TableCell
              className={cn(
                'px-2 py-1.5 text-right text-xs tabular-nums',
                typeof row.changePct === 'number'
                  ? changeTone(row.changePct)
                  : 'text-muted-foreground',
              )}
            >
              {/* A status flip has no rate; the arrow says "it changed" without inventing one. */}
              {typeof row.changePct === 'number' ? formatChangePct(row.changePct) : '→'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
