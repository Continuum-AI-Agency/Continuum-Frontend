'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The autonomy dial: Observe → Recommend → Approve → Autopilot, one track, the level the portfolio
// is on lifted onto the page colour. The lift slides to the new level once the write has landed —
// never before, so the dial cannot show a level the database does not hold. A level something
// blocks carries a lock and its reason; the level being written spins until the answer comes back.

import { Loader2Icon, LockIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { AUTONOMY_LEVELS, type AutonomyLevel, LEVEL_COPY } from './autonomyModel';

export function AutonomyDial({
  portfolioId,
  value,
  locks,
  pending,
  disabled = false,
  onSelect,
}: {
  portfolioId: string;
  value: AutonomyLevel;
  locks: Partial<Record<AutonomyLevel, string>>;
  /** The level being written, while it is. */
  pending: AutonomyLevel | null;
  disabled?: boolean;
  onSelect: (level: AutonomyLevel) => void;
}) {
  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  const at = AUTONOMY_LEVELS.indexOf(value);
  return (
    <fieldset
      className="hit-area-row relative grid min-w-0 grid-cols-4 gap-0.5 rounded-xl border-0 bg-muted/60 p-0.5 [--hit-area-gap:calc(var(--spacing)*0.5)]"
      data-level={value}
      data-testid="autonomy-dial"
    >
      <legend className="sr-only">{betaUiText('beta_161abbf6295a')}</legend>
      {AUTONOMY_LEVELS.map((level, index) => {
        const selected = level === value;
        const lock = selected ? undefined : locks[level];
        return (
          <button
            aria-pressed={selected}
            className={cn(
              'hit-area relative flex min-w-0 items-center justify-center rounded-[10px] px-1 py-1.5 font-medium text-xs transition-colors',
              selected ? 'text-foreground' : 'text-muted-foreground',
              !selected && !lock && !disabled && pending === null && 'hover:text-foreground',
              lock && 'cursor-not-allowed opacity-60',
            )}
            data-level-option={level}
            data-locked={lock ? 'true' : undefined}
            disabled={!selected && (Boolean(lock) || disabled || pending !== null)}
            key={level}
            onClick={() => {
              if (!selected) onSelect(level);
            }}
            title={lock ?? LEVEL_COPY[level].hint}
            type="button"
          >
            {selected ? (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-[10px] bg-background shadow-sm"
                layoutId={`autonomy-dial-${portfolioId}`}
                transition={
                  reduce ? { duration: 0 } : { type: 'spring', visualDuration: 0.35, bounce: 0.15 }
                }
              />
            ) : null}
            {/* The levels below the one in force read as passed: the track fills up to it. */}
            {index < at ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-primary/35"
              />
            ) : null}
            <span className="relative z-10 inline-flex min-w-0 items-center gap-1">
              {/* On a phone the label needs the whole step: a locked step there reads by its fade,
                  and the reason is written under the dial either way. */}
              {lock ? (
                <LockIcon aria-hidden="true" className="hidden size-3 shrink-0 sm:block" />
              ) : null}
              <span className="truncate">{LEVEL_COPY[level].label}</span>
            </span>
            {pending === level ? (
              <Loader2Icon
                aria-hidden="true"
                className="absolute top-0.5 right-0.5 z-10 size-2.5 animate-spin"
                data-testid="autonomy-dial-pending"
              />
            ) : null}
          </button>
        );
      })}
    </fieldset>
  );
}
