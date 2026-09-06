'use client';

import {
  type BulkContentPlan,
  type CalendarPlanDecision,
  type CalendarPlanDecisionResponse,
  type CalendarPlanProposeRequest,
  calendarPlanDecisionResponseSchema,
  calendarPlanProposeResponseSchema,
} from '@continuum/contracts';
import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { http } from '@/lib/api/http';

export type CalendarPlanState =
  | { phase: 'idle' }
  | { phase: 'proposing' }
  | { phase: 'proposed'; plan: BulkContentPlan }
  | { phase: 'approved'; plan: BulkContentPlan; runId: string };

/**
 * The calendar's plan → human approval → generate flow. Propose enqueues nothing;
 * only an approve mints the run BulkRunPanel then follows.
 */
export function useCalendarPlan() {
  const [state, setState] = useState<CalendarPlanState>({ phase: 'idle' });
  const { show } = useToast();

  const fail = useCallback(
    (title: string, error: unknown) => {
      setState({ phase: 'idle' });
      show({
        title,
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      });
    },
    [show],
  );

  const propose = useCallback(
    async (request: CalendarPlanProposeRequest) => {
      setState({ phase: 'proposing' });
      try {
        const plan = await http.request<BulkContentPlan>({
          path: '/api/organic/agent/plans/from-placements',
          method: 'POST',
          body: request,
          schema: calendarPlanProposeResponseSchema,
        });
        setState({ phase: 'proposed', plan });
      } catch (error) {
        fail('Could not propose a plan', error);
      }
    },
    [fail],
  );

  const decide = useCallback(
    async (decision: CalendarPlanDecision) => {
      if (state.phase !== 'proposed') return;
      const { plan } = state;
      try {
        const result = await http.request<CalendarPlanDecisionResponse>({
          path: `/api/organic/agent/plans/${plan.planId}/${decision}`,
          method: 'POST',
          body: { decision },
          schema: calendarPlanDecisionResponseSchema,
        });
        if (decision === 'reject') {
          setState({ phase: 'idle' });
          return;
        }
        if (!result.runId) throw new Error('Approval did not start a generation run.');
        setState({ phase: 'approved', plan, runId: result.runId });
      } catch (error) {
        fail(
          decision === 'approve' ? 'Could not approve the plan' : 'Could not reject the plan',
          error,
        );
      }
    },
    [state, fail],
  );

  return { state, propose, decide };
}
