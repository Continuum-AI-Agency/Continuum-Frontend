'use client';

// "Ask Jaina": a primary-accented band with a label naming the capability and a row
// of ghost buttons each carrying a prepared question. No commands to learn; the capability is
// discovered where it applies. Two callers: a portfolio page hands the portfolio and gets the
// five portfolio analyses; the account Overview hands its own label and entries. A caller may
// also put something ABOVE the questions inside the band — the portfolio page puts Jaina's
// latest read and a field to ask her something else (portafolio.html, idea 14).
// The portfolio module (idea D) draws the band itself, as the bar at its foot: it asks for
// `frame={false}` and `layout="row"`, and the label, its field and the questions share one
// wrapping row. Colours come from theme tokens only.

import type { PlatformId, PortfolioListItem } from '@continuum/contracts';
import { SparklesIcon } from 'lucide-react';
import type * as React from 'react';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { cn } from '@/lib/utils';
import { type JainaEntry, jainaEntryPrompts } from './jainaEntryModel';

export type JainaEntryChipsProps = (
  | { portfolio: Pick<PortfolioListItem, 'name' | 'objective' | 'id'> }
  | { label: string; entries: JainaEntry[] }
) & {
  /** Rendered inside the band: above the questions, or beside the label in a row. */
  children?: React.ReactNode;
  /** `stack` puts the caller's content above the label and questions; `row` puts label,
   *  content and questions in one wrapping row. */
  layout?: 'stack' | 'row';
  /** False when the caller already draws the band's surface. */
  frame?: boolean;
  /** The platform the questions are about; every link carries it into Jaina. */
  platform?: PlatformId | null;
};

export function JainaEntryChips(props: JainaEntryChipsProps) {
  const label = 'portfolio' in props ? 'Ask Jaina' : props.label;
  const entries = 'portfolio' in props ? jainaEntryPrompts(props.portfolio) : props.entries;
  const { layout = 'stack', frame = true, platform = null } = props;
  const title = (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-primary text-sm">
      <SparklesIcon aria-hidden className="size-3.5" /> {label}
    </span>
  );
  const questions = entries.map((entry) => (
    <a
      className="rounded-full border border-primary/40 bg-background px-3 py-1 text-foreground text-sm transition-colors hover:border-primary hover:text-primary"
      href={jainaPromptHref(entry.prompt, platform, { newConversation: true })}
      key={entry.key}
    >
      {entry.label}
    </a>
  ));
  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        frame && 'rounded-lg border border-primary bg-primary/10 px-3 py-2',
      )}
      data-layout={layout}
      data-platform={platform ?? undefined}
      data-testid="jaina-entry-chips"
    >
      {layout === 'row' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {title}
            {props.children}
          </div>
          <div className="flex flex-wrap items-center gap-2">{questions}</div>
        </>
      ) : (
        <>
          {props.children}
          <div className="flex flex-wrap items-center gap-2">
            {title}
            {questions}
          </div>
        </>
      )}
    </div>
  );
}
