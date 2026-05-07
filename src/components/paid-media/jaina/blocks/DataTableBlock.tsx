"use client";

import type { DataTableBlockV2 } from "@/lib/jaina/schemas";
import { formatValue } from "@/lib/jaina/formatValue";
import { MediaText } from "./mediaText";

type DataTableBlockProps = { block: DataTableBlockV2; isStreaming: boolean };

export function DataTableBlock({ block }: DataTableBlockProps) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-foreground">{block.title}</h4>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              {block.columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-3 py-2 text-xs font-medium text-muted-foreground text-${column.align ?? "left"}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/30 last:border-0">
                {block.columns.map((column) => {
                  const raw = row[column.key];
                  const displayValue =
                    raw == null
                      ? "—"
                      : formatValue(raw as string | number, column.format ?? undefined);
                  return (
                    <td
                      key={column.key}
                      className="px-3 py-2 tabular-nums"
                      style={{ textAlign: column.align ?? "left" }}
                    >
                      {!column.format || column.format === "text" ? (
                        <MediaText>{displayValue}</MediaText>
                      ) : (
                        displayValue
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.notes && (
        <p className="mt-1.5 text-xs text-muted-foreground/70 italic">{block.notes}</p>
      )}
    </div>
  );
}

export default DataTableBlock;
