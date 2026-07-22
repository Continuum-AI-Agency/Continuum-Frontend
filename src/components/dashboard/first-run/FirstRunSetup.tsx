// First-run guided-setup experience (IMP-001 / IMP-003 / IMP-005 / IMP-015).
// Composes the setup checklist, the Brand Book milestone card, and the workflow
// map into the "onboarding as the default dashboard experience" surface shown
// while a selected brand is not yet fully set up. It is a pure view over a
// `DashboardSetupState`; it fetches nothing.

import { PageHeader } from '@/components/shared/PageHeader';
import { BrandBookMilestoneCard } from './BrandBookMilestoneCard';
import { FirstRunWorkflowMap } from './FirstRunWorkflowMap';
import { SetupChecklist } from './SetupChecklist';
import type { DashboardSetupState } from './setupState';

export function FirstRunSetup({
  setup,
  brandBookRefreshedAt,
}: {
  setup: DashboardSetupState;
  brandBookRefreshedAt: string | null;
}) {
  const headerDescription = setup.hasConnectedData
    ? 'A few steps left to unlock the full picture. Your live data is below.'
    : 'Connect your accounts and generate your Brand Book to bring this dashboard to life.';

  return (
    <div data-testid="dashboard-first-run" className="flex w-full min-w-0 flex-col gap-3">
      <PageHeader title="Set up your workspace" description={headerDescription} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SetupChecklist setup={setup} />
        <BrandBookMilestoneCard setup={setup} refreshedAt={brandBookRefreshedAt} />
      </div>
      <FirstRunWorkflowMap setup={setup} />
    </div>
  );
}
