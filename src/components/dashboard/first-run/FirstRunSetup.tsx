import { useTranslations } from 'next-intl';
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
  const uiText = useTranslations('dashboard');
  const headerDescription = setup.hasConnectedData
    ? uiText('firstRunConnectedDescription')
    : uiText('firstRunDisconnectedDescription');

  return (
    <div
      data-testid="dashboard-first-run"
      className="flex w-full min-w-0 flex-col divide-y divide-border"
    >
      <div className="px-[var(--card-pad)] py-[var(--section-header-pad-block)]">
        <PageHeader
          title={uiText('set_up_your_workspace_195cbdb')}
          description={headerDescription}
        />
      </div>
      <div className="grid grid-cols-1 items-stretch divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <SetupChecklist setup={setup} />
        <BrandBookMilestoneCard setup={setup} refreshedAt={brandBookRefreshedAt} />
      </div>
      <FirstRunWorkflowMap setup={setup} />
    </div>
  );
}
