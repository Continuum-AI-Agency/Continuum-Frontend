'use client';

// "Ask for a suggestion" — three categories, inside one portfolio, as one quiet row.
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
  budget: { Icon: ArrowLeftRightIcon, tone: 'bg-primary/10 text-primary-ink' },
  creative: { Icon: ImagePlusIcon, tone: 'bg-secondary/10 text-sky-700 dark:text-sky-300' },
};

export function SuggestionAsk({ gates, onAsk, pending, error = null }: SuggestionAskProps) {
  return (
    <section className="@container mb-8" data-testid="suggestion-ask">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold text-base text-foreground tracking-tight">
          Ask for a suggestion
        </h3>
        <p className="text-muted-foreground text-xs">
          Read on request, from this portfolio's own figures
        </p>
      </header>
      {/* One quiet row of three asks: icon, label, one line on what asking gets, and the ask
          itself as a text button — no card per option. */}
      <ul className="mt-3 grid gap-x-8 gap-y-4 border-border/60 border-t pt-4 @2xl:grid-cols-3">
        {ADHOC_SUGGESTION_CATEGORIES.map((category) => {
          const gate = adhocSuggestionGateFor(gates, category);
          const copy = ADHOC_SUGGESTION_CATEGORY_COPY[category];
          const note = adhocSuggestionGateNote(gate);
          const busy = pending === category;
          const working = gate.state === 'queued' || gate.state === 'proposing';
          const { Icon, tone } = CATEGORY_ICON[category];
          return (
            <li className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3" key={category}>
              <span
                aria-hidden
                className={cn('grid size-8 place-items-center rounded-full', tone)}
                data-testid={`suggestion-ask-icon:${category}`}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold text-foreground text-sm tracking-tight">{copy.label}</p>
                <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                  {copy.blurb}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 pt-0.5">
                  <Button
                    className={cn(
                      // `min-w-[24px]`: "Ask" is 22px of text and a link button has no padding;
                      // px, because rem steps down with the root font size.
                      'h-8 min-w-[24px] justify-start px-0 font-medium text-xs',
                      // A ~5s breath while the worker is reading. No sheen.
                      working && 'animate-[pulse_5s_ease-in-out_infinite]',
                    )}
                    disabled={!gate.can_request || busy}
                    onClick={() => onAsk(category)}
                    size="sm"
                    type="button"
                    variant="link"
                  >
                    {working ? 'Reading…' : busy ? 'Asking…' : 'Ask'}
                  </Button>
                  {note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
                  {!note && gate.requests_left <= 1 ? (
                    <span className="text-muted-foreground text-xs">
                      {gate.requests_left === 1 ? 'One more today' : 'None left today'}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-3 text-destructive text-xs">{error}</p> : null}
    </section>
  );
}
