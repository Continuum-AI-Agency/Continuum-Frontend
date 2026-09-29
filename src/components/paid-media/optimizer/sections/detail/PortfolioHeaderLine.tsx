'use client';

// The first line of the portfolio module: its name and how it runs as a pill, then one grey
// line — how many ad sets it holds, when it was last read, and the objective, strategy and
// window as plain text that still opens the matching field in Manage. The controls (stop /
// resume / review, run now) sit on its right. The budget and the target are not here: the
// budget sits in the spend tile and the target under the anchor number, beside the figures
// they are read against. What the line says is decided in ./heroHeaderModel.

import { CheckCheckIcon, PauseIcon, PlayIcon, RefreshCwIcon } from 'lucide-react';
import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { resultNouns } from './headlineModel';
import type { HeroHeader, HeroSetting } from './heroHeaderModel';

export type PortfolioHeaderLineProps = {
  header: HeroHeader;
  onEditSetting: (setting: HeroSetting) => void;
  /** Stop / resume autopilot, or open the moves waiting in Recommend. */
  onSecondary: () => void;
  secondaryPending?: boolean;
  onRun: () => void;
  running: boolean;
};

const PILL = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium text-xs';
const MODE_TONE: Record<NonNullable<HeroHeader['mode']>['tone'], string> = {
  good: 'bg-success/14 text-success',
  warn: 'bg-warning/14 text-warning',
  line: 'border border-border text-muted-foreground',
  idle: 'bg-muted text-muted-foreground',
};

const SECONDARY_ICON = { stop: PauseIcon, resume: PlayIcon, review: CheckCheckIcon } as const;

/** The settings the grey line names; budget and target live beside their figures. */
const LINE_SETTINGS: readonly HeroSetting[] = ['objective', 'strategy', 'window'];

/** A setting as grey text that opens Manage — a link's affordance without a chip's frame. */
export const SETTING_TEXT =
  'rounded-sm underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2';

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

export function PortfolioHeaderLine({
  header,
  onEditSetting,
  onSecondary,
  secondaryPending = false,
  onRun,
  running,
}: PortfolioHeaderLineProps) {
  const SecondaryIcon = header.secondary ? SECONDARY_ICON[header.secondary.kind] : null;
  const chips = LINE_SETTINGS.flatMap((setting) =>
    header.chips.filter((chip) => chip.setting === setting),
  );
  const facts: Array<{ key: string; node: React.ReactNode }> = [];
  if (header.adsets) {
    facts.push({
      key: 'adsets',
      node: <span data-testid="header-adsets">{header.adsets}</span>,
    });
  }
  if (header.freshness && !header.freshness.stale) {
    facts.push({
      key: 'freshness',
      node: <span data-testid="header-freshness">{lowerFirst(header.freshness.text)}</span>,
    });
  }
  for (const chip of chips) {
    facts.push({
      key: chip.setting,
      node: (
        <button
          className={SETTING_TEXT}
          data-setting={chip.setting}
          data-testid="header-chip"
          onClick={() => onEditSetting(chip.setting)}
          title={`Edit the ${chip.label.toLowerCase()} in Manage`}
          type="button"
        >
          {/* The objective arrives as the metric's own label ("conversations"); the line
           *  names it in the words the sentences use. */}
          {chip.setting === 'objective'
            ? `objective: ${resultNouns(chip.value, chip.value).many}`
            : chip.value}
        </button>
      ),
    });
  }
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3"
      data-testid="portfolio-header"
    >
      <div className="min-w-0 flex-[1_1_16rem]">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="break-words font-semibold text-base text-foreground tracking-tight">
            {header.name}
          </h3>
          {header.mode ? (
            <span className={cn(PILL, MODE_TONE[header.mode.tone])} data-testid="header-mode">
              {header.mode.tone === 'good' || header.mode.tone === 'warn' ? (
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
              ) : null}
              {header.mode.label}
            </span>
          ) : null}
          {header.freshness?.stale ? (
            <span
              className={cn(PILL, 'bg-destructive/12 text-destructive')}
              data-testid="header-freshness"
            >
              {header.freshness.text}
            </span>
          ) : null}
          {header.roster ? (
            <span
              className={cn(
                PILL,
                header.roster.tone === 'bad'
                  ? 'bg-destructive/12 text-destructive'
                  : 'bg-warning/14 text-warning',
              )}
              data-testid="header-roster"
            >
              {header.roster.text}
            </span>
          ) : null}
        </div>
        <p
          className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground text-xs"
          data-testid="header-facts"
        >
          {facts.map((fact, index) => (
            <Fragment key={fact.key}>
              {index > 0 ? <span aria-hidden>·</span> : null}
              {fact.node}
            </Fragment>
          ))}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {header.secondary && SecondaryIcon ? (
          <Button disabled={secondaryPending} onClick={onSecondary} type="button" variant="outline">
            <SecondaryIcon className="size-4" />
            {header.secondary.label}
          </Button>
        ) : null}
        <Button disabled={running} onClick={onRun} type="button" variant="cta">
          <RefreshCwIcon className={cn('size-4', running && 'animate-spin')} />
          Run now
        </Button>
      </div>
    </div>
  );
}
