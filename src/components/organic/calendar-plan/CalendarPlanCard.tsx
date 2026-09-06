'use client';

import type { CalendarPlanDecision } from '@continuum/contracts';
import { BulkPlanCard } from '../agent/BulkPlanCard';
import { BulkRunPanel } from '../agent/BulkRunPanel';
import type { CalendarPlanState } from './useCalendarPlan';

type Props = {
  state: CalendarPlanState;
  brandId: string;
  onDecide: (decision: CalendarPlanDecision) => void;
};

/** The proposed plan under the calendar toolbar, and the run panel once it is approved. */
export function CalendarPlanCard({ state, brandId, onDecide }: Props) {
  if (state.phase !== 'proposed' && state.phase !== 'approved') return null;
  return (
    <div data-testid="calendar-plan-card" className="mt-2">
      <BulkPlanCard
        key={state.plan.planId}
        plan={state.plan}
        onApproveAction={() => onDecide('approve')}
        onRejectAction={() => onDecide('reject')}
      />
      {state.phase === 'approved' ? (
        <BulkRunPanel runId={state.runId} total={state.plan.placements.length} brandId={brandId} />
      ) : null}
    </div>
  );
}
