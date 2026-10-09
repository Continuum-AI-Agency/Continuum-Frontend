'use client';

// The Scale / Iterate / Kill calls as three borderless columns: a coloured uppercase heading,
// then one hairline-separated row per ad — thumbnail, name, its angle when the labeller
// confirmed one, and its cost on the right.
//
// Rows stay one line of identity plus efficiency. The figure-bearing reason, the spend and the
// creative itself live in the hover (VerdictHoverCard). The small thumb still renders in the
// row so an expired Meta CDN URL starts re-resolving before the hover, and the hover then
// reveals a real image.

import type { PaidCreativeVerdict } from '@continuum/contracts';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromPaidVerdict } from '@/components/chat/media/media';
import { cn } from '@/lib/utils';
import { VerdictHoverCard } from './VerdictHoverCard';
import { isHttpUrl, money, type VerdictsByKind } from './whatsWorkingModel';

const MAX_ROWS_PER_COLUMN = 5;

type ColumnKind = keyof VerdictsByKind;

const COLUMN_ORDER: ColumnKind[] = ['scale', 'iterate', 'kill'];

const HEADING_TONE: Record<ColumnKind, string> = {
  scale: 'text-emerald-600 dark:text-emerald-400',
  iterate: 'text-amber-600 dark:text-amber-400',
  kill: 'text-destructive',
};

export type VerdictColumnsProps = {
  verdictsByKind: VerdictsByKind;
  freshUrlById: Record<string, string>;
  onRecover: (adId: string) => void;
  /** The ad account's ISO currency; unknown prints bare figures. */
  currency: string | null;
  /** ad id → display angle, for the line under each ad's name. */
  angleLabelByAd?: ReadonlyMap<string, string>;
};

function VerdictRow({
  verdict,
  freshUrl,
  onRecover,
  currency,
  angleLabel,
}: {
  verdict: PaidCreativeVerdict;
  freshUrl: string | null;
  onRecover: (adId: string) => void;
  currency: string | null;
  angleLabel: string | null;
}) {
  const media = mediaFromPaidVerdict({
    ...verdict,
    thumbnailUrl: freshUrl ?? verdict.thumbnailUrl,
  });
  const label = verdict.adName ?? verdict.adId;
  const rowClass =
    'grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-border/60 border-t py-2 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  const body = (
    <>
      {media ? (
        <span className="relative block h-11 w-9 shrink-0 overflow-hidden rounded-md">
          <ChatMediaThumb
            className="rounded-md"
            fallbackSeed={label}
            media={media}
            onRecover={() => onRecover(verdict.adId)}
          />
        </span>
      ) : (
        <span className="grid h-11 w-9 shrink-0 place-items-center rounded-md bg-muted text-xs text-muted-foreground">
          AD
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground text-xs">{label}</span>
        {angleLabel ? (
          <span className="block truncate text-xs text-muted-foreground">{angleLabel}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-foreground text-xs tabular-nums">
        {money(verdict.cpa, currency)}
      </span>
    </>
  );

  return (
    <VerdictHoverCard
      currency={currency}
      freshUrl={freshUrl}
      onRecover={onRecover}
      verdict={verdict}
    >
      {isHttpUrl(verdict.permalinkUrl) ? (
        <a className={rowClass} href={verdict.permalinkUrl} rel="noreferrer" target="_blank">
          {body}
        </a>
      ) : (
        <span className={rowClass}>{body}</span>
      )}
    </VerdictHoverCard>
  );
}

export function VerdictColumns({
  verdictsByKind,
  freshUrlById,
  onRecover,
  currency,
  angleLabelByAd,
}: VerdictColumnsProps) {
  return (
    <div className="grid gap-6 @3xl/ci:grid-cols-3 @3xl/ci:gap-9">
      {COLUMN_ORDER.map((kind) => {
        const verdicts = verdictsByKind[kind];
        return (
          <div className="min-w-0" data-testid={`verdict-column-${kind}`} key={kind}>
            <h4
              className={cn(
                'mb-2 font-semibold text-xs uppercase tracking-wider',
                HEADING_TONE[kind],
              )}
            >
              {kind} · <span className="tabular-nums">{verdicts.length}</span>
            </h4>
            {verdicts.length === 0 ? (
              <p className="border-border/60 border-t py-2 text-xs text-muted-foreground">
                None right now.
              </p>
            ) : (
              verdicts
                .slice(0, MAX_ROWS_PER_COLUMN)
                .map((verdict) => (
                  <VerdictRow
                    angleLabel={angleLabelByAd?.get(verdict.adId) ?? null}
                    currency={currency}
                    freshUrl={freshUrlById[verdict.adId] ?? null}
                    key={verdict.adId}
                    onRecover={onRecover}
                    verdict={verdict}
                  />
                ))
            )}
          </div>
        );
      })}
    </div>
  );
}
