import { Skeleton } from '@/components/ui/skeleton';
import type { ReadinessAnalysis } from '@/lib/onboarding/agentClient';
import { FindingsStack } from '../readiness/FindingsStack';
import { ReadinessRadarChart } from '../readiness/ReadinessRadarChart';
import { ScoreBadge } from '../readiness/ScoreBadge';
import type { AgentPreviewBuckets } from '../state/agentPreview';
import { CardSurface } from './CardSurface';

type Props = {
  buckets: AgentPreviewBuckets | null;
  readiness: ReadinessAnalysis | null;
};

export function ReadinessCard({ buckets, readiness }: Props) {
  const status = buckets?.sectionStatus.readiness ?? (readiness ? 'done' : 'indeterminate');
  const isEmpty = readiness === null;

  return (
    <CardSurface
      title="Brand readiness"
      chips={readiness ? <ScoreBadge label="Overall" score={readiness.overall_score} /> : null}
      status={status}
      isEmpty={isEmpty}
      minBodyHeight={260}
      skeleton={<Skeleton className="h-[240px] w-full rounded-lg" />}
    >
      {readiness ? (
        <div className="space-y-3">
          <ReadinessRadarChart readiness={readiness} />
          {readiness.findings && readiness.findings.length > 0 ? (
            <FindingsStack findings={readiness.findings.slice(0, 3)} />
          ) : null}
        </div>
      ) : null}
    </CardSurface>
  );
}
