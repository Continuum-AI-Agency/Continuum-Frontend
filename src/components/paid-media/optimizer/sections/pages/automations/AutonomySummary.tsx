'use client';

// How the account's portfolios spread across the four levels: one thin bar, a segment per level
// as wide as its count, and every count written beside its name — the bar is never the only place
// a figure lives. The levels are one ordered scale, so they take one ramp of the brand violet.

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { AUTONOMY_LEVELS, type AutonomyLevel, LEVEL_COPY } from './autonomyModel';

const LEVEL_TONE: Record<AutonomyLevel, string> = {
  observe: 'bg-muted-foreground/35',
  recommend: 'bg-primary/35',
  approve: 'bg-primary/65',
  autopilot: 'bg-primary',
};

export function AutonomySummary({ counts }: { counts: Record<AutonomyLevel, number> }) {
  const reduce = useReducedMotion();
  const total = AUTONOMY_LEVELS.reduce((sum, level) => sum + counts[level], 0);
  if (total === 0) return null;
  return (
    <div className="space-y-1.5" data-testid="autonomy-summary">
      <div aria-hidden="true" className="flex h-1.5 w-full gap-0.5">
        {AUTONOMY_LEVELS.filter((level) => counts[level] > 0).map((level, index) => (
          <motion.span
            animate={{ scaleX: 1 }}
            className={cn('h-full origin-left rounded-full', LEVEL_TONE[level])}
            initial={reduce ? false : { scaleX: 0 }}
            key={level}
            style={{ flexGrow: counts[level], flexBasis: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: index * 0.06 }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {AUTONOMY_LEVELS.map((level) => (
          <li
            className={cn(
              'inline-flex items-center gap-1.5',
              counts[level] === 0 ? 'text-muted-foreground' : 'text-foreground',
            )}
            data-level={level}
            key={level}
          >
            <span aria-hidden="true" className={cn('size-2 rounded-full', LEVEL_TONE[level])} />
            {LEVEL_COPY[level].label}
            <span className="font-mono font-semibold tabular-nums">{counts[level]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
