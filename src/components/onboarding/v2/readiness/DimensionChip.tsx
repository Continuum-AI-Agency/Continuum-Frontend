import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScoreBadge } from "./ScoreBadge";
import { DIMENSION_LABELS, scoreFor } from "./utils";
import type { ReadinessAnalysis, ReadinessDimension } from "@/lib/onboarding/agentClient";

type Props = {
  dim: ReadinessDimension;
  readiness: ReadinessAnalysis | null;
  loading: boolean;
};

export function DimensionChip({ dim, readiness, loading }: Props) {
  const score = scoreFor(readiness, dim);
  if (!loading && score === null) return null;

  const rationale = readiness?.dimensions?.[dim]?.rationale;
  const badge = <ScoreBadge label={DIMENSION_LABELS[dim]} score={score} loading={loading} />;

  if (!rationale) return badge;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger>{badge}</HoverCardTrigger>
      <HoverCardContent className="w-64 p-3" side="top">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
          {DIMENSION_LABELS[dim]}
        </p>
        <p className="mt-1 text-[12px] leading-snug text-[#374151]">{rationale}</p>
        {score !== null ? (
          <p className="mt-1.5 text-[11px] tabular-nums text-[#64748b]">Score: {Math.round(score)}</p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
