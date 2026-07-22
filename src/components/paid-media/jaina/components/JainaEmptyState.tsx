'use client';

import { RocketIcon } from '@radix-ui/react-icons';
import { motion } from 'motion/react';
import React from 'react';
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
  const prompts = [
    'Give me a 7-day campaign health brief with risks and opportunities.',
    'Which creatives are winning on ROAS and which should be paused?',
    'Recommend budget reallocations for this week by campaign.',
  ];

  if (!adAccountId) {
    // Guided activation (FEAT-004) when we know the brand; otherwise fall back
    // to the plain prompt so the empty state never hard-blocks on missing wiring.
    if (brandId) {
      return <JainaSetupConcierge brandId={brandId} platform={platform} />;
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <RocketIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
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
        <RocketIcon className="h-6 w-6 text-muted-foreground" />
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

      <div className="mt-6 w-full max-w-3xl px-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {prompts.map((prompt, index) => (
            <motion.div
              key={prompt}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 + index * 0.06, duration: 0.24 }}
            >
              <Suggestion
                suggestion={prompt}
                onClick={(q) => onExampleClick?.(q, [])}
                className="h-auto max-w-[min(100%,30rem)] whitespace-normal rounded-full border-border/70 bg-card/70 px-5 py-2 text-left text-foreground hover:border-primary/40 hover:bg-card"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
