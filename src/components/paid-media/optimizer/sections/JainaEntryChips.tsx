'use client';

// "Preguntale a Jaina": a primary-accented band with a label naming the capability and a row
// of ghost buttons each carrying a prepared question. No commands to learn; the capability is
// discovered where it applies. Two callers: a portfolio page hands the portfolio and gets the
// five portfolio analyses; the account Overview hands its own label and entries. A caller may
// also put something ABOVE the questions inside the band — the portfolio page puts Jaina's
// latest read and a field to ask her something else (portafolio.html, idea 14).
// Colours come from theme tokens only.

import type { PortfolioListItem } from '@continuum/contracts';
import { SparklesIcon } from 'lucide-react';
import type * as React from 'react';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { type JainaEntry, jainaEntryPrompts } from './jainaEntryModel';

export type JainaEntryChipsProps = (
  | { portfolio: Pick<PortfolioListItem, 'name' | 'objective' | 'id'> }
  | { label: string; entries: JainaEntry[] }
) & {
  /** Rendered inside the band, above the questions. */
  children?: React.ReactNode;
};

export function JainaEntryChips(props: JainaEntryChipsProps) {
  const label = 'portfolio' in props ? 'Preguntale a Jaina' : props.label;
  const entries = 'portfolio' in props ? jainaEntryPrompts(props.portfolio) : props.entries;
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2"
      data-testid="jaina-entry-chips"
    >
      {props.children}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-primary text-sm">
          <SparklesIcon aria-hidden className="size-3.5" /> {label}
        </span>
        {entries.map((entry) => (
          <a
            className="rounded-full border border-primary/40 bg-background px-3 py-1 text-foreground text-sm transition-colors hover:border-primary hover:text-primary"
            href={jainaPromptHref(entry.prompt)}
            key={entry.key}
          >
            {entry.label}
          </a>
        ))}
      </div>
    </div>
  );
}
