'use client';

// The news, as the redesign says it (portafolio.html, "Lo común a todas" and idea 01): two
// sentences with a figure — how we are doing, where the opportunity is — a third only when a
// blocker exists, then four tiles that carry the same figures with a state on their top
// border. Every figure travels with its provenance (`figureProps`), so the parity bench can
// read what the screen printed against what it was handed. What the sentences say is decided
// in ./headlineModel; this file only draws it.

import { Button } from '@/components/ui/button';
import { KpiTile } from '../../components/KpiTile';
import { figureProps } from '../../format';
import * as typeScale from '../../typeScale';
import type { PortfolioHeadline as HeadlineModel, HeadlineSentence } from './headlineModel';
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
  return (
    <div className="flex flex-col gap-3">
      <section className="space-y-1 px-1" data-testid="portfolio-headline">
        <p
          className={`${typeScale.bodyLg} font-semibold text-foreground leading-snug`}
          data-testid="headline-status"
        >
          <Sentence sentence={headline.status} />
        </p>
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
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="portfolio-tiles">
        {headline.tiles.map((tile) => (
          <KpiTile
            figure={figureProps(
              tile.figure.key,
              tile.figure.raw,
              tile.figure.currency,
              tile.figure.window,
              tile.figure.unit,
            )}
            key={tile.key}
            label={tile.label}
            state={tile.state}
            sub={tile.sub}
            testId={`tile-${tile.key}`}
            value={tile.value}
          />
        ))}
      </div>
    </div>
  );
}
