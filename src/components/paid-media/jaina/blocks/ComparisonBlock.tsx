"use client";

import type { ComparisonBlockV2 } from "@/lib/jaina/schemas";
import { formatValue } from "@/lib/jaina/formatValue";
import { cn } from "@/lib/utils";
import { ArrowUpIcon, ArrowDownIcon } from "lucide-react";
import { MediaText } from "./mediaText";

type ComparisonBlockProps = { block: ComparisonBlockV2; isStreaming: boolean };

const severityClass: Record<string, string> = {
  positive: "text-emerald-500",
  watch: "text-amber-500",
  risk: "text-red-500",
  neutral: "text-muted-foreground",
};

export default function ComparisonBlock({ block }: ComparisonBlockProps) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-foreground">{block.title}</h4>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Metric", block.before_label, block.after_label, "Change"].map((heading) => (
                <th
                  key={heading}
                  className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30 text-left first:text-left text-right"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.pairs.map((pair, index) => {
              const color = severityClass[pair.severity ?? "neutral"] ?? "text-muted-foreground";
              return (
                <tr key={`${pair.label}-${index}`} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground"><MediaText>{pair.label}</MediaText></td>
                  <td className="px-3 py-2 tabular-nums text-right">
                    {formatValue(pair.before, pair.format ?? undefined)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-right">
                    {formatValue(pair.after, pair.format ?? undefined)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", color)}>
                    {pair.change_direction === "up" && (
                      <ArrowUpIcon className="inline-block h-3 w-3 mr-0.5" />
                    )}
                    {pair.change_direction === "down" && (
                      <ArrowDownIcon className="inline-block h-3 w-3 mr-0.5" />
                    )}
                    {Math.abs(pair.change ?? 0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
