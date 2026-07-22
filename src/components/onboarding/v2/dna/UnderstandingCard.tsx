import { Skeleton } from '@/components/ui/skeleton';
import type { AgentPreviewBuckets } from '../state/agentPreview';
import { CardSurface } from './CardSurface';
import { BulletList, ChipRow } from './listprimitives';

type Props = {
  buckets: AgentPreviewBuckets | null;
};

export function UnderstandingCard({ buckets }: Props) {
  const understanding = buckets?.understanding ?? null;
  const hasResult = Boolean(buckets?.result);
  const status = understanding ? 'done' : hasResult ? 'done' : 'indeterminate';

  return (
    <CardSurface
      title="Understanding brief"
      badge="Analysis"
      status={status}
      isEmpty={understanding === null}
      minBodyHeight={200}
      skeleton={
        <div className="space-y-3">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      }
    >
      {understanding ? (
        <>
          {understanding.positioning_thesis ? (
            <div>
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Positioning thesis
              </p>
              <p className="text-sm leading-snug text-foreground">
                {understanding.positioning_thesis}
              </p>
            </div>
          ) : null}
          {understanding.hypothesis_icp ? (
            <div>
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Hypothesis (ICP)
              </p>
              <p className="text-sm leading-snug text-muted-foreground">
                {understanding.hypothesis_icp}
              </p>
            </div>
          ) : null}
          {understanding.tonal_signal ? (
            <div>
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tonal signal
              </p>
              <p className="text-sm leading-snug text-muted-foreground">
                {understanding.tonal_signal}
              </p>
            </div>
          ) : null}
          {understanding.brand_pillars && understanding.brand_pillars.length > 0 ? (
            <ChipRow label="Brand pillars" values={understanding.brand_pillars} variant="violet" />
          ) : null}
          {understanding.content_pillars && understanding.content_pillars.length > 0 ? (
            <ChipRow
              label="Content pillars"
              values={understanding.content_pillars}
              variant="teal"
            />
          ) : null}
          {understanding.notable_evidence && understanding.notable_evidence.length > 0 ? (
            <BulletList label="Notable evidence" items={understanding.notable_evidence} />
          ) : null}
        </>
      ) : null}
    </CardSurface>
  );
}
