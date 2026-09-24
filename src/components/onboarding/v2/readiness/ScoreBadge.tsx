import { type ReadinessSeverity, readinessSeverity } from '@continuum/contracts';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ScorePip } from './ScorePip';

// One cutoff for the whole product: the backend derives finding severity from the
// same function, so a badge can never disagree with the finding beside it. Colours
// are theme tokens so both modes hold contrast.
const SEVERITY_TONE: Record<
  ReadinessSeverity,
  { badge: 'success' | 'warning' | 'destructive'; color: string }
> = {
  low: { badge: 'success', color: 'var(--success)' },
  medium: { badge: 'warning', color: 'var(--warning)' },
  high: { badge: 'destructive', color: 'var(--destructive)' },
};

function toneFor(score: number) {
  return SEVERITY_TONE[readinessSeverity(score)];
}

type ScoreBadgeProps = {
  label: string;
  score: number | null;
  loading?: boolean;
  className?: string;
};

export function ScoreBadge({ label, score, loading, className }: ScoreBadgeProps) {
  if (loading || score === null) {
    return <Skeleton className={cn('h-5 w-24 rounded-full', className)} />;
  }
  const tone = toneFor(score);
  return (
    <Badge variant={tone.badge} className={cn('gap-1.5', className)}>
      <ScorePip score={score} color={tone.color} />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums opacity-80">· {Math.round(score)}</span>
    </Badge>
  );
}
