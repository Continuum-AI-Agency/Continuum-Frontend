'use client';

// The wizard's four steps. In a wide container they stand as a vertical list beside the step
// (done in green with the answer they hold, the current one tinted, the rest muted); in a narrow
// one the same list lies down as a compact row on top. Completed steps are clickable so an
// operator can go back and change one answer without unwinding the rest.

import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS, type WizardStep } from './wizardModel';

type StepperProps = {
  current: WizardStep;
  completed: ReadonlySet<WizardStep>;
  onSelect: (step: WizardStep) => void;
  /** The short answer a done step holds, e.g. "14 ad sets". */
  values?: Partial<Record<WizardStep, string>>;
};

export function Stepper({ current, completed, onSelect, values = {} }: StepperProps) {
  return (
    <ol
      aria-label="Portfolio setup steps"
      className="flex gap-1 overflow-x-auto @4xl:flex-col @4xl:overflow-visible"
    >
      {WIZARD_STEPS.map((step, index) => {
        const done = completed.has(step.id);
        const active = step.id === current;
        const reachable = done || active;
        const value = done && !active ? values[step.id] : undefined;
        return (
          <li className="shrink-0" key={step.id}>
            <button
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex w-full items-baseline gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors @4xl:py-2',
                active && 'bg-primary/10 font-semibold text-primary',
                done && !active && 'text-success hover:bg-muted/40',
                !reachable && 'text-muted-foreground',
              )}
              disabled={!reachable}
              onClick={() => onSelect(step.id)}
              title={step.hint}
              type="button"
            >
              <span aria-hidden className="w-3 shrink-0 font-mono text-xs tabular-nums">
                {done && !active ? <CheckIcon className="size-3.5 translate-y-0.5" /> : index + 1}
              </span>
              <span className="whitespace-nowrap @4xl:whitespace-normal">
                {step.label}
                {value ? <span className="hidden font-normal @4xl:inline"> · {value}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
