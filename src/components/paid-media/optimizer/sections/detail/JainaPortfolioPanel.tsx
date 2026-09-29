'use client';

// The Jaina panel a portfolio opens with (portafolio.html, idea 14): her latest read on this
// portfolio as one sentence with a figure, a field to ask her something else about it, and
// the five prepared questions — all inside the one primary band (../JainaEntryChips), so the
// page has ONE place that talks to Jaina and not a chat box beside a row of chips.
//
// The read is decided in ./headlineModel: the brief's hero sentence when a model wrote it,
// else the deterministic headline, and the label says which. The field's submit deep-links
// into Jaina with the portfolio as its context (jainaAskPrompt) through the same href the
// chips use; the navigation itself is a prop so a test can catch it without a window.

import type { PortfolioListItem } from '@continuum/contracts';
import { SendHorizontalIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { cn } from '@/lib/utils';
import { figureProps } from '../../format';
import { JainaEntryChips } from '../JainaEntryChips';
import { jainaAskPrompt } from '../jainaEntryModel';
import type { JainaRead } from './headlineModel';

export type JainaPortfolioPanelProps = {
  portfolio: Pick<PortfolioListItem, 'name' | 'objective' | 'id'>;
  /** Null before the first cycle: the field and the questions still stand. */
  read: JainaRead | null;
  /** Where a typed question goes. Defaults to a full navigation to the Jaina tab. */
  onAsk?: (href: string) => void;
};

const navigate = (href: string) => {
  window.location.assign(href);
};

export function JainaPortfolioPanel({
  portfolio,
  read,
  onAsk = navigate,
}: JainaPortfolioPanelProps) {
  const [question, setQuestion] = React.useState('');
  const trimmed = question.trim();
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmed.length === 0) return;
    onAsk(jainaPromptHref(jainaAskPrompt(portfolio, trimmed)));
  };
  return (
    <section data-testid="portfolio-jaina">
      <JainaEntryChips portfolio={portfolio}>
        {read ? (
          <div className="flex flex-col gap-0.5" data-source={read.source} data-testid="jaina-read">
            <p className="text-muted-foreground text-xs" data-testid="jaina-read-label">
              {read.label}
            </p>
            <p
              className={cn('text-foreground text-sm', read.source === 'auto' && 'italic')}
              data-testid="jaina-read-sentence"
            >
              {/* The sentence carries figures inside prose, so the node declares the one it is
               *  about and the bench reads every money token in it against the growth figures. */}
              <span
                {...figureProps(
                  read.figure.key,
                  read.figure.raw,
                  read.figure.currency,
                  read.figure.window,
                  read.figure.unit,
                )}
              >
                {read.sentence}
              </span>
            </p>
          </div>
        ) : null}
        <form className="flex items-center gap-2" data-testid="jaina-ask" onSubmit={submit}>
          <Input
            aria-label={`Preguntale a Jaina sobre ${portfolio.name}`}
            className="h-8 bg-background text-sm"
            name="question"
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Preguntale algo sobre este portafolio…"
            value={question}
          />
          <Button
            aria-label="Enviar la pregunta a Jaina"
            disabled={trimmed.length === 0}
            size="sm"
            type="submit"
            variant="outline"
          >
            <SendHorizontalIcon aria-hidden className="size-3.5" />
            Preguntar
          </Button>
        </form>
      </JainaEntryChips>
    </section>
  );
}
