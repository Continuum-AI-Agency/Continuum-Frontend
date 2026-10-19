'use client';

import type { CalendarPlanDecision } from '@continuum/contracts';
import dynamic from 'next/dynamic';
import { BulkPlanCard } from '../agent/BulkPlanCard';
import type { CalendarPlanState } from './useCalendarPlan';

// Renders only after a plan is approved; keeps the batch cards off /organic's first load.
const BulkRunPanel = dynamic(() => import('../agent/BulkRunPanel').then((m) => m.BulkRunPanel), {
  ssr: false,
});

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
