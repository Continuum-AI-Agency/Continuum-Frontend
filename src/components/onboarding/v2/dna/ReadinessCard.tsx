import { Skeleton } from "@/components/ui/skeleton";
import { CardSurface } from "./CardSurface";
import { DimensionChip } from "../readiness/DimensionChip";
import { FindingsStack } from "../readiness/FindingsStack";
import type { ReadinessAnalysis, ReadinessDimension } from "@/lib/onboarding/agentClient";
import type { AgentPreviewBuckets } from "../state/agentPreview";

type Props = {
  buckets: AgentPreviewBuckets | null;
  readiness: ReadinessAnalysis | null;
  loading: boolean;
};

const DIMENSIONS: ReadinessDimension[] = [
  "brand_identity",
  "positioning",
  "messaging_coherence",
  "value_proposition",
  "icp_clarity",
  "customer_pains",
  "success_metrics",
];

export function ReadinessCard({ buckets, readiness, loading }: Props) {
  const status = buckets?.sectionStatus.readiness ?? (readiness ? "done" : "indeterminate");
  const isEmpty = readiness === null;
  const score = readiness?.overall_score;

  return (
    <CardSurface
      title="Brand readiness"
      badge="Score"
      status={status}
      isEmpty={isEmpty}
      minBodyHeight={220}
      skeleton={
        <div className="space-y-3">
          <Skeleton className="h-10 w-24" />
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full rounded-full" />
            ))}
          </div>
        </div>
      }
    >
      {readiness ? (
        <>
          {typeof score === "number" ? (
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-bold tabular-nums text-[#0b1220]">{Math.round(score)}</span>
              <span className="text-[11px] uppercase tracking-wide text-[#94a3b8]">/ 100</span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {DIMENSIONS.map((dim) => (
              <DimensionChip key={dim} dim={dim} readiness={readiness} loading={loading} />
            ))}
          </div>
          {readiness.findings && readiness.findings.length > 0 ? (
            <FindingsStack findings={readiness.findings.slice(0, 3)} />
          ) : null}
        </>
      ) : null}
    </CardSurface>
  );
}
