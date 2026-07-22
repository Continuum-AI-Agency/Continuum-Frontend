import { Skeleton } from '@/components/ui/skeleton';
import type { AgentPreviewBuckets } from '../state/agentPreview';
import { CardSurface } from './CardSurface';

type Props = {
  buckets: AgentPreviewBuckets | null;
};

export function FirstImpressionCard({ buckets }: Props) {
  const firstImpression = buckets?.firstImpression ?? null;
  const status = buckets?.sectionStatus.first_impression ?? 'indeterminate';

  return (
    <CardSurface
      title="First impression"
      badge="Hook"
      status={status}
      isEmpty={firstImpression === null}
      minBodyHeight={88}
      skeleton={
        <div className="space-y-2">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      }
    >
      {firstImpression?.headline ? (
        <p className="text-balance text-base italic leading-snug text-[#0b1220]">
          {firstImpression.headline}
        </p>
      ) : (
        <p className="text-sm text-[#94a3b8]">No headline produced for this run.</p>
      )}
    </CardSurface>
  );
}
