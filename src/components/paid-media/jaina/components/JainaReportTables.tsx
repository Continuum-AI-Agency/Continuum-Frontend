import type { z } from 'zod';
import type { tableSchema } from '@/lib/jaina/schemas';

type Table = z.infer<typeof tableSchema>;

interface JainaReportTablesProps {
  tables: Table[];
}

export function JainaReportTables({ tables }: JainaReportTablesProps) {
  if (!tables || tables.length === 0) return null;

  return (
    <div className="space-y-6 pt-4 border-t border-white/5">
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
    <div className="rounded-lg border border-white/10 bg-black/20 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              {table.headers.map((header: string) => (
                <th
                  key={header}
                  className="text-left px-4 py-3 text-white/70 font-medium uppercase text-xs tracking-wider whitespace-nowrap"
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
                className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors"
              >
                {row.map((cell: string, cellIndex: number) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    className="px-4 py-3 text-white/80 whitespace-nowrap"
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
