'use client';

// "Ask for a suggestion" — three categories, inside one portfolio.
//
// Deliberately three plain controls and not a dropdown plus a button: the three categories
// ARE the product's vocabulary, and hiding two of them behind a menu makes a person choose
// before they know what choosing buys. The blurb under each says what asking gets, so the
// first press is informed rather than exploratory.
//
// Every disabled state comes from the server's own gate, echoed in the note, so the control
// never refuses without saying why and never offers an ask the RPC will decline.

import type { AdhocSuggestionCategory, AdhocSuggestionGate } from '@continuum/contracts';
import {
  ADHOC_SUGGESTION_CATEGORIES,
  ADHOC_SUGGESTION_CATEGORY_COPY,
  adhocSuggestionGateFor,
  adhocSuggestionGateNote,
} from '@continuum/contracts';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRightIcon, ImagePlusIcon, UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SuggestionAskProps = {
  gates: readonly AdhocSuggestionGate[];
  onAsk: (category: AdhocSuggestionCategory) => void;
  /** The category mid-request, so its control reads as busy rather than unresponsive. */
  pending: AdhocSuggestionCategory | null;
  /** Why the last ask did not go through. One line, the server's words. */
  error?: string | null;
};

/** Each category's glyph, tinted with the same tone tokens as that category's badge in
 *  Today's read (success / violet / teal), so an ask and the row it produces read as one. */
const CATEGORY_ICON: Record<AdhocSuggestionCategory, { Icon: LucideIcon; tone: string }> = {
  audience: { Icon: UsersIcon, tone: 'bg-success/10 text-emerald-700 dark:text-emerald-300' },
  budget: { Icon: ArrowLeftRightIcon, tone: 'bg-primary/10 text-primary' },
  creative: { Icon: ImagePlusIcon, tone: 'bg-secondary/10 text-sky-700 dark:text-sky-300' },
};

export function SuggestionAsk({ gates, onAsk, pending, error = null }: SuggestionAskProps) {
  return (
    <section
      className="mb-5 rounded-xl border border-border/60 bg-card/40"
      data-testid="suggestion-ask"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-border/60 border-b px-5 py-4">
        <h3 className="font-semibold text-foreground text-xl tracking-tight">Ask for a suggestion</h3>
        <p className="text-muted-foreground text-sm">
          Read on request, from this portfolio's own figures
        </p>
      </header>
      <ul className="grid gap-4 p-5 sm:grid-cols-3">
        {ADHOC_SUGGESTION_CATEGORIES.map((category) => {
          const gate = adhocSuggestionGateFor(gates, category);
          const copy = ADHOC_SUGGESTION_CATEGORY_COPY[category];
          const note = adhocSuggestionGateNote(gate);
          const busy = pending === category;
          const working = gate.state === 'queued' || gate.state === 'proposing';
          const { Icon, tone } = CATEGORY_ICON[category];
          return (
            <li
              className="flex min-h-56 flex-col gap-4 rounded-xl border border-border/60 bg-card p-5"
              key={category}
            >
              <span
                aria-hidden
                className={cn('grid size-12 place-items-center rounded-full', tone)}
                data-testid={`suggestion-ask-icon:${category}`}
              >
                <Icon className="size-6" />
              </span>
              <p className="font-semibold text-foreground text-lg tracking-tight">{copy.label}</p>
              <p className="text-base text-muted-foreground leading-relaxed">{copy.blurb}</p>
              <div className="mt-auto flex flex-col gap-2">
                <Button
                  className={cn(
                    'h-10 w-full text-sm',
                    // A ~5s breath while the worker is reading. No sheen.
                    working && 'animate-[pulse_5s_ease-in-out_infinite]',
                  )}
                  disabled={!gate.can_request || busy}
                  onClick={() => onAsk(category)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {working ? 'Reading…' : busy ? 'Asking…' : 'Ask'}
                </Button>
                {note ? <span className="text-muted-foreground text-sm">{note}</span> : null}
                {!note && gate.requests_left <= 1 ? (
                  <span className="text-muted-foreground text-sm">
                    {gate.requests_left === 1 ? 'One more today' : 'None left today'}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="border-border/60 border-t px-5 py-3 text-destructive text-sm">{error}</p>
      ) : null}
    </section>
  );
}
