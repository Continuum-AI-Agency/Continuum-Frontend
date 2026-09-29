'use client';

// The first line of a portfolio: its name, how it runs, when it was last read, how many ad
// sets it holds, and its fixed facts as chips that open the matching field in Manage. The
// controls (stop / resume / review, run now) sit on its right. What the line says is decided
// in ./heroHeaderModel; this file only draws it.

import { CheckCheckIcon, PauseIcon, PlayIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

export function PortfolioHeaderLine({
  header,
  onEditSetting,
  onSecondary,
  secondaryPending = false,
  onRun,
  running,
}: PortfolioHeaderLineProps) {
  const SecondaryIcon = header.secondary ? SECONDARY_ICON[header.secondary.kind] : null;
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3"
      data-testid="portfolio-header"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="break-words font-semibold text-foreground text-xl tracking-tight">
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
          {header.adsets ? (
            <span className={cn(PILL, 'text-muted-foreground')} data-testid="header-adsets">
              {header.adsets}
            </span>
          ) : null}
          {header.freshness ? (
            <span
              className={cn(
                PILL,
                header.freshness.stale
                  ? 'bg-destructive/12 text-destructive'
                  : 'border border-border text-muted-foreground',
              )}
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="header-facts">
          {header.chips.map((chip) => (
            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-foreground text-xs transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
              data-setting={chip.setting}
              data-testid="header-chip"
              key={chip.setting}
              onClick={() => onEditSetting(chip.setting)}
              title={`Editar ${chip.label.toLowerCase()} en Manage`}
              type="button"
            >
              <span className="text-muted-foreground">{chip.label}</span>
              {chip.value}
            </button>
          ))}
        </div>
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
          Correr ahora
        </Button>
      </div>
    </div>
  );
}
