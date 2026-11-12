'use client';

import { Rocket } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import React, { useMemo } from 'react';
import { Suggestion } from '@/components/ai-elements/suggestion';
import type { Attachment } from '@/components/chat/attachments';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';

import { JainaSetupConcierge } from './JainaSetupConcierge';

type JainaEmptyStateProps = {
  adAccountId: string | null;
  brandId?: string;
  platform?: PaidMediaPlatform;
  onExampleClick?: (query: string, attachments: Attachment[]) => void;
};

export function JainaEmptyState({
  adAccountId,
  brandId,
  platform,
  onExampleClick,
}: JainaEmptyStateProps) {
  const uiText = useTranslations('scale');
  const STARTER_PROMPT_CATEGORIES = useMemo(
    () =>
      [
        {
          title: uiText('improve_performance_8777c06'),
          cards: [
            {
              label: uiText('budget_optimization_ce6090b'),
              prompt:
                'Analyze the current ad account and recommend specific budget reallocations to improve performance.',
            },
            {
              label: uiText('audience_targeting_8f9c7aa'),
              prompt:
                'Analyze audience performance in the current ad account and recommend specific targeting changes.',
            },
            {
              label: uiText('creative_testing_319dc82'),
              prompt:
                'Review creative performance in the current ad account and propose the next tests, hypotheses, and success metrics.',
            },
            {
              label: uiText('funnel_analysis_59def35'),
              prompt:
                'Analyze the current ad account funnel, identify the largest conversion drop-offs, and recommend fixes.',
            },
            {
              label: uiText('scaling_opportunities_29105a5'),
              prompt:
                'Find campaigns in the current ad account that can scale efficiently and recommend budgets and guardrails.',
            },
            {
              label: uiText('performance_risks_153dedc'),
              prompt:
                'Identify the highest-priority performance risks in the current ad account and explain what to do next.',
            },
          ],
        },
        {
          title: uiText('prep_client_review_5e8b578'),
          cards: [
            {
              label: uiText('weekly_recap_f3a817c'),
              prompt:
                'Create a client-ready weekly recap for the current ad account with results, changes, and next steps.',
            },
            {
              label: uiText('qbr_story_40c80c2'),
              prompt:
                'Build a QBR narrative for the current ad account that connects performance, decisions, and growth opportunities.',
            },
            {
              label: uiText('wins_highlights_2f896e3'),
              prompt:
                'Summarize the strongest wins and proof points from the current ad account for a client review.',
            },
            {
              label: uiText('goal_progress_bbc889b'),
              prompt:
                'Assess progress toward the current ad account goals and explain what is on track, behind, and changing.',
            },
            {
              label: uiText('executive_summary_53d548a'),
              prompt:
                'Write an executive summary of the current ad account performance, key decisions, risks, and next steps.',
            },
            {
              label: uiText('talking_points_335ccc4'),
              prompt:
                'Prepare concise client-meeting talking points for the current ad account, including likely questions and answers.',
            },
          ],
        },
        {
          title: uiText('reduce_churn_risk_427781b'),
          cards: [
            {
              label: uiText('risk_signals_629c990'),
              prompt:
                'Find churn-risk signals in the current ad account and rank them by urgency, evidence, and recommended response.',
            },
            {
              label: uiText('underperformance_explainer_9ce2f47'),
              prompt:
                'Explain the current ad account underperformance in client-ready language, including causes and corrective actions.',
            },
            {
              label: uiText('value_proof_b97eaaf'),
              prompt:
                'Build a concise value case for the current ad account using measurable outcomes, learning, and avoided risk.',
            },
            {
              label: uiText('renewal_prep_ddb858a'),
              prompt:
                'Prepare a renewal brief for the current ad account with delivered value, open risks, and the next-quarter plan.',
            },
            {
              label: uiText('objection_handling_f551761'),
              prompt:
                'Anticipate client objections about the current ad account and draft evidence-based responses to each one.',
            },
            {
              label: uiText('recovery_plan_5db81b0'),
              prompt:
                'Create a prioritized recovery plan for the current ad account with owners, milestones, and success measures.',
            },
          ],
        },
        {
          title: uiText('find_growth_18f2964'),
          cards: [
            {
              label: uiText('scale_headroom_4be2714'),
              prompt:
                'Estimate scale headroom in the current ad account and identify where more spend can grow efficiently.',
            },
            {
              label: uiText('new_channel_2ef6cb1'),
              prompt:
                'Evaluate which new paid channel best complements the current ad account, with evidence and a test plan.',
            },
            {
              label: uiText('untapped_audiences_3bb046a'),
              prompt:
                'Find untapped audience opportunities for the current ad account and prioritize concrete tests.',
            },
          ],
        },
      ] as const,
    [uiText],
  );

  if (!adAccountId) {
    // Guided activation (FEAT-004) when we know the brand; otherwise fall back
    // to the plain prompt so the empty state never hard-blocks on missing wiring.
    if (brandId) {
      return <JainaSetupConcierge brandId={brandId} platform={platform} />;
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Rocket className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <h3 className="text-base font-semibold tracking-tight">
            {uiText('select_an_ad_account_07cf439')}
          </h3>
          <span className="text-sm text-muted-foreground">
            {uiText('choose_an_ad_account_above_to_start_analyzing_01a72fd')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mt-12 items-center justify-center text-center">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="mb-1"
        aria-hidden="true"
      >
        <Rocket className="h-6 w-6 text-muted-foreground" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.08, duration: 0.3 }}
        className="space-y-3 px-4"
      >
        <span className="text-xs inline-flex rounded-full border border-border/70 bg-card/70 px-3 py-1 uppercase tracking-wide text-muted-foreground">
          {uiText('paid_media_analyst_c44a1f1')}
        </span>
        <h3 className="text-base tracking-tight font-semibold text-foreground">
          {uiText('ask_jaina_for_a_decision_ready_performance_br_2199f08')}
        </h3>
        <span className="text-sm text-muted-foreground mx-auto block max-w-2xl">
          {uiText('get_clear_reads_on_spend_efficiency_creative__90757e3')}
        </span>
      </motion.div>

      <div className="mt-6 grid w-full max-w-6xl grid-cols-1 gap-5 px-4 text-left sm:grid-cols-2 xl:grid-cols-4">
        {STARTER_PROMPT_CATEGORIES.map((category, categoryIndex) => (
          <section key={category.title} className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">{category.title}</h4>
            <div className="flex flex-col gap-2">
              {category.cards.map((card, cardIndex) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.14 + (categoryIndex * 6 + cardIndex) * 0.02,
                    duration: 0.24,
                  }}
                >
                  <Suggestion
                    suggestion={card.prompt}
                    onClick={(query) => onExampleClick?.(query, [])}
                    className="h-auto w-full justify-start whitespace-normal rounded-lg border-border/70 bg-card/70 px-3 py-2 text-left text-foreground hover:border-primary/40 hover:bg-card"
                  >
                    {card.label}
                  </Suggestion>
                </motion.div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
