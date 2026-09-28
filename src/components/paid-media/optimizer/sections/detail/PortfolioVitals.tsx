'use client';

// The top of a portfolio: who it is, how it runs, and six vital signs each drawn against
// its own reference as a bullet bar. Everything said here is decided in ./vitalsModel —
// this file only draws it. The rows container is a size container, so a narrow pane stacks
// label+value over a full-width bar exactly as a phone does, whatever the window is.

import {
  CheckCheckIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HeroFigure } from '../../components/HeroFigure';
import * as typeScale from '../../typeScale';
import type {
  BulletBar,
  HeroHeader,
  HeroMismatch,
  HeroSetting,
  OutcomeBar,
  VitalRow,
  VitalTone,
} from './vitalsModel';

export type PortfolioVitalsProps = {
  header: HeroHeader;
  /** Null before the first cycle: the header still stands, the rows have nothing to read. */
  rows: VitalRow[] | null;
  onEditSetting: (setting: HeroSetting) => void;
  /** Stop / resume autopilot, or open the moves waiting in Recommend. */
  onSecondary: () => void;
  secondaryPending?: boolean;
  onRun: () => void;
  running: boolean;
};

const VALUE_TONE: Record<VitalTone, string> = {
  good: 'text-foreground',
  idle: 'text-foreground',
  warn: 'text-warning',
  bad: 'text-destructive',
};
const DOT_TONE: Record<VitalTone, string> = {
  good: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-destructive',
  idle: 'bg-muted-foreground',
};
const BAND_TONE: Record<VitalTone, string> = {
  good: 'bg-success/15',
  warn: 'bg-warning/15',
  bad: 'bg-destructive/15',
  idle: 'bg-muted',
};
/** The bullet's fill takes the row's tone through currentColor. */
const TEXT_TONE: Record<VitalTone, string> = {
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
  idle: 'text-muted-foreground',
};

const PILL = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium text-xs';
const MODE_TONE: Record<NonNullable<HeroHeader['mode']>['tone'], string> = {
  good: 'bg-success/14 text-success',
  warn: 'bg-warning/14 text-warning',
  line: 'border border-border text-muted-foreground',
  idle: 'bg-muted text-muted-foreground',
};

const pct = (value: number, max: number): number =>
  max > 0 ? (Math.max(0, Math.min(value, max)) / max) * 100 : 0;

function Bullet({ bar, label }: { bar: BulletBar; label: string }) {
  const ref = pct(bar.ref, bar.max);
  let from = 0;
  const anchor = ref > 85 ? '-translate-x-full' : ref < 15 ? 'translate-x-0' : '-translate-x-1/2';
  return (
    <div
      aria-label={`${label} against ${bar.refLabel}`}
      className="relative h-10"
      data-testid="vital-bullet"
      role="img"
    >
      {bar.bands.map((band) => {
        const left = from;
        from = pct(band.to, bar.max);
        return (
          <span
            className={cn('absolute top-2.5 h-3.5', BAND_TONE[band.tone])}
            key={`${band.tone}-${band.to}`}
            style={{ left: `${left}%`, width: `${Math.max(0, from - left)}%` }}
          />
        );
      })}
      {bar.value == null ? null : (
        <span
          className="absolute top-3.5 left-0 h-1.5 rounded-sm bg-current"
          data-testid="vital-fill"
          style={{ width: `${pct(bar.value, bar.max)}%` }}
        />
      )}
      <span className="absolute top-1.5 h-5.5 w-0.5 bg-foreground" style={{ left: `${ref}%` }} />
      <span
        className={cn(
          'absolute top-7 whitespace-nowrap font-mono text-muted-foreground text-xs',
          anchor,
        )}
        style={{ left: `${ref}%` }}
      >
        {bar.refLabel}
      </span>
    </div>
  );
}

function Outcome({ bar }: { bar: OutcomeBar }) {
  const segments = [
    { n: bar.applied, className: 'bg-success/85', word: 'applied' },
    { n: bar.failed, className: 'bg-destructive/70', word: 'failed' },
    { n: bar.held, className: 'bg-warning/70', word: 'held' },
  ];
  return (
    <div
      aria-label={`${bar.applied} applied, ${bar.failed} failed, ${bar.held} held of ${bar.total}`}
      className="flex h-3.5 gap-0.5"
      data-testid="vital-outcome"
      role="img"
    >
      {segments.map((s) =>
        s.n > 0 ? (
          <span
            className={cn('h-full rounded-sm', s.className)}
            data-segment={s.word}
            key={s.word}
            style={{ width: `${(s.n / bar.total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function Row({ row }: { row: VitalRow }) {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-border border-t px-4 py-3 first:border-t-0 @2xl:grid-cols-[170px_minmax(0,1fr)_200px]"
      data-testid="vital-row"
      data-tone={row.tone}
      data-vital={row.key}
    >
      <div className="min-w-0">
        <p className={`${typeScale.label} font-semibold text-muted-foreground`}>{row.label}</p>
        <HeroFigure as="p" className={cn('tracking-tight', VALUE_TONE[row.tone])} kind="tile">
          {row.value}
          {row.unit ? (
            <span className="ml-1 font-medium text-muted-foreground text-sm tracking-normal">
              {row.unit}
            </span>
          ) : null}
        </HeroFigure>
      </div>
      <div
        className={cn('order-3 col-span-full @2xl:order-none @2xl:col-span-1', TEXT_TONE[row.tone])}
      >
        {row.bar?.kind === 'bullet' ? <Bullet bar={row.bar} label={row.label} /> : null}
        {row.bar?.kind === 'outcome' ? <Outcome bar={row.bar} /> : null}
      </div>
      <p
        className="flex items-start gap-2 text-muted-foreground text-sm"
        data-testid="vital-reading"
      >
        <span
          aria-hidden
          className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT_TONE[row.tone])}
        />
        <span>{row.reading}</span>
      </p>
    </div>
  );
}

/**
 * Ad sets bidding for a result the portfolio does not measure. All of them is a warning
 * surface of its own (the portfolio moves nothing); some of them is a quieter line.
 */
function MismatchBanner({
  mismatch,
  onEditSetting,
}: {
  mismatch: HeroMismatch;
  onEditSetting: (setting: HeroSetting) => void;
}) {
  const all = mismatch.scope === 'all';
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        all ? 'border-warning/40 bg-warning/10' : 'border-border bg-muted/40',
      )}
      data-scope={mismatch.scope}
      data-testid="vitals-mismatch"
      role={all ? 'alert' : 'status'}
    >
      <p className="flex min-w-0 items-start gap-2 text-foreground text-sm">
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <span className={cn(all && 'font-medium')}>{mismatch.text}</span>
      </p>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        {mismatch.actions.map((action) => (
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
    </div>
  );
}

const SECONDARY_ICON = { stop: PauseIcon, resume: PlayIcon, review: CheckCheckIcon } as const;

export function PortfolioVitals({
  header,
  rows,
  onEditSetting,
  onSecondary,
  secondaryPending = false,
  onRun,
  running,
}: PortfolioVitalsProps) {
  const SecondaryIcon = header.secondary ? SECONDARY_ICON[header.secondary.kind] : null;
  return (
    <section className="flex flex-col gap-3" data-testid="portfolio-vitals">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-semibold text-foreground text-xl tracking-tight">
              {header.name}
            </h3>
            {header.mode ? (
              <span className={cn(PILL, MODE_TONE[header.mode.tone])} data-testid="vitals-mode">
                {header.mode.tone === 'good' || header.mode.tone === 'warn' ? (
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                ) : null}
                {header.mode.label}
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
                data-testid="vitals-freshness"
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
                data-testid="vitals-roster"
              >
                {header.roster.text}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {header.chips.map((chip) => (
              <button
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-foreground text-xs transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                data-setting={chip.setting}
                data-testid="vitals-chip"
                key={chip.setting}
                onClick={() => onEditSetting(chip.setting)}
                title={`Edit ${chip.label.toLowerCase()} in Manage`}
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
            <Button
              disabled={secondaryPending}
              onClick={onSecondary}
              type="button"
              variant="outline"
            >
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
      {header.mismatch ? (
        <MismatchBanner mismatch={header.mismatch} onEditSetting={onEditSetting} />
      ) : null}
      {rows ? (
        <div
          className="@container rounded-xl border border-border bg-card"
          data-testid="vitals-rows"
        >
          {rows.map((row) => (
            <Row key={row.key} row={row} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
