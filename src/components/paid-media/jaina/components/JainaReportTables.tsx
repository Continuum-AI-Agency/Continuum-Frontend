import type { z } from 'zod';
import { type DataColumn, type DataRow, DataTable } from '@/components/ui/data-table';
import type { tableSchema } from '@/lib/jaina/schemas';

type Table = z.infer<typeof tableSchema> & { title?: string; notes?: string };

interface JainaReportTablesProps {
  tables: Table[];
}

const PAGE_SIZE = 10;

// Cells arrive preformatted ("$9,840 USD", "4.1x", "2.9%"), so they are displayed and copied
// as-is; sorting compares the number inside when there is one.
export function JainaReportTables({ tables }: JainaReportTablesProps) {
  const withRows = (tables ?? []).filter((table) => table.rows.length > 0);
  if (withRows.length === 0) return null;

  return (
    <div className="space-y-6">
      {withRows.map((table, index) => (
        <DataTable
          key={table.headers.join('-') || `table-${index}`}
          title={
            table.title ??
            (withRows.length > 1
              ? `Detailed Data (${index + 1} of ${withRows.length})`
              : 'Detailed Data')
          }
          subtitle={table.notes}
          {...toDataTable(table)}
          pageSize={PAGE_SIZE}
          className="max-w-none"
        />
      ))}
    </div>
  );
}

export function toDataTable(table: Table): { data: DataRow[]; columns: DataColumn[] } {
  const data: DataRow[] = table.rows.map((row, rowIndex) => {
    const record: DataRow = { id: `r${rowIndex}` };
    table.headers.forEach((_, cellIndex) => {
      record[`c${cellIndex}`] = row[cellIndex] ?? null;
    });
    return record;
  });

  const columns: DataColumn[] = table.headers.map((header, cellIndex) => {
    const key = `c${cellIndex}`;
    const cells = table.rows
      .map((row) => row[cellIndex] ?? '')
      .filter((cell) => cell.trim() !== '' && cell.trim() !== '—');
    const numeric = cells.length > 0 && cells.every((cell) => parseNumericCell(cell) !== null);
    return {
      key,
      label: header,
      align: numeric ? 'right' : 'left',
      sortable: true,
      priority: 1,
      sortValue: (row) => {
        const text = String(row[key] ?? '');
        return parseNumericCell(text) ?? text;
      },
    };
  });

  return { data, columns };
}

const NUMERIC_CELL = /^([+-]?)(?:[^\d\s.,+-]{1,3}\s?)?(-?[\d,]*\.?\d+)\s*(?:%|x|[A-Z]{3})?$/;

/** "$9,840 USD" → 9840, "-1.4%" → -1.4, "4.1x" → 4.1; anything with words in it → null. */
export function parseNumericCell(text: string): number | null {
  const match = NUMERIC_CELL.exec(text.trim());
  if (!match) return null;
  const value = Number(`${match[1]}${match[2].replace(/,/g, '')}`);
  return Number.isFinite(value) ? value : null;
}
