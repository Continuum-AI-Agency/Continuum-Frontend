import type { UpsertGoalCapabilityRouteRequest } from '@continuum/contracts';
import { campaignResearchTemplate } from '@continuum/contracts';
import { Bot, CircleAlert, CircleCheck, Route, Users } from 'lucide-react';
import { Pill } from '@/components/kibo-ui/pill';
import type { GoalWorkspaceView } from '@/lib/goals/models';
import { GoalRoutingDialog } from './GoalRoutingDialog';

const label = (value: string): string =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());

export function GoalExecutionStatus({
  goal,
  onSaveCapabilityRoute,
}: {
  goal: GoalWorkspaceView;
  onSaveCapabilityRoute: (input: UpsertGoalCapabilityRouteRequest) => Promise<boolean>;
}) {
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
      aria-label="Goal execution status"
      className="grid shrink-0 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70 md:grid-cols-3"
    >
      <div className="bg-card px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Bot className="size-3.5 text-primary" />
            Jaina supervisor
          </p>
          <Pill variant={waiting > 0 ? 'warning' : 'secondary'}>
            {supervisor ? label(supervisor.portfolioStatus) : 'Preparing'}
          </Pill>
        </div>
        <p className="mt-1 text-2xs text-muted-foreground">
          {running} running · {ready} ready · {waiting} waiting
        </p>
      </div>

      <div className="bg-card px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Route className="size-3.5" />
            Dependency graph
          </p>
          <Pill variant="secondary">{goal.workNodes.length} nodes</Pill>
        </div>
        <p className="mt-1 text-2xs text-muted-foreground">
          Only satisfied branches enter the bounded execution queue.
        </p>
      </div>

      <div className="bg-card px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Users className="size-3.5" />
            Stakeholder routing
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
              Missing {missingCapabilities.map(label).join(', ')}
            </>
          ) : (
            <>
              <CircleCheck className="mt-0.5 size-3 shrink-0 text-success" />
              {isCampaignGoal
                ? 'Strategy, budget, creative ops, measurement, and compliance are routed.'
                : 'Every capability required by this Goal is routed.'}
            </>
          )}
        </p>
      </div>
    </section>
  );
}
