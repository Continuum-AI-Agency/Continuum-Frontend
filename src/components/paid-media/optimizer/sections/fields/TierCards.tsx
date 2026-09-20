'use client';

// The autonomy tier as three cards, in plain language: what each one does and what it
// never does. Shared by the creation wizard and the Manage panel so the tier reads the
// same on both. Autopilot is always choosable — picking it is what opens the guardrails,
// never a greyed-out option behind two fields nobody explained.

import type { ApplyMode } from '@continuum/contracts';
import { SparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyModePill } from '../../reportModel';

export const APPLY_MODES: ApplyMode[] = ['observe', 'recommend', 'autopilot'];

export const TIER_COPY: Record<ApplyMode, { title: string; body: string }> = {
  observe: {
    title: 'Watch',
    body: 'Scores every cycle and shows what it would do. Never touches Meta.',
  },
  recommend: {
    title: 'Recommend',
    body: 'Proposes each budget move. You approve; one click applies them.',
  },
  autopilot: {
    title: 'Autopilot',
    body: 'Applies budget moves inside your guardrails and approves the actions you tick. Anything it creates is born paused.',
  },
};

type TierCardsProps = {
  value: ApplyMode;
  /** Highlights the Autopilot card while its guardrails are being set up. */
  arming?: boolean;
  onSelect: (next: ApplyMode) => void;
  disabled?: boolean;
  className?: string;
};

export function TierCards({
  value,
  arming = false,
  onSelect,
  disabled,
  className,
}: TierCardsProps) {
  return (
    <fieldset className={cn('grid min-w-0 gap-2 sm:grid-cols-3', className)}>
      <legend className="sr-only">Autonomy tier</legend>
      {APPLY_MODES.map((tier) => {
        const active = value === tier || (tier === 'autopilot' && arming && value !== 'autopilot');
        const copy = TIER_COPY[tier];
        return (
          <button
            aria-pressed={active}
            className={cn(
              'rounded-lg border px-3 py-2 text-left transition-colors',
              active
                ? 'border-primary/60 bg-accent/40 ring-1 ring-primary/40'
                : 'border-border/70 bg-card hover:bg-muted/30',
              disabled && 'pointer-events-none opacity-60',
            )}
            disabled={disabled}
            key={tier}
            onClick={() => onSelect(tier)}
            type="button"
          >
            <span className="flex items-center gap-1.5 font-semibold text-xs">
              {tier === 'autopilot' ? (
                <SparklesIcon aria-hidden="true" className="size-3.5 text-primary" />
              ) : null}
              {applyModePill(tier)?.label ?? copy.title}
            </span>
            <span className="mt-0.5 block text-2xs text-muted-foreground">{copy.body}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
