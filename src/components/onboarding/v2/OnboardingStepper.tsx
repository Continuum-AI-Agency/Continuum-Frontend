'use client';

import { useTranslations } from 'next-intl';
import { Stepper } from '@/components/arc/stepper/stepper';
import type { ShellPillId } from './OnboardingShell';

export type StepperState = 'done' | 'active' | 'pending';

type StepperStep = { id: ShellPillId; label: string; description: string; state: StepperState };

type OnboardingStepperProps = {
  steps: StepperStep[];
  onStepClick?: (id: ShellPillId) => void;
};

export function OnboardingStepper({ steps, onStepClick }: OnboardingStepperProps) {
  const tUi = useTranslations('onboarding');
  const tCommon = useTranslations('common');
  // Steps are done up to the active one, so the active index is all the registry stepper needs.
  const active = steps.findIndex((step) => step.state === 'active');
  const current = active === -1 ? steps.filter((step) => step.state === 'done').length : active;

  return (
    <Stepper
      className="w-full"
      completeLabel={tUi('all_steps_complete_8b3d7f1')}
      current={current}
      label={tUi('onboarding_progress_5c1e0a2')}
      labels={{
        completed: tCommon('m_1798b3ba42'),
        notStarted: tUi('not_started_2e9a4c6'),
        error: tCommon('m_7f2f6a15cf'),
        step: (number, count, label) =>
          tUi('step_of_count_label_7d4b1e3', { number, count, label }),
      }}
      onStepSelect={onStepClick ? (index) => onStepClick(steps[index].id) : undefined}
      steps={steps}
    />
  );
}
