import type { UpsertGoalCapabilityRouteRequest } from '@continuum/contracts';
import { campaignResearchTemplate } from '@continuum/contracts';
import { Bot, CircleAlert, CircleCheck, Route, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Pill } from '@/components/kibo-ui/pill';
import type { GoalWorkspaceView } from '@/lib/goals/models';
import { GoalRoutingDialog } from './GoalRoutingDialog';
import { goalControlLabel } from './goalControlLabels';

export function GoalExecutionStatus({
  goal,
  onSaveCapabilityRoute,
}: {
  goal: GoalWorkspaceView;
  onSaveCapabilityRoute: (input: UpsertGoalCapabilityRouteRequest) => Promise<boolean>;
}) {
  const uiText = useTranslations('dashboard');
  const supervisor = goal.supervisor;
  const isCampaignGoal = goal.kind === 'campaign' || goal.kind === campaignResearchTemplate.id;
  const requiredCapabilities = isCampaignGoal
    ? campaignResearchTemplate.readiness.requiredCapabilities
    : [
        ...new Set(
          goal.workNodes.flatMap((node) =>
            node.requiredCapability ? [node.requiredCapability] : [],
          ),
        ),
      ];
  const routedCapabilities = new Set(goal.capabilityRoutes.map((route) => route.capability));
  const missingCapabilities = requiredCapabilities.filter(
    (capability) => !routedCapabilities.has(capability),
  );
  const waiting = supervisor?.waitingNodeIds.length ?? 0;
  const running = supervisor?.runningNodeIds.length ?? 0;
  const ready = supervisor?.readyNodeIds.length ?? 0;

  return (
    <section
      aria-label={uiText('goal_execution_status_8c643ab')}
      className="grid shrink-0 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70 md:grid-cols-3"
    >
      <div className="bg-card px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Bot className="size-3.5 text-primary" />
            {uiText('m_6abb8d3c7b')}
          </p>
          <Pill variant={waiting > 0 ? 'warning' : 'secondary'}>
            {supervisor
              ? goalControlLabel(supervisor.portfolioStatus, uiText)
              : uiText('preparing_cf1aa6c')}
          </Pill>
        </div>
        <p className="mt-1 text-2xs text-muted-foreground">
          {uiText.rich('sentence_1347b7bb26ff', {
            v0: () => running,
            v1: () => ready,
            v2: () => waiting,
          })}
        </p>
      </div>

      <div className="bg-card px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Route className="size-3.5" />
            {uiText('m_bc674d2eea')}
          </p>
          <Pill variant="secondary">
            {uiText.rich('sentence_86e747d652a4', { count: goal.workNodes.length })}
          </Pill>
        </div>
        <p className="mt-1 text-2xs text-muted-foreground">
          {uiText('only_satisfied_branches_enter_the_bounded_exe_266dcbb')}
        </p>
      </div>

      <div className="bg-card px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Users className="size-3.5" />
            {uiText('m_e957a7bea1')}
          </p>
          <div className="flex items-center gap-1">
            <Pill variant={missingCapabilities.length > 0 ? 'warning' : 'success'}>
              {routedCapabilities.size}/{requiredCapabilities.length}
            </Pill>
            <GoalRoutingDialog
              goal={goal}
              requiredCapabilities={requiredCapabilities}
              onSave={onSaveCapabilityRoute}
            />
          </div>
        </div>
        <p className="mt-1 flex items-start gap-1 text-2xs text-muted-foreground">
          {missingCapabilities.length > 0 ? (
            <>
              <CircleAlert className="mt-0.5 size-3 shrink-0 text-warning" />
              {uiText('m_aad0a108ff', {
                capabilities: missingCapabilities
                  .map((capability) => goalControlLabel(capability, uiText))
                  .join(', '),
              })}
            </>
          ) : (
            <>
              <CircleCheck className="mt-0.5 size-3 shrink-0 text-success" />
              {isCampaignGoal
                ? uiText('strategy_budget_creative_ops_measurement_and__3d7364f')
                : uiText('every_capability_required_by_this_goal_is_rou_f9d5a90')}
            </>
          )}
        </p>
      </div>
    </section>
  );
}
