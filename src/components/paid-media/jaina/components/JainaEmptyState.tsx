'use client';
import { Rocket } from 'lucide-react';

import { motion } from 'motion/react';
import React from 'react';
import { Suggestion } from '@/components/ai-elements/suggestion';
import type { Attachment } from '@/components/chat/attachments';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';

import { JainaSetupConcierge } from './JainaSetupConcierge';

const STARTER_PROMPT_CATEGORIES = [
  {
    title: 'Improve Performance',
    cards: [
      {
        label: 'Budget Optimization',
        prompt:
          'Analyze the current ad account and recommend specific budget reallocations to improve performance.',
      },
      {
        label: 'Audience Targeting',
        prompt:
          'Analyze audience performance in the current ad account and recommend specific targeting changes.',
      },
      {
        label: 'Creative Testing',
        prompt:
          'Review creative performance in the current ad account and propose the next tests, hypotheses, and success metrics.',
      },
      {
        label: 'Funnel Analysis',
        prompt:
          'Analyze the current ad account funnel, identify the largest conversion drop-offs, and recommend fixes.',
      },
      {
        label: 'Scaling Opportunities',
        prompt:
          'Find campaigns in the current ad account that can scale efficiently and recommend budgets and guardrails.',
      },
      {
        label: 'Performance Risks',
        prompt:
          'Identify the highest-priority performance risks in the current ad account and explain what to do next.',
      },
    ],
  },
  {
    title: 'Prep Client Review',
    cards: [
      {
        label: 'Weekly Recap',
        prompt:
          'Create a client-ready weekly recap for the current ad account with results, changes, and next steps.',
      },
      {
        label: 'QBR Story',
        prompt:
          'Build a QBR narrative for the current ad account that connects performance, decisions, and growth opportunities.',
      },
      {
        label: 'Wins & Highlights',
        prompt:
          'Summarize the strongest wins and proof points from the current ad account for a client review.',
      },
      {
        label: 'Goal Progress',
        prompt:
          'Assess progress toward the current ad account goals and explain what is on track, behind, and changing.',
      },
      {
        label: 'Executive Summary',
        prompt:
          'Write an executive summary of the current ad account performance, key decisions, risks, and next steps.',
      },
      {
        label: 'Talking Points',
        prompt:
          'Prepare concise client-meeting talking points for the current ad account, including likely questions and answers.',
      },
    ],
  },
  {
    title: 'Reduce Churn Risk',
    cards: [
      {
        label: 'Risk Signals',
        prompt:
          'Find churn-risk signals in the current ad account and rank them by urgency, evidence, and recommended response.',
      },
      {
        label: 'Underperformance Explainer',
        prompt:
          'Explain the current ad account underperformance in client-ready language, including causes and corrective actions.',
      },
      {
        label: 'Value Proof',
        prompt:
          'Build a concise value case for the current ad account using measurable outcomes, learning, and avoided risk.',
      },
      {
        label: 'Renewal Prep',
        prompt:
          'Prepare a renewal brief for the current ad account with delivered value, open risks, and the next-quarter plan.',
      },
      {
        label: 'Objection Handling',
        prompt:
          'Anticipate client objections about the current ad account and draft evidence-based responses to each one.',
      },
      {
        label: 'Recovery Plan',
        prompt:
          'Create a prioritized recovery plan for the current ad account with owners, milestones, and success measures.',
      },
    ],
  },
  {
    title: 'Find Growth',
    cards: [
      {
        label: 'Scale Headroom',
        prompt:
          'Estimate scale headroom in the current ad account and identify where more spend can grow efficiently.',
      },
      {
        label: 'New Channel',
        prompt:
          'Evaluate which new paid channel best complements the current ad account, with evidence and a test plan.',
      },
      {
        label: 'Untapped Audiences',
        prompt:
          'Find untapped audience opportunities for the current ad account and prioritize concrete tests.',
      },
    ],
  },
] as const;

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
          <h3 className="text-base font-semibold tracking-tight">Select an Ad Account</h3>
          <span className="text-sm text-muted-foreground">
            Choose an ad account above to start analyzing with Jaina.
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
          Paid Media Analyst
        </span>
        <h3 className="text-base tracking-tight font-semibold text-foreground">
          Ask Jaina for a decision-ready performance brief.
        </h3>
        <span className="text-sm text-muted-foreground mx-auto block max-w-2xl">
          Get clear reads on spend efficiency, creative performance, and where to move budget next.
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
