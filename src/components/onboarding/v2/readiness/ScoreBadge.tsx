import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ScorePip } from "./ScorePip";

export type ScoreBand = "strong" | "watch" | "weak";

export function bandFor(score: number): ScoreBand {
  if (score >= 70) return "strong";
  if (score >= 40) return "watch";
  return "weak";
}

export const BAND_STYLES: Record<ScoreBand, { className: string; pip: string }> = {
  strong: {
    className:
      "border-[color-mix(in_srgb,#0daea2_28%,transparent)] bg-[color-mix(in_srgb,#0daea2_8%,transparent)] text-[#0a8a80]",
    pip: "#0daea2",
  },
  watch: {
    className:
      "border-[color-mix(in_srgb,#f59e0b_28%,transparent)] bg-[color-mix(in_srgb,#f59e0b_10%,transparent)] text-[#b45309]",
    pip: "#f59e0b",
  },
  weak: {
    className:
      "border-[color-mix(in_srgb,#e11d48_24%,transparent)] bg-[color-mix(in_srgb,#e11d48_8%,transparent)] text-[#be123c]",
    pip: "#e11d48",
  },
};

type ScoreBadgeProps = {
  label: string;
  score: number | null;
  loading?: boolean;
  className?: string;
};

export function ScoreBadge({ label, score, loading, className }: ScoreBadgeProps) {
  if (loading || score === null) {
    return <Skeleton className={cn("h-5 w-24 rounded-full", className)} />;
  }
  const style = BAND_STYLES[bandFor(score)];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border", style.className, className)}>
      <ScorePip score={score} color={style.pip} />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums opacity-80">· {Math.round(score)}</span>
    </Badge>
  );
}
