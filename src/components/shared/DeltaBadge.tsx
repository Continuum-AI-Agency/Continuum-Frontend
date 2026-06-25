import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Period-over-period delta. Emerald up / red down, monospace tabular so columns
// of deltas align. Shared across every dashboard, panel, and metric strip. Pass
// isPercent={false} for absolute deltas (no trailing %).
export function DeltaBadge({
  value,
  isPercent = true,
  className,
}: {
  value: number;
  isPercent?: boolean;
  className?: string;
}) {
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-0.5 font-mono text-xs tabular-nums",
        positive ? "text-emerald-500" : "text-red-500",
        className,
      )}
    >
      <Icon className="size-3" />
      {Math.abs(Math.round(value))}
      {isPercent ? "%" : ""}
    </span>
  );
}
