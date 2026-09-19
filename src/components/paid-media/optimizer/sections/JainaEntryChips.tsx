'use client';

// "Ask Jaina about this portfolio": five chips, each a prepared question. No commands to
// learn; the capability is discovered where it applies.

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
    <div className="flex flex-wrap items-center gap-1.5" data-testid="jaina-entry-chips">
      <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground uppercase tracking-wide">
        <SparklesIcon aria-hidden className="size-3" /> Ask Jaina
      </span>
      {jainaEntryPrompts(portfolio).map((entry) => (
        <a
          className="rounded-full border border-border/70 bg-background px-2.5 py-0.5 text-2xs text-foreground transition-colors hover:border-primary/60 hover:text-primary"
          href={jainaPromptHref(entry.prompt)}
          key={entry.key}
        >
          {entry.label}
        </a>
      ))}
    </div>
  );
}
