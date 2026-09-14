'use client';

// The wizard's four steps as a row of numbered pills. Completed steps are clickable so an
// operator can go back and change one answer without unwinding the rest.

import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS, type WizardStep } from './wizardModel';

type StepperProps = {
  current: WizardStep;
  completed: ReadonlySet<WizardStep>;
  onSelect: (step: WizardStep) => void;
};

export function Stepper({ current, completed, onSelect }: StepperProps) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Portfolio setup steps">
      {WIZARD_STEPS.map((step, index) => {
        const done = completed.has(step.id);
        const active = step.id === current;
        const reachable = done || active;
        return (
          <li className="flex items-center gap-2" key={step.id}>
            <button
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full border px-2.5 py-1 text-left text-xs transition-colors',
                active && 'border-primary/60 bg-accent/40 text-foreground',
                done && !active && 'border-border/70 text-foreground hover:bg-muted/30',
                !reachable && 'border-border/50 text-muted-foreground',
              )}
              disabled={!reachable}
              onClick={() => onSelect(step.id)}
              type="button"
            >
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full text-3xs font-semibold',
                  done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  active && !done && 'bg-primary/15 text-primary',
                )}
              >
                {done ? <CheckIcon aria-hidden className="size-3" /> : index + 1}
              </span>
              <span className="font-medium">{step.label}</span>
              <span className="hidden text-2xs text-muted-foreground lg:inline">{step.hint}</span>
            </button>
            {index < WIZARD_STEPS.length - 1 ? (
              <span aria-hidden className="h-px w-4 bg-border" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
