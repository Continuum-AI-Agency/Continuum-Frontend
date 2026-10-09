import type { z } from 'zod';
import type { tableSchema } from '@/lib/jaina/schemas';

type Table = z.infer<typeof tableSchema>;

interface JainaReportTablesProps {
  tables: Table[];
}

export function JainaReportTables({ tables }: JainaReportTablesProps) {
  if (!tables || tables.length === 0) return null;

  return (
    <div className="space-y-6">
      <span className="text-base font-semibold text-primary/80">Detailed Data</span>
      <div className="space-y-6">
        {tables.map((table: Table, index: number) => (
          <TableCard
            key={table.headers.join('-') || `table-${index}`}
            table={table}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

function TableCard({ table, index }: { table: Table; index: number }) {
  return (
    <div className="overflow-hidden rounded-xl bg-muted/40">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-foreground/5">
            <tr>
              {table.headers.map((header: string) => (
                <th
                  key={header}
                  className="text-left px-4 py-3 text-muted-foreground font-medium uppercase text-xs tracking-wider whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row: string[], rowIndex: number) => (
              <tr
                key={`${rowIndex}-${row[0]}`}
                className="border-b border-foreground/5 last:border-b-0"
              >
                {row.map((cell: string, cellIndex: number) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    className="px-4 py-3 text-foreground whitespace-nowrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
