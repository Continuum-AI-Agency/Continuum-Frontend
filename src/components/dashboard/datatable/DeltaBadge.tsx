import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Period-over-period delta. Emerald up / red down, monospace tabular so columns
// of deltas align. Shared across every dashboard data table.
export function DeltaBadge({ value, className }: { value: number; className?: string }) {
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-0.5 font-mono text-[11px] tabular-nums",
        positive ? "text-emerald-500" : "text-red-500",
        className,
      )}
    >
      <Icon className="size-3" />
      {Math.abs(Math.round(value))}%
    </span>
  );
}
