'use client';

// The news, as the redesign says it (portafolio.html, "Lo común a todas" and idea 01; the
// module's right-hand column in portafolio-unificado.html, idea D; P1 in
// performance-plus-screens): the status sentence large, Jaina's read as one attributed line
// under it when she wrote something it does not say, the opportunity lighter, and a blocker
// only when one exists. Figures sit in mono at the sentence's own weight; a comparison clause
// ("22% over the target") takes a subtle red or green. Every figure travels with its
// provenance (`figureProps`), so the parity bench can read what the screen printed against
// what it was handed. What the sentences say is decided in ./headlineModel; this file only
// draws it.

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { figureProps } from '../../format';
import * as typeScale from '../../typeScale';
import {
  attributedRead,
  type HeadlineFigure,
  type PortfolioHeadline as HeadlineModel,
  type HeadlineSentence,
  type HeadlineTone,
  isComparison,
} from './headlineModel';
import type { HeroSetting } from './heroHeaderModel';

export type PortfolioHeadlineProps = {
  headline: HeadlineModel;
  onEditSetting: (setting: HeroSetting) => void;
};

const TONE_TEXT: Record<HeadlineTone, string> = {
  good: 'text-success',
  bad: 'text-destructive',
};

function Figure({ figure }: { figure: HeadlineFigure }) {
  return (
    <span
      className="font-mono tabular-nums"
      {...figureProps(figure.key, figure.raw, figure.currency, figure.window, figure.unit)}
    >
      {figure.text}
    </span>
  );
}

/** A sentence's segments: prose as text, figures in mono on their own provenance node, a
 *  comparison clause in its tone. */
export function Sentence({ sentence }: { sentence: HeadlineSentence }) {
  return (
    <>
      {sentence.map((segment, index) => {
        if (typeof segment === 'string') {
          // biome-ignore lint/suspicious/noArrayIndexKey: the segments are static per sentence
          return <span key={index}>{segment}</span>;
        }
        if (isComparison(segment)) {
          return (
            <span
              className={TONE_TEXT[segment.tone]}
              data-testid="headline-comparison"
              data-tone={segment.tone}
              // biome-ignore lint/suspicious/noArrayIndexKey: the segments are static per sentence
              key={index}
            >
              {segment.parts.map((part, partIndex) =>
                typeof part === 'string' ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static per clause
                  <span key={partIndex}>{part}</span>
                ) : (
                  <Figure figure={part} key={part.key} />
                ),
              )}
            </span>
          );
        }
        return <Figure figure={segment} key={segment.key} />;
      })}
    </>
  );
}

export function PortfolioHeadline({ headline, onEditSetting }: PortfolioHeadlineProps) {
  const read = attributedRead(headline);
  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="portfolio-headline">
      <p className={`${typeScale.headline} text-foreground`} data-testid="headline-status">
        <Sentence sentence={headline.status} />
      </p>
      {read ? (
        <p
          className={`${typeScale.body} text-muted-foreground`}
          data-source="jaina"
          data-testid="jaina-read"
        >
          <span className="font-semibold text-primary-ink" data-testid="jaina-read-label">
            {read.ago ? `Jaina · ${read.ago}` : 'Jaina'}
          </span>
          {' — '}
          {/* The sentence carries figures inside prose, so the node declares the one it is
           *  about and the bench reads every money token in it against the growth figures. */}
          <span data-testid="jaina-read-sentence">
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
          </span>
        </p>
      ) : null}
      <p
        className={cn(typeScale.bodyLg, 'font-normal text-muted-foreground leading-snug')}
        data-testid="headline-opportunity"
      >
        <Sentence sentence={headline.opportunity} />
      </p>
      {headline.blocker ? (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2"
          data-blocker={headline.blocker.code}
          data-testid="headline-blocker"
          role={headline.blocker.code === 'kpi_mismatch' ? 'alert' : 'status'}
        >
          <p className={`${typeScale.bodyLg} text-warning leading-snug`}>
            <Sentence sentence={headline.blocker.sentence} />
          </p>
          {headline.blocker.actions.map((action) => (
            <Button
              data-setting={action.setting}
              key={action.setting}
              onClick={() => onEditSetting(action.setting)}
              size="sm"
              type="button"
              variant={action.primary ? 'default' : 'outline'}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
