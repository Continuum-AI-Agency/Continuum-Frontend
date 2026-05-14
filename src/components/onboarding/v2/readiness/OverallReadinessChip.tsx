import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScoreBadge } from "./ScoreBadge";
import { ScorePip } from "./ScorePip";
import { bandFor } from "./ScoreBadge";
import { DIMENSION_LABELS } from "./utils";
import type { ReadinessAnalysis, ReadinessDimension } from "@/lib/onboarding/agentClient";

type Props = {
  readiness: ReadinessAnalysis | null;
  loading: boolean;
};

export function OverallReadinessChip({ readiness, loading }: Props) {
  if (loading) {
    return <ScoreBadge label="Brand readiness" score={null} loading className="h-7 px-3" />;
  }
  if (!readiness) return null;

  const score = readiness.overall_score;
  const band = bandFor(score);
  const pipColor = band === "strong" ? "#0daea2" : band === "watch" ? "#f59e0b" : "#e11d48";

  return (
    <HoverCard openDelay={200} closeDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#fafaff] px-3 py-1.5 text-[12px] font-medium text-[#0b1220] shadow-sm transition-colors hover:border-[#cbd5e1]"
        >
          <ScorePip score={score} size={14} color={pipColor} />
          Brand readiness
          <span className="tabular-nums text-[#64748b]">· {Math.round(score)}%</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
          What we scored
        </p>
        <ul className="space-y-2">
          {(Object.keys(readiness.dimensions) as ReadinessDimension[]).map((dim) => {
            const d = readiness.dimensions[dim];
            if (!d) return null;
            return (
              <li key={dim} className="flex items-start justify-between gap-3 text-[12px]">
                <div className="min-w-0">
                  <p className="font-medium text-[#0b1220]">{DIMENSION_LABELS[dim]}</p>
                  <p className="leading-snug text-[#64748b]">{d.rationale}</p>
                </div>
                <span className="shrink-0 tabular-nums text-[#64748b]">{Math.round(d.score)}</span>
              </li>
            );
          })}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}
