'use client';

// The expanded setup tile: what the Home learned from onboarding, then the first-run setup itself
// (the checklist, the Brand Book milestone and the workflow map), unchanged.
import type { HomeBrandReading } from '@continuum/contracts';
import { FirstRunSetup } from '@/components/dashboard/first-run/FirstRunSetup';
import type { DashboardSetupState } from '@/components/dashboard/first-run/setupState';
import { GoalLearned } from './GoalLearned';

export default function SetupModule({
  setup,
  brandBookRefreshedAt,
  goal,
}: {
  setup: DashboardSetupState;
  brandBookRefreshedAt: string | null;
  goal: HomeBrandReading['goal'];
}) {
  return (
    <div className="space-y-4" data-testid="home-setup-module">
      <GoalLearned className="rounded-lg border bg-muted/30 px-3 py-2" goal={goal} />
      <FirstRunSetup brandBookRefreshedAt={brandBookRefreshedAt} setup={setup} />
    </div>
  );
}
