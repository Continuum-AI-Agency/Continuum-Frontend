'use client';

// Lectura: a campaign laid out to be READ (design C, options 20 over 4 and 19), at three sizes
// of one drawing (option 27): `chat` — a compact summary card in the conversation, changes
// first, the budget before → after and "Open in canvas"; `panel` — the companion pane at 100%
// in 640 px; `page` — the full Canvas page, wider. All three read the one campaign model
// (lib/campaign-canvas/lectura.ts). The changes come first, one card each, and a card opens in
// place into its ad set; then the daily total with its split; then one card per ad set (or a
// table past LECTURA_TABLE_THRESHOLD ad sets). Read-only: approving stays on the chat card.

import {
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Images,
  PanelRightOpen,
  PlayCircle,
} from 'lucide-react';
import * as React from 'react';
import {
  type BudgetSlice,
  humanStatus,
  type LecturaAd,
  type LecturaAdSet,
  type LecturaChange,
  type LecturaMark,
  type LecturaModel,
  type LecturaRow,
  lecturaMoney,
  prefersLecturaTable,
} from '@/lib/campaign-canvas/lectura';
import { cn } from '@/lib/utils';

const CARD_TONE: Record<LecturaMark, string> = {
  changed: 'border-[color:var(--warning)] ring-2 ring-[color:var(--warning)]/15',
  added: 'border-[color:var(--success)] bg-[color:var(--success)]/8',
  paused: 'border-[color:var(--destructive)] bg-[color:var(--destructive)]/8',
  unchanged: 'border-border',
};

const TAG: Record<LecturaMark, { label: string; className: string } | null> = {
  changed: {
    label: 'Changes',
    className: 'bg-[color:var(--warning)]/15 text-[color:var(--warning)]',
  },
  added: { label: 'New · paused', className: 'bg-[color:var(--success)] text-white' },
  paused: { label: 'Pauses', className: 'bg-[color:var(--destructive)] text-white' },
  unchanged: null,
};

const SLICE_TONE: Record<BudgetSlice['tone'], string> = {
  kept: 'bg-primary/55',
  changed: 'bg-[color:var(--warning)]',
  removed: 'bg-muted-foreground/25',
  new: 'bg-[color:var(--success)]',
};

const SLICE_LABEL: Record<BudgetSlice['tone'], string> = {
  kept: 'Unchanged',
  changed: 'Changes',
  removed: 'Stops',
  new: 'New, paused',
};

function MarkTag({ mark }: { mark: LecturaMark }) {
  const tag = TAG[mark];
  if (!tag) return null;
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-px font-mono text-[11px] leading-5',
        tag.className,
      )}
    >
      {tag.label}
    </span>
  );
}

function BeforeAfter({ before, after }: { before: string; after: string }) {
  return (
    <span className="tabular-nums">
      <span className="text-muted-foreground line-through">{before}</span>
      <span className="px-1 text-muted-foreground">→</span>
      <span className="font-semibold">{after}</span>
    </span>
  );
}

function Rows({ rows }: { rows: LecturaRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="grid gap-0.5">
      {rows.map((row) => (
        <li key={`${row.field}:${row.before}:${row.after}`} className="text-[13px]">
          <span className="text-muted-foreground">{row.label}: </span>
          <BeforeAfter before={row.before} after={row.after} />
        </li>
      ))}
    </ul>
  );
}

const KIND_ICON = { image: ImageIcon, video: PlayCircle, carousel: Images } as const;

function AdThumb({ ad }: { ad: LecturaAd }) {
  const Icon = ad.creativeKind ? KIND_ICON[ad.creativeKind] : ImageIcon;
  // A signed thumbnail URL expires; a broken image reads worse than the typed placeholder.
  const [failed, setFailed] = React.useState(false);
  return ad.thumbnailUrl && !failed ? (
    <img
      src={ad.thumbnailUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-10 shrink-0 rounded-md border border-border object-cover"
    />
  ) : (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground"
    >
      <Icon className="size-4" />
    </span>
  );
}

const ADS_SHOWN = 6;

function AdList({ ads }: { ads: LecturaAd[] }) {
  const [showAll, setShowAll] = React.useState(false);
  if (ads.length === 0) {
    return <p className="text-[13px] text-muted-foreground">No ads read</p>;
  }
  const shown = showAll ? ads : ads.slice(0, ADS_SHOWN);
  return (
    <ul className="grid gap-1.5">
      {shown.map((ad) => (
        <li
          key={ad.id}
          className={cn('flex min-w-0 items-center gap-2', ad.stops && 'opacity-55')}
          data-testid={`lectura-ad-${ad.id}`}
        >
          <AdThumb ad={ad} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{ad.name}</span>
            {ad.stops ? (
              <span className="block text-xs text-muted-foreground">Stops with its ad set</span>
            ) : ad.mark !== 'unchanged' ? (
              <span className="block text-xs text-muted-foreground">
                {TAG[ad.mark]?.label ?? null}
              </span>
            ) : null}
          </span>
        </li>
      ))}
      {ads.length > ADS_SHOWN ? (
        <li>
          <button
            type="button"
            className="text-[13px] font-medium text-primary-ink hover:underline focus-visible:underline focus-visible:outline-none"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? 'Show fewer' : `Show all ${ads.length} ads`}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function BudgetLine({ adSet, currency }: { adSet: LecturaAdSet; currency: string | null }) {
  const before = lecturaMoney(adSet.budgetBefore, currency);
  const after = lecturaMoney(adSet.budgetAfter, currency);
  if (!before && !after) return null;
  const budgetRowShown = adSet.rows.some((row) => row.field === 'daily_budget');
  if (budgetRowShown) return null;
  if (adSet.mark === 'paused' || adSet.stopsWithParent) {
    return <BeforeAfter before={`${before ?? after}/day`} after="stops" />;
  }
  return <span className="tabular-nums">{`${after ?? before}/day`}</span>;
}

function ProvenancePills({ adSet }: { adSet: LecturaAdSet }) {
  if (!adSet.provenance) return null;
  const { userGave, jainaFilled, jainaAsks } = adSet.provenance;
  return (
    <div className="flex flex-wrap gap-1">
      {userGave > 0 ? (
        <span className="rounded-full bg-sky-500/12 px-2 py-px text-xs text-sky-700 dark:text-sky-300">
          You gave {userGave}
        </span>
      ) : null}
      {jainaFilled > 0 ? (
        <span className="rounded-full bg-primary/10 px-2 py-px text-xs text-primary-ink">
          Jaina filled {jainaFilled}
        </span>
      ) : null}
      {jainaAsks > 0 ? (
        <span className="rounded-full bg-[color:var(--warning)]/15 px-2 py-px text-xs text-[color:var(--warning)]">
          Jaina asks {jainaAsks}
        </span>
      ) : null}
    </div>
  );
}

export function LecturaAdSetCard({
  adSet,
  currency,
  dimUnchanged,
}: {
  adSet: LecturaAdSet;
  currency: string | null;
  dimUnchanged: boolean;
}) {
  const stopped = adSet.mark === 'paused' || adSet.stopsWithParent;
  return (
    <article
      className={cn(
        'grid min-w-0 content-start gap-2 rounded-xl border-[1.5px] bg-card p-3 text-[13px]',
        CARD_TONE[adSet.mark],
        dimUnchanged && adSet.mark === 'unchanged' && !adSet.stopsWithParent && 'opacity-70',
      )}
      data-testid={`lectura-adset-${adSet.id}`}
      data-mark={adSet.mark}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h4 className="min-w-0 break-words text-sm font-semibold leading-snug">{adSet.name}</h4>
        <MarkTag mark={adSet.stopsWithParent ? 'paused' : adSet.mark} />
      </div>
      {adSet.basedOnName ? (
        <p className="text-xs text-[color:var(--success)]">Based on {adSet.basedOnName}</p>
      ) : null}
      <Rows rows={stopped ? adSet.rows.filter((row) => row.field !== 'status') : adSet.rows} />
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
        <BudgetLine adSet={adSet} currency={currency} />
        {adSet.audience ? <span className="min-w-0 break-words">{adSet.audience}</span> : null}
        {adSet.status && !stopped && adSet.status !== 'ACTIVE' ? (
          <span className="opacity-75">{humanStatus(adSet.status)}</span>
        ) : null}
        {adSet.stopsWithParent ? <span>Stops with its campaign</span> : null}
      </div>
      <ProvenancePills adSet={adSet} />
      <AdList ads={adSet.ads} />
    </article>
  );
}

function ChangeCard({
  change,
  adSet,
  currency,
  expanded,
  onToggle,
}: {
  change: LecturaChange;
  adSet: LecturaAdSet | null;
  currency: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <li
      className={cn('min-w-0 rounded-xl border-[1.5px] bg-card', CARD_TONE[change.mark])}
      data-testid={`lectura-change-${change.id}`}
      data-mark={change.mark}
    >
      <button
        type="button"
        className="grid w-full min-w-0 gap-1 rounded-xl p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default"
        aria-expanded={adSet ? expanded : undefined}
        onClick={onToggle}
        disabled={!adSet}
      >
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{change.campaignName}</span>
            {change.adSetName ? (
              <>
                <span aria-hidden>›</span>
                <span className="min-w-0 max-w-[65%] shrink-0 truncate font-medium text-foreground/80">
                  {change.adSetName}
                </span>
              </>
            ) : null}
          </span>
          <MarkTag mark={change.mark} />
        </span>
        <span className="flex min-w-0 items-start gap-1.5">
          {adSet ? <Chevron className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
          <span className="min-w-0 break-words text-sm font-semibold leading-snug">
            {change.title}
          </span>
        </span>
        <Rows
          rows={change.rows.filter((row) => row.field !== 'status' || change.mark === 'changed')}
        />
        {change.basis ? (
          <span className="text-[13px] text-muted-foreground">{change.basis}</span>
        ) : null}
      </button>
      {expanded && adSet ? (
        <div
          className="border-t border-border/70 p-2"
          data-testid={`lectura-change-${change.id}-expanded`}
        >
          <LecturaAdSetCard adSet={adSet} currency={currency} dimUnchanged={false} />
        </div>
      ) : null}
    </li>
  );
}

function BudgetBand({ model }: { model: LecturaModel }) {
  const { before, after, newWhenActivated } = model.totals;
  const currency = model.currency;
  if (after === null && before === null && newWhenActivated === 0) return null;
  const total = model.split.reduce((sum, slice) => sum + slice.minor, 0);
  const tones = [...new Set(model.split.map((slice) => slice.tone))];
  return (
    <section
      className="grid gap-2 rounded-xl border border-border bg-card p-3"
      aria-label="Daily budget"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Daily budget
        </span>
        <span className="text-[15px] font-semibold tabular-nums">
          {model.kind === 'change' && before !== null && after !== null && before !== after ? (
            <BeforeAfter
              before={lecturaMoney(before, currency) ?? ''}
              after={`${lecturaMoney(after, currency)}/day`}
            />
          ) : (
            `${lecturaMoney(after ?? before, currency)}/day`
          )}
        </span>
      </div>
      {newWhenActivated > 0 ? (
        <p className="text-[13px] text-muted-foreground">
          +{lecturaMoney(newWhenActivated, currency)}/day once the new, paused items are activated
        </p>
      ) : null}
      {total > 0 ? (
        <>
          <div
            className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
            data-testid="lectura-split"
          >
            {model.split.map((slice) => (
              <span
                key={slice.id}
                title={`${slice.name}: ${lecturaMoney(slice.minor, currency)}`}
                className={cn('h-full min-w-1', SLICE_TONE[slice.tone])}
                style={{ flexGrow: slice.minor, flexBasis: 0 }}
                data-tone={slice.tone}
              />
            ))}
          </div>
          {tones.length > 1 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {tones.map((tone) => (
                <span key={tone} className="inline-flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', SLICE_TONE[tone])} />
                  {SLICE_LABEL[tone]}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function LecturaTable({ model }: { model: LecturaModel }) {
  return (
    <div
      className="overflow-x-auto rounded-xl border border-border bg-card"
      data-testid="lectura-table"
    >
      <table className="w-full min-w-[520px] border-collapse text-[13px] tabular-nums">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Ad set</th>
            <th className="px-3 py-2 font-medium">Budget/day</th>
            <th className="px-3 py-2 font-medium">Change</th>
            <th className="px-3 py-2 text-right font-medium">Ads</th>
          </tr>
        </thead>
        <tbody>
          {model.campaigns.map((campaign) => (
            <React.Fragment key={campaign.id}>
              <tr className="border-t border-border bg-muted/50">
                <td colSpan={4} className="px-3 py-2 font-semibold">
                  {campaign.name}
                </td>
              </tr>
              {campaign.adSets.map((adSet) => {
                const stopped = adSet.mark === 'paused' || adSet.stopsWithParent;
                return (
                  <tr
                    key={adSet.id}
                    className={cn(
                      'border-t border-border',
                      adSet.mark === 'changed' && 'bg-[color:var(--warning)]/10',
                      adSet.mark === 'added' && 'bg-[color:var(--success)]/10',
                      stopped && 'bg-[color:var(--destructive)]/8',
                    )}
                    data-testid={`lectura-row-${adSet.id}`}
                    data-mark={adSet.mark}
                  >
                    <td className="max-w-[220px] px-3 py-2">
                      <span className="block break-words font-medium">{adSet.name}</span>
                      {adSet.basedOnName ? (
                        <span className="block text-xs text-[color:var(--success)]">
                          Based on {adSet.basedOnName}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {stopped && adSet.budgetBefore !== null ? (
                        <BeforeAfter
                          before={lecturaMoney(adSet.budgetBefore, model.currency) ?? ''}
                          after="stops"
                        />
                      ) : adSet.budgetBefore !== null &&
                        adSet.budgetAfter !== null &&
                        adSet.budgetBefore !== adSet.budgetAfter ? (
                        <BeforeAfter
                          before={lecturaMoney(adSet.budgetBefore, model.currency) ?? ''}
                          after={lecturaMoney(adSet.budgetAfter, model.currency) ?? ''}
                        />
                      ) : (
                        (lecturaMoney(adSet.budgetAfter ?? adSet.budgetBefore, model.currency) ??
                        '—')
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {stopped ? (
                        <span className="text-[color:var(--destructive)]">
                          {adSet.stopsWithParent ? 'Stops with campaign' : 'Pauses'}
                        </span>
                      ) : adSet.mark === 'added' ? (
                        <span className="text-[color:var(--success)]">New, paused</span>
                      ) : adSet.rows.length > 0 ? (
                        adSet.rows
                          .filter((row) => row.field !== 'daily_budget')
                          .map((row) => row.label)
                          .join(' · ') || 'Budget'
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{adSet.ads.length}</td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type LecturaLayout = 'cards' | 'table';

/** One drawing, three sizes: the chat's summary card, the companion pane, the Canvas page. */
export type CampaignViewSize = 'chat' | 'panel' | 'page';

/** The chat keeps the first few changes; the rest wait behind "Open in canvas". */
export const CHAT_CHANGES_SHOWN = 3;

/** The daily total as one line: "$1,150 → $1,000/day", or "$600/day". */
function BudgetSummary({ model }: { model: LecturaModel }) {
  const { before, after, newWhenActivated } = model.totals;
  if (before === null && after === null) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
      <span className="text-muted-foreground">Daily budget</span>
      <span className="font-semibold tabular-nums">
        {before !== null && after !== null && before !== after ? (
          <BeforeAfter
            before={lecturaMoney(before, model.currency) ?? ''}
            after={`${lecturaMoney(after, model.currency)}/day`}
          />
        ) : (
          `${lecturaMoney(after ?? before, model.currency)}/day`
        )}
      </span>
      {newWhenActivated > 0 ? (
        <span className="text-xs text-muted-foreground">
          +{lecturaMoney(newWhenActivated, model.currency)} once activated
        </span>
      ) : null}
    </p>
  );
}

/**
 * The chat's size: the changes first (no expanding — the canvas is one click away), the
 * budget before → after, and "Open in canvas". Drawn by the same pieces as the pane.
 */
export function LecturaChatCard({
  model,
  title,
  onOpen,
}: {
  model: LecturaModel;
  title?: string | null;
  onOpen?: () => void;
}) {
  const shown = model.changes.slice(0, CHAT_CHANGES_SHOWN);
  const more = model.changes.length - shown.length;
  return (
    <section
      className="grid min-w-0 gap-2.5 rounded-xl border border-border bg-card p-3"
      data-testid="lectura-chat-card"
      data-size="chat"
      aria-label={title ?? 'Campaign changes'}
    >
      <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h3 className="min-w-0 break-words text-sm font-semibold leading-snug">
          {title ?? model.campaigns[0]?.name ?? 'Campaign'}
        </h3>
        {/* A given title (Jaina's subject) already counts the changes; the campaign name does not. */}
        <span className={cn('text-xs text-muted-foreground', title && 'sr-only')}>
          {model.changes.length === 0
            ? `${model.adSetCount} ${model.adSetCount === 1 ? 'ad set' : 'ad sets'}`
            : model.changes.length === 1
              ? '1 change'
              : `${model.changes.length} changes`}
        </span>
      </header>
      {shown.length > 0 ? (
        <ul className="grid gap-1.5">
          {shown.map((change) => (
            <ChangeCard
              key={change.id}
              change={change}
              adSet={null}
              currency={model.currency}
              expanded={false}
              onToggle={() => {}}
            />
          ))}
        </ul>
      ) : null}
      {more > 0 ? (
        <p className="text-xs text-muted-foreground">
          +{more} more {more === 1 ? 'change' : 'changes'} in the canvas
        </p>
      ) : null}
      <BudgetSummary model={model} />
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] font-medium text-primary-ink hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
          data-testid="lectura-open-in-canvas"
        >
          <PanelRightOpen className="size-3.5" aria-hidden />
          Open in canvas
        </button>
      ) : null}
    </section>
  );
}

export function LecturaView({
  model,
  initialExpandedId = null,
  initialLayout,
  size = 'panel',
  title,
  onOpen,
}: {
  model: LecturaModel;
  initialExpandedId?: string | null;
  initialLayout?: LecturaLayout;
  size?: CampaignViewSize;
  /** `chat` only: the card's heading (defaults to the campaign name). */
  title?: string | null;
  /** `chat` only: opens the companion canvas on this campaign. */
  onOpen?: () => void;
}) {
  if (size === 'chat') return <LecturaChatCard model={model} title={title} onOpen={onOpen} />;
  return (
    <LecturaPane
      model={model}
      initialExpandedId={initialExpandedId}
      initialLayout={initialLayout}
      size={size}
    />
  );
}

function LecturaPane({
  model,
  initialExpandedId,
  initialLayout,
  size,
}: {
  model: LecturaModel;
  initialExpandedId: string | null;
  initialLayout?: LecturaLayout;
  size: Exclude<CampaignViewSize, 'chat'>;
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(initialExpandedId);
  const [layout, setLayout] = React.useState<LecturaLayout>(
    initialLayout ?? (prefersLecturaTable(model) ? 'table' : 'cards'),
  );
  const adSetById = React.useMemo(
    () =>
      new Map(
        model.campaigns.flatMap((campaign) => campaign.adSets.map((adSet) => [adSet.id, adSet])),
      ),
    [model],
  );
  // A live edit and a campaign copy both carry changes; a brand-new campaign carries none.
  const showChanges = model.changes.length > 0;
  const multiCampaign = model.campaigns.length > 1;

  return (
    <div
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-background"
      data-testid="lectura-view"
      data-kind={model.kind}
      data-size={size}
    >
      <div
        className={cn(
          '@container mx-auto grid w-full gap-4 p-3 sm:p-4',
          size === 'page' ? 'max-w-6xl pt-16' : 'max-w-3xl',
        )}
      >
        {showChanges ? (
          <section className="grid gap-2" aria-label="Changes">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {model.changes.length === 1 ? '1 change' : `${model.changes.length} changes`}
            </h3>
            <ul className="grid gap-2">
              {model.changes.map((change) => {
                const adSet = change.adSetId ? (adSetById.get(change.adSetId) ?? null) : null;
                return (
                  <ChangeCard
                    key={change.id}
                    change={change}
                    adSet={adSet}
                    currency={model.currency}
                    expanded={expandedId === change.id}
                    onToggle={() =>
                      setExpandedId((current) => (current === change.id ? null : change.id))
                    }
                  />
                );
              })}
            </ul>
          </section>
        ) : null}

        <BudgetBand model={model} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {showChanges ? 'Whole campaign · ' : ''}
            {model.adSetCount === 1 ? '1 ad set' : `${model.adSetCount} ad sets`}
          </h3>
          <fieldset
            aria-label="Layout"
            className="inline-flex rounded-lg border border-border bg-card p-0.5 text-[13px]"
          >
            {(['cards', 'table'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={layout === value}
                onClick={() => setLayout(value)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-primary',
                  layout === value ? 'bg-primary/12 text-primary-ink' : 'text-muted-foreground',
                )}
              >
                {value === 'cards' ? 'Cards' : 'Table'}
              </button>
            ))}
          </fieldset>
        </div>

        {layout === 'table' ? (
          <LecturaTable model={model} />
        ) : (
          model.campaigns.map((campaign) => (
            <section key={campaign.id} className="grid gap-2" aria-label={campaign.name}>
              {multiCampaign || model.kind === 'new' || campaign.mark !== 'unchanged' ? (
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <h4 className="min-w-0 break-words text-sm font-semibold">{campaign.name}</h4>
                  <MarkTag mark={campaign.mark} />
                </div>
              ) : null}
              {campaign.adSets.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No ad sets yet</p>
              ) : (
                <div
                  className={cn(
                    'grid grid-cols-1 gap-2.5 @min-[560px]:grid-cols-2',
                    size === 'page' && '@min-[960px]:grid-cols-3',
                  )}
                >
                  {campaign.adSets.map((adSet) => (
                    <LecturaAdSetCard
                      key={adSet.id}
                      adSet={adSet}
                      currency={model.currency}
                      dimUnchanged={showChanges}
                    />
                  ))}
                </div>
              )}
            </section>
          ))
        )}

        {model.truncated ? (
          <p className="text-[13px] text-muted-foreground">
            Large campaign: only the first items were read.
          </p>
        ) : null}
      </div>
    </div>
  );
}
