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

export function SuggestionAsk({ gates, onAsk, pending, error = null }: SuggestionAskProps) {
  return (
    <section
      className="mb-3 rounded-lg border border-border/60 bg-card/40"
      data-testid="suggestion-ask"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-border/60 border-b px-3 py-2">
        <h3 className="font-semibold text-foreground text-sm">Ask for a suggestion</h3>
        <p className="text-3xs text-muted-foreground">
          Read on request, from this portfolio's own figures
        </p>
      </header>
      <ul className="grid gap-px bg-border/60 sm:grid-cols-3">
        {ADHOC_SUGGESTION_CATEGORIES.map((category) => {
          const gate = adhocSuggestionGateFor(gates, category);
          const copy = ADHOC_SUGGESTION_CATEGORY_COPY[category];
          const note = adhocSuggestionGateNote(gate);
          const busy = pending === category;
          const working = gate.state === 'queued' || gate.state === 'proposing';
          return (
            <li className="space-y-1.5 bg-card/60 px-3 py-2.5" key={category}>
              <p className="font-medium text-foreground text-xs">{copy.label}</p>
              <p className="text-2xs text-muted-foreground">{copy.blurb}</p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <Button
                  className={cn(
                    'h-7 text-2xs',
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
                {note ? <span className="text-3xs text-muted-foreground">{note}</span> : null}
                {!note && gate.requests_left <= 1 ? (
                  <span className="text-3xs text-muted-foreground">
                    {gate.requests_left === 1 ? 'One more today' : 'None left today'}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="border-border/60 border-t px-3 py-1.5 text-3xs text-destructive">{error}</p>
      ) : null}
    </section>
  );
}
