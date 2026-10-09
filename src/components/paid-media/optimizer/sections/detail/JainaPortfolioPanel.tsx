'use client';

// Jaina's bar under the portfolio read (P1, "Lectura continua"): a field to ask her about
// this portfolio and the five prepared questions, in one light primary band with no border.
// The page has ONE place that talks to Jaina.
//
// Her read no longer lives here. When a model wrote it and it says something the status
// sentence does not, it is one attributed line under that sentence (./PortfolioHeadline);
// a deterministic read only repeated the headline and is gone.
//
// The field's submit deep-links into Jaina with the portfolio as its context (jainaAskPrompt)
// through the same href the chips use; the navigation itself is a prop so a test can catch
// it without a window.

import type { PortfolioListItem } from '@continuum/contracts';
import { SendHorizontalIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { cn } from '@/lib/utils';
import { JainaEntryChips } from '../JainaEntryChips';
import { jainaAskPrompt } from '../jainaEntryModel';
import type { JainaRead } from './headlineModel';

export type JainaPortfolioPanelProps = {
  portfolio: Pick<PortfolioListItem, 'name' | 'objective' | 'id'>;
  /** Kept for the caller's shape; the read renders under the headline now, not here. */
  read?: JainaRead | null;
  /** Where a typed question goes. Defaults to a full navigation to the Jaina tab. */
  onAsk?: (href: string) => void;
  className?: string;
};

const navigate = (href: string) => {
  window.location.assign(href);
};

export function JainaPortfolioPanel({
  portfolio,
  onAsk = navigate,
  className,
}: JainaPortfolioPanelProps) {
  const [question, setQuestion] = React.useState('');
  const trimmed = question.trim();
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmed.length === 0) return;
    onAsk(jainaPromptHref(jainaAskPrompt(portfolio, trimmed)));
  };
  return (
    <section
      className={cn('rounded-xl bg-primary/8 px-4 py-2.5', className)}
      data-testid="portfolio-jaina"
    >
      <JainaEntryChips frame={false} layout="row" portfolio={portfolio}>
        <form
          className="flex min-w-0 flex-1 basis-64 items-center gap-2"
          data-testid="jaina-ask"
          onSubmit={submit}
        >
          <Input
            aria-label={`Ask Jaina about ${portfolio.name}`}
            className="h-8 min-w-0 bg-background text-sm"
            name="question"
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask anything about this portfolio…"
            value={question}
          />
          <Button
            aria-label="Send the question to Jaina"
            disabled={trimmed.length === 0}
            size="sm"
            type="submit"
            variant="outline"
          >
            <SendHorizontalIcon aria-hidden className="size-3.5" />
            Ask
          </Button>
        </form>
      </JainaEntryChips>
    </section>
  );
}
