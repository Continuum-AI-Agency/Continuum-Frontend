'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { JainaPlan } from '../types';

export type PlanFeedbackPayload =
  | { type: 'approve'; planId: string }
  | { type: 'abandon'; planId: string }
  | { type: 'refine'; planId: string; edits: string };

type PlanSectionProps = {
  plan: JainaPlan;
  isStreaming: boolean;
  onPlanFeedback?: (payload: PlanFeedbackPayload) => void;
};

export function PlanSection({ plan, isStreaming, onPlanFeedback }: PlanSectionProps) {
  const uiText = useTranslations('scale');
  const [refineOpen, setRefineOpen] = React.useState(false);
  const [edits, setEdits] = React.useState('');

  if (plan.status !== 'awaiting_approval') return null;

  const handleRefineSubmit = () => {
    if (!edits.trim()) return;
    onPlanFeedback?.({ type: 'refine', planId: plan.id, edits: edits.trim() });
    setEdits('');
    setRefineOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {uiText('approve_the_plan_above_to_proceed_or_refine_i_3b70647')}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={isStreaming}
            onClick={() => setRefineOpen((o) => !o)}
          >
            {uiText('refine_1e7f34e')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={isStreaming}
            onClick={() => onPlanFeedback?.({ type: 'abandon', planId: plan.id })}
          >
            {uiText('abandon_d09252c')}
          </Button>
          <Button
            size="sm"
            disabled={isStreaming}
            onClick={() => onPlanFeedback?.({ type: 'approve', planId: plan.id })}
          >
            {uiText('approve_6007acb')}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {refineOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-1">
              <textarea
                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                rows={3}
                placeholder={uiText('describe_what_to_change_about_this_plan_876073e')}
                value={edits}
                onChange={(e) => setEdits(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRefineSubmit();
                }}
              />
              <div className="flex justify-end">
                <Button size="sm" disabled={!edits.trim()} onClick={handleRefineSubmit}>
                  {uiText('submit_refinement_f101e1e')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
