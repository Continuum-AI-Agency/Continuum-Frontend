import { Check } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { ShellPillId } from './OnboardingShell';

export type StepperState = 'done' | 'active' | 'pending';

type StepperStep = { id: ShellPillId; label: string; description: string; state: StepperState };

type OnboardingStepperProps = {
  steps: StepperStep[];
  onStepClick?: (id: ShellPillId) => void;
};

export function OnboardingStepper({ steps, onStepClick }: OnboardingStepperProps) {
  return (
    <ol className="flex w-full items-stretch justify-between gap-1 sm:justify-center sm:gap-0">
      {steps.map((step, index) => {
        const interactive = step.state !== 'pending' && onStepClick;
        const isLast = index === steps.length - 1;
        return (
          <li
            key={step.id}
            className="flex min-w-0 items-center gap-1 sm:min-w-max sm:flex-1 sm:gap-3"
          >
            <button
              type="button"
              aria-label={`${step.label}: ${step.description}`}
              disabled={!interactive}
              onClick={interactive ? () => onStepClick(step.id) : undefined}
              className={cn(
                'group flex min-w-0 flex-1 items-center gap-1 text-left transition-opacity sm:min-w-max sm:gap-3',
                !interactive && 'cursor-default',
                interactive && 'hover:opacity-80',
              )}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                className={cn(
                  'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  step.state === 'done' && 'bg-primary text-primary-foreground',
                  step.state === 'active' &&
                    'bg-[var(--primary)] text-white ring-4 ring-[color-mix(in_srgb,var(--primary)_18%,transparent)]',
                  step.state === 'pending' &&
                    'border border-border bg-white text-muted-foreground dark:bg-card',
                )}
              >
                {step.state === 'done' ? (
                  <motion.span
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 460, damping: 22 }}
                  >
                    <Check className="h-4 w-4" weight="bold" />
                  </motion.span>
                ) : (
                  <motion.span
                    key={`${step.id}-${step.state}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {index + 1}
                  </motion.span>
                )}
              </motion.span>
              <div className={cn('min-w-0 flex-1', step.state !== 'active' && 'hidden sm:block')}>
                <p
                  className={cn(
                    'truncate text-xs font-semibold leading-tight transition-colors sm:text-sm',
                    step.state === 'active' && 'text-foreground',
                    step.state === 'done' && 'text-foreground',
                    step.state === 'pending' && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">
                  {step.description}
                </p>
              </div>
            </button>
            {isLast ? null : (
              <div className="relative hidden h-px flex-1 overflow-hidden bg-border sm:block">
                <motion.span
                  initial={false}
                  animate={{ scaleX: step.state === 'done' ? 1 : 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: 'left center' }}
                  className="absolute inset-0 bg-primary"
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
