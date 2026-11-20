import { useTranslations } from 'next-intl';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { ReadinessAnalysis, ReadinessDimension } from '@/lib/onboarding/agentClient';
import { ScoreBadge } from './ScoreBadge';
import { getDimensionLabels, scoreFor } from './utils';

type Props = {
  dim: ReadinessDimension;
  readiness: ReadinessAnalysis | null;
  loading: boolean;
};

export function DimensionChip({ dim, readiness, loading }: Props) {
  const tUi = useTranslations('onboarding');

  const score = scoreFor(readiness, dim);
  if (!loading && score === null) return null;

  const rationale = readiness?.dimensions?.[dim]?.rationale;
  const badge = <ScoreBadge label={getDimensionLabels(tUi)[dim]} score={score} loading={loading} />;

  if (!rationale) return badge;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger>{badge}</HoverCardTrigger>
      <HoverCardContent className="w-64 p-3" side="top">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {getDimensionLabels(tUi)[dim]}
        </p>
        <p className="mt-1 text-sm leading-snug text-foreground">{rationale}</p>
        {score !== null ? (
          <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
            {tUi('m_f2b514b256')}
            {Math.round(score)}
          </p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
