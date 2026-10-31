'use client';

// A change across several campaigns (design C, option 29): one row per campaign — its daily
// total before → after and its change counts by mark. The companion draws the band with every
// row; the chat draws a compact card with the first rows and "Open in canvas". Both read the one
// `PortfolioViewModel` (lib/campaign-canvas/portfolio.ts).

import { ChevronRight, PanelRightOpen } from 'lucide-react';
import { lecturaMoney } from '@/lib/campaign-canvas/lectura';
import {
  type PortfolioRow,
  type PortfolioViewModel,
  portfolioCountWords,
  portfolioHeadline,
} from '@/lib/campaign-canvas/portfolio';
import { cn } from '@/lib/utils';
import { PlatformChip } from '../lectura/LecturaView';

const COUNT_CLASS = {
  paused: 'bg-[color:var(--destructive)]/12 text-[color:var(--destructive)]',
  changed: 'bg-[color:var(--warning)]/15 text-[color:var(--warning)]',
  added: 'bg-[color:var(--success)]/12 text-[color:var(--success)]',
} as const;

/** The chat shows this many campaigns; the rest are one click away in the canvas. */
export const PORTFOLIO_CHAT_ROWS = 3;

function Money({
  before,
  after,
  currency,
}: {
  before: number | null;
  after: number | null;
  currency: string | null;
}) {
  if (before === null && after === null) return null;
  const was = lecturaMoney(before, currency);
  const will = lecturaMoney(after ?? before, currency);
  return (
    <span className="tabular-nums">
      {was && before !== after ? (
        <>
          <span className="text-muted-foreground line-through">{was}</span>
          <span className="px-1 text-muted-foreground">→</span>
        </>
      ) : null}
      <span className="font-semibold">{will}/day</span>
    </span>
  );
}

/** The row's budget: what delivers before → after, or what a new paused campaign would add. */
function RowBudget({ row }: { row: PortfolioRow }) {
  if (row.before !== null || row.after !== null) {
    return (
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <Money before={row.before} after={row.after} currency={row.currency} />
        {row.onceActivated > 0 ? (
          <span className="text-xs text-muted-foreground">
            +{lecturaMoney(row.onceActivated, row.currency)} new
          </span>
        ) : null}
      </span>
    );
  }
  if (row.onceActivated > 0) {
    return (
      <span className="tabular-nums">
        <span className="text-muted-foreground">New, paused · </span>
        <span className="font-semibold">{lecturaMoney(row.onceActivated, row.currency)}/day</span>
        <span className="text-muted-foreground"> once activated</span>
      </span>
    );
  }
  return null;
}

function Counts({ row }: { row: PortfolioRow }) {
  const words = portfolioCountWords(row.counts);
  if (words.length === 0) return <span className="text-xs text-muted-foreground">No change</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {words.map((word) => (
        <span
          key={word.mark}
          className={cn('rounded-full px-1.5 py-px font-mono text-[11px]', COUNT_CLASS[word.mark])}
          data-mark={word.mark}
        >
          {word.text}
        </span>
      ))}
    </span>
  );
}

function RowBody({ row }: { row: PortfolioRow }) {
  return (
    <>
      <span className="flex min-w-0 items-baseline gap-2">
        <PlatformChip platform={row.platform} />
        <span className="min-w-0 break-words text-sm font-semibold leading-snug">{row.name}</span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
        <RowBudget row={row} />
        <Counts row={row} />
      </span>
    </>
  );
}

function PortfolioTotal({ portfolio }: { portfolio: PortfolioViewModel }) {
  if (portfolio.mixedCurrency) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Campaigns in different currencies: totals per campaign below.
      </p>
    );
  }
  const { before, after, onceActivated } = portfolio.totals;
  if (before === null && after === null && onceActivated === 0) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]" data-testid="portfolio-total">
      <span className="text-muted-foreground">Daily budget, all campaigns</span>
      <Money before={before} after={after} currency={portfolio.currency} />
      {onceActivated > 0 ? (
        <span className="text-xs text-muted-foreground">
          +{lecturaMoney(onceActivated, portfolio.currency)} once activated
        </span>
      ) : null}
    </p>
  );
}

/** The companion's band: every campaign, a tap opens it. */
export function PortfolioBand({
  portfolio,
  onOpenRow,
}: {
  portfolio: PortfolioViewModel;
  onOpenRow: (row: PortfolioRow) => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-background">
      <section
        className="mx-auto grid w-full max-w-3xl gap-3 p-3 sm:p-4"
        data-testid="portfolio-band"
        aria-label="Portfolio"
      >
        <header className="grid gap-1">
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
            Portfolio
          </span>
          <h3 className="text-base font-semibold" data-testid="portfolio-headline">
            {portfolioHeadline(portfolio)}
          </h3>
          <PortfolioTotal portfolio={portfolio} />
        </header>
        <ul className="grid gap-2">
          {portfolio.rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onOpenRow(row)}
                className="grid w-full min-w-0 gap-1.5 rounded-xl border-[1.5px] border-border bg-card p-3 text-left hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                data-testid={`portfolio-row-${row.id}`}
                data-changes={row.changeCount}
              >
                <span className="flex min-w-0 items-start justify-between gap-2">
                  <span className="grid min-w-0 flex-1 gap-1.5">
                    <RowBody row={row} />
                  </span>
                  <ChevronRight
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const OPEN_CLASS =
  'inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] font-medium text-primary-ink hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary';

/** The chat's card: the headline, the first campaigns, the total and "Open in canvas". */
export function PortfolioChatCard({
  portfolio,
  onOpen,
}: {
  portfolio: PortfolioViewModel;
  /** Absent where no canvas sits beside the chat: the card then only reads. */
  onOpen?: () => void;
}) {
  const shown = portfolio.rows.slice(0, PORTFOLIO_CHAT_ROWS);
  const more = portfolio.rows.length - shown.length;
  return (
    <section
      className="grid min-w-0 gap-2.5 rounded-xl border border-border bg-card p-3"
      data-testid="portfolio-chat-card"
      aria-label="Portfolio"
    >
      <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
        <h3 className="text-sm font-semibold" data-testid="portfolio-headline">
          {portfolioHeadline(portfolio)}
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
          Portfolio
        </span>
      </header>
      <ul className="grid gap-1.5">
        {shown.map((row) => (
          <li
            key={row.id}
            className="grid min-w-0 gap-1 rounded-lg border border-border/70 bg-background px-2.5 py-2"
            data-testid={`portfolio-row-${row.id}`}
            data-changes={row.changeCount}
          >
            <RowBody row={row} />
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="text-xs text-muted-foreground">
          +{more} more {more === 1 ? 'campaign' : 'campaigns'} in the canvas
        </p>
      ) : null}
      <PortfolioTotal portfolio={portfolio} />
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={OPEN_CLASS}
          data-testid="portfolio-open-in-canvas"
        >
          <PanelRightOpen className="size-3.5" aria-hidden />
          Open in canvas
        </button>
      ) : null}
    </section>
  );
}
