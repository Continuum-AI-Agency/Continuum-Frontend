'use client';

// The news, as the redesign says it (portafolio.html, "Lo común a todas" and idea 01; the
// module's right-hand column in portafolio-unificado.html, idea D): the status sentence large,
// Jaina's read as one attributed line under it when she wrote something it does not say, the
// opportunity, and a blocker only when one exists. Every figure travels with its provenance
// (`figureProps`), so the parity bench can read what the screen printed against what it was
// handed. What the sentences say is decided in ./headlineModel; this file only draws it.

import { Button } from '@/components/ui/button';
import { figureProps } from '../../format';
import * as typeScale from '../../typeScale';
import {
  attributedRead,
  type PortfolioHeadline as HeadlineModel,
  type HeadlineSentence,
} from './headlineModel';
import type { HeroSetting } from './heroHeaderModel';

export type PortfolioHeadlineProps = {
  headline: HeadlineModel;
  onEditSetting: (setting: HeroSetting) => void;
};

/** A sentence's segments: prose as text, figures on their own provenance node. */
export function Sentence({ sentence }: { sentence: HeadlineSentence }) {
  return (
    <>
      {sentence.map((segment, index) =>
        typeof segment === 'string' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the segments are static per sentence
          <span key={index}>{segment}</span>
        ) : (
          <span
            className="tabular-nums"
            key={segment.key}
            {...figureProps(
              segment.key,
              segment.raw,
              segment.currency,
              segment.window,
              segment.unit,
            )}
          >
            {segment.text}
          </span>
        ),
      )}
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
          <span className="font-semibold text-primary" data-testid="jaina-read-label">
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
        className={`${typeScale.bodyLg} text-foreground leading-snug`}
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
