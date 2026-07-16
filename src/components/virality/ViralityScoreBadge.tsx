import type { ViralityGrade } from '@continuum/contracts';
import { cn } from '@/lib/utils';

// Grade heat ramp — cool (weak) to hot (viral). Semantic, separate from the app accent.
export const VIRALITY_GRADE_STYLES: Record<ViralityGrade, string> = {
  weak: 'bg-muted text-muted-foreground',
  okay: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  strong: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  viral: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
};

// Compact virality readout: the 0-100 number + its grade band. Renders nothing for
// an un-scored (pending) hook so callers can drop it in unconditionally.
export function ViralityScoreBadge({
  overall,
  grade,
  className,
}: {
  overall: number | null;
  grade: ViralityGrade | null;
  className?: string;
}) {
  if (overall === null || grade === null) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        VIRALITY_GRADE_STYLES[grade],
        className,
      )}
      title={`Virality ${overall}/100 · ${grade}`}
    >
      <span className="font-semibold">{overall}</span>
      <span className="text-[10px] uppercase tracking-wide">{grade}</span>
    </span>
  );
}
