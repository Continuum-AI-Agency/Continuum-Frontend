'use client';

import {
  assertNeverOrganicRunEvent,
  derivePlacementProgressPercent,
  type OrganicCalendarBatchGenerateStreamEvent,
  type OrganicCalendarPlacement,
  type OrganicGenerationRunEvent,
  organicCalendarBatchGenerateStreamEventSchema,
  organicGenerationRunEventEnvelopeSchema,
} from '@continuum/contracts';
import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import type { OrganicContentPlan, OrganicContentPlanPlacement } from '@/lib/organic/chat.types';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { useCalendarStore } from '@/lib/organic/store';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type UseOrganicContentPlanOptions = {
  brandId: string;
  weekStart: string;
  brandProfileId?: string;
  activePlatforms?: OrganicPlatformKey[];
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>;
};

type UseOrganicContentPlanResult = {
  activePlan: OrganicContentPlan | null;
  isApproving: boolean;
  approvePlan: (planId: string) => Promise<void>;
  cancelPlan: () => void;
};

function placementToDraft(
  placement: OrganicContentPlanPlacement,
  planId: string,
  platformAccountIds: Partial<Record<OrganicPlatformKey, string>>,
): OrganicCalendarDraft {
  const platform = placement.platform as OrganicPlatformKey;
  const targetAccountId = placement.account_id ?? platformAccountIds[platform];

  const draftId = `plan-${planId}-${placement.day}-${placement.platform}-${Date.now()}`;

  return {
    id: draftId,
    title: placement.concept ?? 'Content idea',
    summary: '',
    timeLabel: placement.time,
    dateLabel: placement.day,
    status: 'placeholder',
    platforms: [platform],
    format: placement.post_type ?? 'Post',
    objective: 'Draft',
    creativeIdea: placement.concept ?? '',
    captionPreview: '',
    tags: [],
    mediaCount: 1,
    seedTrendId: placement.trend_id,
    targetAccountId,
  };
}

type RunEventHandlers = {
  setGridProgress: (p: {
    percent: number;
    stage?: string;
    message?: string;
    completed?: number;
    total?: number;
  }) => void;
  setGridStatus: (s: 'running' | 'complete' | 'complete_with_errors' | 'error' | 'idle') => void;
  setGridError: (e: string | null) => void;
  setPlacementProgress: (
    placementId: string,
    progress: {
      percent: number;
      stage?: string;
      agentName?: string;
      message?: string;
    },
  ) => void;
  updateDraft: (
    draftId: string,
    updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
  ) => void;
  total: number;
  completed: number;
};

type RunEventOutcome = {
  completed: number;
  terminal: boolean;
  fatal: boolean;
};

function placementPatch(placement: OrganicCalendarPlacement): Partial<OrganicCalendarDraft> {
  const content = placement.content;
  const creative = placement.creative;
  const copy = placement.copy;
  return {
    status: 'draft',
    title: content?.titleTopic ?? undefined,
    format: content?.format ?? undefined,
    creativeIdea: creative?.creativeIdea ?? undefined,
    captionPreview: copy?.caption ?? undefined,
  };
}

function handleRunEvent(event: OrganicGenerationRunEvent, ctx: RunEventHandlers): RunEventOutcome {
  let { completed } = ctx;
  let terminal = false;
  let fatal = false;

  switch (event.type) {
    case 'run_started':
    case 'run_plan':
    case 'run_warning':
      break;
    case 'run_progress': {
      ctx.setGridProgress({
        percent: event.total > 0 ? Math.round((event.completed / event.total) * 100) : 0,
        stage: event.stage,
        message: event.message,
        completed: event.completed,
        total: event.total,
      });
      break;
    }
    case 'slot_started': {
      ctx.updateDraft(event.placementId, (d) => ({
        ...d,
        status: 'streaming' as const,
      }));
      ctx.setPlacementProgress(event.placementId, {
        percent: derivePlacementProgressPercent({ stage: 'queued' }),
        message: event.message,
      });
      break;
    }
    case 'slot_stage': {
      ctx.setPlacementProgress(event.placementId, {
        percent: derivePlacementProgressPercent({
          agentName: event.agentName,
          stage: event.stage,
        }),
        stage: event.stage,
        agentName: event.agentName,
        message: event.message,
      });
      break;
    }
    case 'slot_text_ready': {
      // Phase-1 checkpoint: the placement's text (caption/concept/hashtags) is
      // ready before media realization. Surface it on the existing placeholder
      // card immediately without counting it toward completion (the terminal
      // slot_completed carries the full populated draft).
      const placementId = event.placement.placementId;
      ctx.updateDraft(placementId, (d) => ({ ...d, ...placementPatch(event.placement) }));
      break;
    }
    case 'slot_completed': {
      completed += 1;
      const placementId = event.placement.placementId;
      ctx.updateDraft(placementId, (d) => ({ ...d, ...placementPatch(event.placement) }));
      ctx.setPlacementProgress(placementId, { percent: 100, stage: 'merging' });
      ctx.setGridProgress({
        percent: ctx.total > 0 ? Math.round((completed / ctx.total) * 100) : 0,
        completed,
        total: ctx.total,
      });
      break;
    }
    case 'slot_failed': {
      ctx.updateDraft(event.placementId, (d) => ({
        ...d,
        status: 'failed' as const,
        generationError: event.message,
      }));
      break;
    }
    case 'run_completed': {
      const summary = event.summary;
      if (summary && summary.failed > 0 && summary.succeeded > 0) {
        ctx.setGridStatus('complete_with_errors');
      } else if (summary && summary.failed > 0 && summary.succeeded === 0) {
        ctx.setGridStatus('error');
      } else {
        ctx.setGridStatus('complete');
      }
      terminal = true;
      break;
    }
    case 'run_failed': {
      ctx.setGridStatus('error');
      ctx.setGridError(event.message);
      terminal = true;
      fatal = true;
      break;
    }
    default: {
      assertNeverOrganicRunEvent(event);
    }
  }

  return { completed, terminal, fatal };
}

function adaptLegacyEvent(
  event: OrganicCalendarBatchGenerateStreamEvent,
): OrganicGenerationRunEvent | null {
  switch (event.type) {
    case 'progress':
      return {
        type: 'run_progress',
        completed: event.completed,
        total: event.total,
        stage: event.stage,
        message: event.message,
      };
    case 'slot_started':
      return {
        type: 'slot_started',
        placementId: event.placementId,
        message: event.message,
      };
    case 'slot_stage':
      return {
        type: 'slot_stage',
        placementId: event.placementId,
        stage: event.stage,
        agentName: event.agentName,
        message: event.message,
      };
    case 'slot_heartbeat':
      return null;
    case 'slot_text_ready':
      return { type: 'slot_text_ready', placement: event.placement };
    case 'slot_completed':
    case 'placement':
      return { type: 'slot_completed', placement: event.placement };
    case 'slot_failed':
      return {
        type: 'slot_failed',
        placementId: event.placementId,
        code: event.code,
        message: event.message,
        retryable: event.retryable,
        attempts: event.attempts,
      };
    case 'error':
      return {
        type: 'run_warning',
        code: event.code,
        message: event.message,
        placementId: event.placementId,
      };
    case 'complete':
      return { type: 'run_completed', summary: event.summary };
    default:
      return null;
  }
}

export function useOrganicContentPlan({
  brandId,
  weekStart,
  brandProfileId,
  platformAccountIds = {},
}: UseOrganicContentPlanOptions): UseOrganicContentPlanResult {
  const [activePlan, setActivePlan] = React.useState<OrganicContentPlan | null>(null);
  const [isApproving, setIsApproving] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const {
    setGridStatus,
    setGridProgress,
    setGridError,
    setGridJobId,
    setPlacementProgress,
    clearPlacementProgress,
    addDraft,
    updateDraft,
    days,
  } = useCalendarStore(
    React.useCallback(
      (s) => ({
        setGridStatus: s.setGridStatus,
        setGridProgress: s.setGridProgress,
        setGridError: s.setGridError,
        setGridJobId: s.setGridJobId,
        setPlacementProgress: s.setPlacementProgress,
        clearPlacementProgress: s.clearPlacementProgress,
        addDraft: s.addDraft,
        updateDraft: s.updateDraft,
        days: s.days,
      }),
      [],
    ),
  );

  // Subscribe to proposed/active plans for this brand+week
  React.useEffect(() => {
    if (!brandId || !weekStart) return;

    const supabase = createSupabaseBrowserClient();

    const load = async () => {
      const { data } = await supabase
        .schema('organic' as never)
        .from('organic_content_plans')
        .select('*')
        .eq('brand_id', brandId)
        .eq('week_start', weekStart)
        .in('status', ['proposed', 'approved', 'generating'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) setActivePlan(data as OrganicContentPlan);
    };

    void load();

    // Realtime subscription for plan status changes
    const channel = supabase
      .channel(`organic-content-plans-${brandId}-${weekStart}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'organic',
          table: 'organic_content_plans',
          filter: `brand_id=eq.${brandId}`,
        },
        (payload) => {
          const plan = payload.new as OrganicContentPlan;
          if (plan.week_start !== weekStart) return;

          setActivePlan((current) => {
            // Only track proposed/generating; clear on terminal states
            if (
              plan.status === 'proposed' ||
              plan.status === 'approved' ||
              plan.status === 'generating'
            ) {
              return plan;
            }
            if (plan.status === 'completed') {
              setGridStatus('complete');
              setGridJobId(null);
              return null;
            }
            if (plan.status === 'failed') {
              setGridStatus('error');
              setGridError('Content plan generation failed.');
              setGridJobId(null);
              return null;
            }
            if (plan.status === 'cancelled') {
              setGridStatus('idle');
              setGridJobId(null);
              return current?.id === plan.id ? null : current;
            }
            return current;
          });

          if (plan.status === 'generating') {
            setGridStatus('running');
            setGridJobId(plan.id);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [brandId, weekStart, setGridStatus, setGridProgress, setGridError, setGridJobId]);

  const approvePlan = React.useCallback(
    async (planId: string) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setIsApproving(true);
      setGridStatus('running');
      setGridProgress({ percent: 0, stage: 'starting', message: 'Preparing content plan…' });

      try {
        // Seed placeholder drafts from the plan's placements so the calendar
        // has slots to fill in as streaming events arrive
        const plan = activePlan;
        if (plan) {
          const dayIds = new Set(days.map((d) => d.id));
          for (const placement of plan.placements) {
            if (!dayIds.has(placement.day)) continue;
            const draft = placementToDraft(
              placement,
              planId,
              platformAccountIds as Partial<Record<OrganicPlatformKey, string>>,
            );
            addDraft(placement.day, draft);
          }
        }

        // Start the run — backend uses plan_id to look up placements
        const response = await fetch('/api/organic/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_id: planId,
            input: {
              brandProfileId,
              week_start: weekStart,
            },
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Run start failed: ${response.status}`);
        }

        setGridJobId(planId);
        clearPlacementProgress();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        let buffer = '';
        let completed = 0;
        let streamSawTerminal = false;
        const total = plan?.placements.length ?? 0;

        while (!done) {
          const chunk = await reader.read();
          done = chunk.done;
          if (chunk.value) {
            buffer += decoder.decode(chunk.value, { stream: !done });
          }

          const lines = buffer.split('\n');
          buffer = done ? '' : (lines.pop() ?? '');

          for (const line of lines) {
            if (!line.trim()) continue;

            let parsed: unknown;
            try {
              parsed = JSON.parse(line);
            } catch {
              continue;
            }

            const envelopeResult = organicGenerationRunEventEnvelopeSchema.safeParse(parsed);
            let event: OrganicGenerationRunEvent | null = null;
            if (envelopeResult.success) {
              event = envelopeResult.data.event;
            } else {
              const bareResult = organicCalendarBatchGenerateStreamEventSchema.safeParse(parsed);
              if (!bareResult.success) {
                console.warn(
                  '[organic] unrecognized stream event',
                  envelopeResult.error.issues.slice(0, 2),
                );
                continue;
              }
              event = adaptLegacyEvent(bareResult.data);
              if (!event) continue;
            }

            const outcome = handleRunEvent(event, {
              setGridProgress,
              setGridStatus,
              setGridError,
              setPlacementProgress,
              updateDraft,
              total,
              completed,
            });
            completed = outcome.completed;
            if (outcome.terminal) {
              streamSawTerminal = true;
            }
            if (outcome.fatal) {
              done = true;
              break;
            }
          }
        }

        if (!streamSawTerminal) {
          setGridStatus('complete');
        }
        setGridJobId(null);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setGridStatus('error');
        setGridError(error instanceof Error ? error.message : 'Failed to run content plan');
      } finally {
        setIsApproving(false);
      }
    },
    [
      activePlan,
      addDraft,
      brandProfileId,
      clearPlacementProgress,
      days,
      platformAccountIds,
      setGridError,
      setGridJobId,
      setGridProgress,
      setGridStatus,
      setPlacementProgress,
      updateDraft,
      weekStart,
    ],
  );

  const cancelPlan = React.useCallback(() => {
    abortRef.current?.abort();
    setIsApproving(false);
    setGridStatus('idle');
    setGridJobId(null);
    setActivePlan(null);
  }, [setGridStatus, setGridJobId]);

  return { activePlan, isApproving, approvePlan, cancelPlan };
}
