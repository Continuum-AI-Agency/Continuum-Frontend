'use client';
import { ChartLineUp, Presentation, ShieldWarning, TrendUp } from '@phosphor-icons/react';
import { Rocket } from 'lucide-react';

import { motion } from 'motion/react';
import React from 'react';
import type { Attachment } from '@/components/chat/attachments';
import { PromptSuggestions } from '@/components/ui/prompt-suggestions';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';

import { JainaSetupConcierge } from './JainaSetupConcierge';

const STARTER_PROMPT_CATEGORIES = [
  {
    title: 'Improve Performance',
    icon: ChartLineUp,
    cards: [
      {
        label: 'Budget Optimization',
        hint: 'Move spend to what converts',
        prompt:
          'Analyze the current ad account and recommend specific budget reallocations to improve performance.',
      },
      {
        label: 'Creative Testing',
        hint: 'Plan the next creative tests',
        prompt:
          'Review creative performance in the current ad account and propose the next tests, hypotheses, and success metrics.',
      },
    ],
  },
  {
    title: 'Prep Client Review',
    icon: Presentation,
    cards: [
      {
        label: 'Weekly Recap',
        hint: 'Client-ready week in review',
        prompt:
          'Create a client-ready weekly recap for the current ad account with results, changes, and next steps.',
      },
      {
        label: 'Executive Summary',
        hint: 'Results, risks and next steps',
        prompt:
          'Write an executive summary of the current ad account performance, key decisions, risks, and next steps.',
      },
    ],
  },
  {
    title: 'Reduce Churn Risk',
    icon: ShieldWarning,
    cards: [
      {
        label: 'Risk Signals',
        hint: 'Churn signals by urgency',
        prompt:
          'Find churn-risk signals in the current ad account and rank them by urgency, evidence, and recommended response.',
      },
      {
        label: 'Recovery Plan',
        hint: 'Owners, milestones, measures',
        prompt:
          'Create a prioritized recovery plan for the current ad account with owners, milestones, and success measures.',
      },
    ],
  },
  {
    title: 'Find Growth',
    icon: TrendUp,
    cards: [
      {
        label: 'Scale Headroom',
        hint: 'Where more spend still pays',
        prompt:
          'Estimate scale headroom in the current ad account and identify where more spend can grow efficiently.',
      },
      {
        label: 'Untapped Audiences',
        hint: 'New audiences worth testing',
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
        {STARTER_PROMPT_CATEGORIES.map((category) => (
          <section key={category.title} className="space-y-2">
            <h4 className="px-1 text-sm font-semibold text-foreground">{category.title}</h4>
            <PromptSuggestions
              className="max-w-none"
              data={category.cards.map((card) => ({
                id: card.label,
                title: card.label,
                hint: card.hint,
                prompt: card.prompt,
                icon: category.icon,
              }))}
              onSelect={(_, prompt) => onExampleClick?.(prompt, [])}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
