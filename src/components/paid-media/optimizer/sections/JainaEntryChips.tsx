'use client';

// "Ask Jaina about this portfolio": a primary-accented band that sits between the portfolio's
// vital signs and the day's news. A label names the capability and five ghost buttons each
// carry a prepared question. No commands to learn; the capability is discovered where it
// applies. Colours come from theme tokens only.

import type { PortfolioListItem } from '@continuum/contracts';
import { SparklesIcon } from 'lucide-react';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { jainaEntryPrompts } from './jainaEntryModel';

export function JainaEntryChips({
  portfolio,
}: {
  portfolio: Pick<PortfolioListItem, 'name' | 'objective' | 'id'>;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2"
      data-testid="jaina-entry-chips"
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
        <SparklesIcon aria-hidden className="size-3.5" /> Ask Jaina about this portfolio
      </span>
      {jainaEntryPrompts(portfolio).map((entry) => (
        <a
          className="rounded-full border border-primary/40 bg-background px-3 py-1 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
          href={jainaPromptHref(entry.prompt)}
          key={entry.key}
        >
          {entry.label}
        </a>
      ))}
    </div>
  );
}
