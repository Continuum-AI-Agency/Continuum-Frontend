'use client';

// An audience proposal, opened. Read in the order a person decides in: first, when the row
// failed, what failed and the one button that fixes it; then the comparison — the ad set's
// audience today beside the proposed one, every change coloured in place; then a rail of
// small tiles (why, new to the portfolio, launch plan, ads); and under them the one
// decision: create the new ad set. Every state of the proposal row keeps the same frame,
// from "the daily analysis has not run yet" through a blocked proposal (the reason where the
// proposed audience would be, the button visibly off) to "here is what Meta now holds".

import type {
  AdSetSnapshot,
  AudienceProposalBlock,
  AudienceProposalCreative,
  AudienceProposalPlan,
  ConvertCboResponse,
  RecommendationRow,
} from '@continuum/contracts';
import { adsManagerUrls, clampBudgetMinorUnits } from '@continuum/contracts';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RotateCwIcon,
  SparklesIcon,
  UndoIcon,
} from 'lucide-react';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { usePaidCreativeRecovery } from '@/hooks/usePaidCreativeRecovery';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../format';
import * as typeScale from '../typeScale';
import {
  type AudienceActionHandlers,
  type AudienceCardView,
  type AudienceChip,
  type AudienceNovelty,
  audienceComparison,
  audienceNovelty,
  type ComparisonCell,
  implementationLines,
  implementedRows,
  majorUnits,
  minorUnits,
  noveltySummary,
  type PortfolioAdsetSpec,
  type ProposalFailure,
  reaskThrottledNote,
  triggerLabel,
} from './audienceCardModel';
import { evidenceLine, queueHeadlineLine } from './recQueueModel';

export type AudienceRecommendationCardProps = {
  rec: RecommendationRow;
  adsetName: string | null;
  snapshot: AdSetSnapshot | null;
  view: AudienceCardView;
  /** The portfolio's enrolled ad sets with their live targeting, for "New to the portfolio". */
  portfolioSpecs: readonly PortfolioAdsetSpec[];
  currency: string | null;
  /** Recovers the plan's expiring creative thumbnails through the Jaina preview endpoint. */
  brandId: string;
  adAccountId: string;
  onRequest: (handlers?: AudienceActionHandlers) => void;
  requesting: boolean;
  /** Re-run the Meta write a failed row stopped at. */
  onRetry: (handlers?: AudienceActionHandlers) => void;
  retrying: boolean;
  onApprove: (input: { budgetMinorUnits: number; activate: boolean }) => void;
  approving: boolean;
  onCancel: () => void;
  onActivate: () => void;
  onUndo: () => void;
  busy: boolean;
  /** CBO fix: dry-run first (preview), then the real conversion. */
  onConvertCbo: (campaignId: string, dryRun: boolean) => void;
  convertingCbo: boolean;
  cboPreview: ConvertCboResponse | null;
  resultWord: string;
};

/** The card's buttons, one size up from the dense `sm` default. */
const ROOMY_BUTTON = 'h-8 px-3 text-sm';

const ASK_AGAIN = 'Ask Jaina again';

/** Where a Meta connection that can read but not write gets fixed — the same place the
 *  integration error banner sends a missing-permissions account. */
export const META_CONNECTION_HREF = '/settings?section=integrations';

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

function TileLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h4 className={cn(typeScale.label, 'text-muted-foreground', className)}>{children}</h4>;
}

/** One small rail tile: a label and a few short lines. */
function RailTile({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="grid min-w-0 snap-start content-start gap-1.5 rounded-lg border border-border bg-card p-3"
      data-testid={testId}
    >
      <TileLabel>{label}</TileLabel>
      {children}
    </section>
  );
}

// ── Before → after ─────────────────────────────────────────────────────────────────────

const CHIP_TONE: Record<AudienceChip['tone'], string> = {
  added: 'border-transparent bg-success/10 text-emerald-700 dark:text-emerald-300',
  removed: 'border-transparent bg-destructive/10 text-red-700 dark:text-red-300',
  kept: 'border-border text-muted-foreground',
};

const CHIP_SIGN: Record<AudienceChip['tone'], string> = { added: '+', removed: '−', kept: '' };

function Chip({ chip }: { chip: AudienceChip }) {
  return (
    <Badge
      className={cn('max-w-full whitespace-normal text-left', CHIP_TONE[chip.tone])}
      data-testid="audience-chip"
      data-tone={chip.tone}
      variant="outline"
    >
      {CHIP_SIGN[chip.tone] ? <span aria-hidden="true">{CHIP_SIGN[chip.tone]}</span> : null}
      <span className="min-w-0 break-words">{chip.name}</span>
      {chip.isNew ? (
        <span
          className="rounded-sm bg-primary px-1 font-semibold text-primary-foreground text-xs leading-4"
          data-testid="audience-chip-new"
          title="No other ad set in the portfolio uses it"
        >
          NEW
        </span>
      ) : null}
    </Badge>
  );
}

function Cell({ cell }: { cell: ComparisonCell }) {
  if (cell.kind === 'text') return <span className="text-foreground">{cell.text}</span>;
  if (cell.chips.length === 0) return <span className="text-muted-foreground">{cell.empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {cell.chips.map((chip) => (
        <Chip chip={chip} key={`${chip.tone}:${chip.name}`} />
      ))}
    </div>
  );
}

function FacetList({ rows }: { rows: readonly { label: string; cell: ComparisonCell }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
      {rows.map((row) => (
        <React.Fragment key={row.label}>
          <dt className="pt-0.5 text-muted-foreground text-xs">{row.label}</dt>
          <dd className="min-w-0 break-words">
            <Cell cell={row.cell} />
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function BeforeAfter({
  plan,
  snapshot,
  novelty,
  state,
  block,
}: {
  plan: AudienceProposalPlan | null;
  snapshot: AdSetSnapshot | null;
  novelty: AudienceNovelty | null;
  state: AudienceCardView['state'];
  block: AudienceProposalBlock | null;
}) {
  const comparison = plan ? audienceComparison(plan, novelty) : null;
  const frequency =
    snapshot?.frequency7d != null ? `freq ${snapshot.frequency7d.toFixed(1)} / 7 days` : null;
  const currentFooter = [comparison?.currentReach ?? null, frequency].filter(Boolean).join(' · ');
  return (
    <div
      className="grid gap-3 @2xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
      data-testid="audience-before-after"
    >
      <section
        className="grid min-w-0 content-start gap-2 rounded-lg border border-border bg-card p-3"
        data-testid="audience-current"
      >
        <TileLabel>Current audience</TileLabel>
        {comparison?.hasPrevious ? (
          <FacetList
            rows={comparison.rows.map((row) => ({ label: row.label, cell: row.current }))}
          />
        ) : (
          <Muted>
            {snapshot?.audienceType
              ? `No record of the current targeting; the ad set is ${snapshot.audienceType}.`
              : 'No record of the current targeting.'}
          </Muted>
        )}
        {currentFooter ? (
          <p className="text-muted-foreground text-xs tabular-nums">{currentFooter}</p>
        ) : null}
      </section>
      <div aria-hidden="true" className="grid place-items-center text-muted-foreground">
        <ArrowRightIcon className="size-4 rotate-90 @2xl:rotate-0" />
      </div>
      <section
        className="grid min-w-0 content-start gap-2 rounded-lg border border-primary/60 bg-card p-3"
        data-testid="audience-proposed"
      >
        <TileLabel className="text-primary">Proposed audience</TileLabel>
        {comparison ? (
          <>
            <FacetList
              rows={comparison.rows.map((row) => ({ label: row.label, cell: row.proposed }))}
            />
            {comparison.proposedReach ? (
              <p className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                <span className="font-semibold text-foreground">{comparison.proposedReach}</span>
                {comparison.reachChange ? (
                  <Badge
                    className={
                      comparison.reachChange.up ? 'bg-success/10' : 'bg-muted text-muted-foreground'
                    }
                    variant={comparison.reachChange.up ? 'success' : 'muted'}
                  >
                    {comparison.reachChange.label}
                  </Badge>
                ) : null}
              </p>
            ) : null}
            {comparison.exclusionWarning ? (
              <Badge
                className="max-w-full whitespace-normal bg-warning/10 text-left"
                data-testid="audience-exclusion-warning"
                variant="warning"
              >
                <AlertTriangleIcon aria-hidden="true" />
                {comparison.exclusionWarning}
              </Badge>
            ) : null}
          </>
        ) : (
          <WhatAudience block={block} plan={null} state={state} />
        )}
      </section>
    </div>
  );
}

// ── The proposal's state where the proposed audience would be ─────────────────────────

/** The proposal's state where the proposed audience would be: the queue, Jaina reading, the
 *  block with its reason, or the invitation to ask. A plan is read by the before → after; a
 *  failure by the failure block above it. Shared with the asked-for row's inline panel, so a
 *  proposal reads the same on the row that asked for it and on the card that decides it. */
export function WhatAudience({
  plan,
  state,
  block,
}: {
  plan: AudienceProposalPlan | null;
  state: AudienceCardView['state'];
  block: AudienceProposalBlock | null;
}) {
  if (plan) return <Muted>The proposed audience is in the comparison.</Muted>;
  if (state === 'blocked' || state === 'blocked_cbo') {
    return (
      <div className="space-y-1.5">
        <Badge className={typeScale.label} variant="warning">
          Blocked
        </Badge>
        <p className="text-foreground text-sm" data-testid="audience-blocked-reason">
          {block?.message ?? "The proposal couldn't be put together."}
        </p>
      </div>
    );
  }
  if (state === 'queued' || state === 'proposing') {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2Icon className="size-3.5 animate-spin" />
        {state === 'queued'
          ? 'Queued: Jaina picks it up in under a minute.'
          : 'Jaina is reading the audience, the catalogue and the creatives…'}
      </p>
    );
  }
  if (state === 'failed') return <Muted>No proposal to show — what failed is above.</Muted>;
  return (
    <Muted>
      Jaina proposes it with the optimizer's daily cycle for this ad set. Ask now to have it today.
    </Muted>
  );
}

// ── What failed ────────────────────────────────────────────────────────────────────────

export type ActionNotice = { tone: 'info' | 'error'; text: string };

export function NoticeLine({ notice }: { notice: ActionNotice | null }) {
  if (!notice) return null;
  return (
    <p
      className={cn(
        'text-sm',
        notice.tone === 'error' ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground',
      )}
      data-testid="audience-action-notice"
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      {notice.text}
    </p>
  );
}

/** A failed row, always visible, whatever else the card shows: what failed (bold), why in
 *  one sentence, Meta's own words when it gave some, what exists in Meta now, and the button
 *  that fixes it — a retry of the Meta write when the plan is sound, a fresh ask otherwise. */
export function ProposalFailureBlock({
  failure,
  onRetry,
  retrying,
  onReask,
  requesting,
  notice,
  reaskTestId = 'audience-reask',
}: {
  failure: ProposalFailure;
  onRetry: (() => void) | null;
  retrying: boolean;
  onReask: (() => void) | null;
  requesting: boolean;
  notice: ActionNotice | null;
  reaskTestId?: string;
}) {
  const retry = failure.action === 'retry' ? onRetry : null;
  return (
    <div
      className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm"
      data-testid="audience-failure"
      role="alert"
    >
      <p className="text-foreground">
        <span className="font-semibold">{failure.headline}</span>{' '}
        <span data-testid="audience-failed-reason">{failure.reason}</span>
      </p>
      {failure.metaSaid ? (
        <p className="text-muted-foreground text-xs" data-testid="audience-meta-said">
          Meta said: “{failure.metaSaid}”
        </p>
      ) : null}
      <p className="text-muted-foreground">{failure.outcome}</p>
      <div className="flex flex-wrap items-center gap-2">
        {retry ? (
          <Button
            className={ROOMY_BUTTON}
            data-testid="audience-retry"
            disabled={retrying}
            onClick={retry}
            size="sm"
            type="button"
          >
            {retrying ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <RotateCwIcon className="size-3.5" />
            )}
            Retry in Meta
          </Button>
        ) : onReask ? (
          <Button
            className={ROOMY_BUTTON}
            data-testid={reaskTestId}
            disabled={requesting}
            onClick={onReask}
            size="sm"
            type="button"
            variant="secondary"
          >
            {requesting ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="size-3.5" />
            )}
            {ASK_AGAIN}
          </Button>
        ) : null}
        {failure.checkConnection ? (
          <a
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), ROOMY_BUTTON)}
            data-testid="audience-check-connection"
            href={META_CONNECTION_HREF}
          >
            Check Meta connection
          </a>
        ) : null}
      </div>
      <NoticeLine notice={notice} />
    </div>
  );
}

// ── The rail ───────────────────────────────────────────────────────────────────────────

function WhyTile({
  plan,
  rec,
  currency,
}: {
  plan: AudienceProposalPlan | null;
  rec: RecommendationRow;
  currency: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const evidence = queueHeadlineLine(rec, currency) ?? evidenceLine(rec.evidence, currency);
  return (
    <RailTile label="Why" testId="audience-why">
      <p className="text-sm">
        <span className="font-semibold text-foreground">{triggerLabel(rec.trigger)}.</span>{' '}
        <span className="text-foreground">{plan ? plan.diagnosis : (rec.reason ?? '')}</span>
      </p>
      {evidence ? <p className="text-muted-foreground text-xs tabular-nums">{evidence}</p> : null}
      {plan?.rationale ? (
        <Collapsible onOpenChange={setOpen} open={open}>
          <CollapsibleContent>
            <p className="text-muted-foreground text-sm">{plan.rationale}</p>
          </CollapsibleContent>
          <CollapsibleTrigger className="text-primary text-xs underline-offset-2 hover:underline">
            {open ? 'Read less' : 'Read more'}
          </CollapsibleTrigger>
        </Collapsible>
      ) : null}
    </RailTile>
  );
}

function NoveltyTile({ novelty }: { novelty: AudienceNovelty | null }) {
  if (!novelty) {
    return (
      <RailTile label="New to the portfolio" testId="audience-new">
        <Muted>Known once there is a proposal.</Muted>
      </RailTile>
    );
  }
  const summary = noveltySummary(novelty);
  const hasLists = novelty.fresh.length + novelty.reused.length + novelty.excludedByRule.length > 0;
  return (
    <RailTile label="New to the portfolio" testId="audience-new">
      <p className="font-semibold text-foreground text-sm tabular-nums">{summary.headline}</p>
      <p className="text-muted-foreground text-xs">{summary.basis}</p>
      {summary.counts ? (
        <p className="text-muted-foreground text-xs tabular-nums">{summary.counts}</p>
      ) : null}
      {hasLists ? (
        <Collapsible>
          <CollapsibleTrigger className="inline-flex items-center gap-1 text-primary text-xs underline-offset-2 hover:underline">
            <ChevronDownIcon className="size-3.5" /> See the list
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div
              className="mt-1.5 max-h-40 space-y-2 overflow-y-auto pr-1 text-xs"
              data-testid="audience-novelty-list"
            >
              {novelty.fresh.length > 0 ? (
                <ul className="space-y-1" data-testid="audience-fresh">
                  {novelty.fresh.map((item) => (
                    <li className="text-foreground" key={`${item.kindLabel}:${item.name}`}>
                      {item.name}
                      <span className="text-muted-foreground">
                        {' '}
                        · {item.kindLabel} · unused today
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {novelty.reused.length > 0 ? (
                <ul className="space-y-1" data-testid="audience-reused">
                  {novelty.reused.map((item) => (
                    <li className="text-muted-foreground" key={`${item.kindLabel}:${item.name}`}>
                      {item.name} already runs in {item.usedIn.join(', ')}
                    </li>
                  ))}
                </ul>
              ) : null}
              {novelty.excludedByRule.length > 0 ? (
                <ul className="space-y-1" data-testid="audience-excluded">
                  {novelty.excludedByRule.map((item) => (
                    <li className="text-muted-foreground" key={item.name}>
                      <span className="line-through">{item.name}</span> · filtered by a brand rule:{' '}
                      {item.rule}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </RailTile>
  );
}

function LaunchPlanTile({
  plan,
  state,
  currency,
  startActive,
}: {
  plan: AudienceProposalPlan | null;
  state: AudienceCardView['state'];
  currency: string | null;
  startActive: boolean;
}) {
  return (
    <RailTile label="Launch plan" testId="audience-how">
      {plan ? (
        <dl className="space-y-1.5 text-sm">
          {implementationLines(plan, currency, startActive).map((line) => (
            <div key={line.label}>
              <dt className="text-muted-foreground text-xs">{line.label}</dt>
              <dd className="min-w-0 break-words text-foreground">{line.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Muted>
          {state === 'blocked' || state === 'blocked_cbo'
            ? 'Nothing is created while the proposal is blocked.'
            : 'A new ad set, paused, next to the current one; the current one keeps running.'}
        </Muted>
      )}
    </RailTile>
  );
}

/** A plan creative's poster. The poster is a signed Meta CDN URL that expires, so a failed
 *  load asks the Jaina preview endpoint for a fresh one (usePaidCreativeRecovery — the same
 *  path the verdict thumbnails take); when nothing loads the tile is the rank, never a
 *  broken image with its alt text. */
function PlanCreativeThumb({
  creative,
  freshUrl,
  onRecover,
}: {
  creative: AudienceProposalCreative;
  freshUrl: string | null;
  onRecover: (adId: string) => void;
}) {
  const src = freshUrl ?? creative.poster_url;
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!creative.poster_url) onRecover(creative.ad_id);
  }, [creative.ad_id, creative.poster_url, onRecover]);
  if (!src || failedSrc === src) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded-md border border-border/60 border-dashed text-muted-foreground text-xs tabular-nums"
        data-testid="audience-ad-placeholder"
      >
        #{creative.rank}
      </div>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: signed, expiring Meta CDN URL; next/image cannot proxy it.
    <img
      alt=""
      className="aspect-square w-full rounded-md border border-border/60 object-cover"
      loading="lazy"
      onError={() => {
        setFailedSrc(src);
        onRecover(creative.ad_id);
      }}
      referrerPolicy="no-referrer"
      src={src}
    />
  );
}

function AdsTile({
  plan,
  currency,
  brandId,
  adAccountId,
}: {
  plan: AudienceProposalPlan;
  currency: string | null;
  brandId: string;
  adAccountId: string;
}) {
  const { freshUrlById, recover } = usePaidCreativeRecovery({ brandId, adAccountId });
  return (
    <RailTile label={`Ads · ${plan.creatives.length}`} testId="audience-ads">
      {plan.creatives.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {plan.creatives.map((creative) => (
            <li
              className="min-w-0"
              key={creative.creative_id}
              title={creative.ad_name ?? creative.ad_id}
            >
              <PlanCreativeThumb
                creative={creative}
                freshUrl={freshUrlById[creative.ad_id] ?? null}
                onRecover={recover}
              />
              <p className="mt-1 truncate text-foreground text-xs tabular-nums">
                {creative.cost_per_event != null
                  ? formatCurrency(creative.cost_per_event, currency)
                  : '—'}
              </p>
              <p className="truncate text-muted-foreground text-xs tabular-nums">
                {creative.events} results
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Muted>None with enough results yet.</Muted>
      )}
      {plan.creatives_disclosure ? (
        <p className="text-muted-foreground text-xs">{plan.creatives_disclosure}</p>
      ) : null}
    </RailTile>
  );
}

// ── The card ───────────────────────────────────────────────────────────────────────────

export function AudienceRecommendationCard(props: AudienceRecommendationCardProps) {
  const { rec, view, currency, adAccountId, portfolioSpecs } = props;
  const { plan, state, block, result, row, failure } = view;
  const [budgetMajor, setBudgetMajor] = React.useState<string>('');
  const [activate, setActivate] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionNotice | null>(null);
  React.useEffect(() => {
    if (plan) setBudgetMajor(String(majorUnits(plan.budget.suggested_minor_units)));
  }, [plan]);

  const novelty = React.useMemo(
    () => (plan ? audienceNovelty(plan, portfolioSpecs) : null),
    [plan, portfolioSpecs],
  );
  const budgetMinor = plan
    ? clampBudgetMinorUnits(minorUnits(Number(budgetMajor) || 0), plan.budget.bounds)
    : 0;
  const budgetClamped = plan ? budgetMinor !== minorUnits(Number(budgetMajor) || 0) : false;
  const urls = result
    ? adsManagerUrls({
        adAccountId,
        campaignId: result.campaign?.id ?? plan?.source.campaign_id ?? null,
        adsetId: result.adset?.id ?? null,
        adIds: result.ads.map((ad) => ad.id),
      })
    : null;

  const onError = (message: string) => setNotice({ tone: 'error', text: message });
  const ask = () => {
    setNotice(null);
    props.onRequest({
      onDone: (proposalId) => {
        const throttled = reaskThrottledNote(proposalId, row);
        setNotice(throttled ? { tone: 'info', text: throttled } : null);
      },
      onError,
    });
  };
  const retry = () => {
    setNotice(null);
    props.onRetry({ onError });
  };
  const askButton = (label: string, variant: 'secondary' | 'ghost' = 'secondary') => (
    <Button
      className={ROOMY_BUTTON}
      disabled={props.requesting}
      onClick={ask}
      size="sm"
      type="button"
      variant={variant}
    >
      {props.requesting ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <SparklesIcon className="size-3.5" />
      )}
      {label}
    </Button>
  );

  return (
    <div className="@container space-y-4" data-testid="audience-recommendation-card">
      {failure ? (
        <ProposalFailureBlock
          failure={failure}
          notice={notice}
          onReask={ask}
          onRetry={retry}
          requesting={props.requesting}
          retrying={props.retrying}
        />
      ) : null}

      <BeforeAfter
        block={block}
        novelty={novelty}
        plan={plan}
        snapshot={props.snapshot}
        state={state}
      />

      <div
        className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1 snap-x snap-mandatory"
        data-testid="audience-rail"
      >
        <WhyTile currency={currency} plan={plan} rec={rec} />
        <NoveltyTile novelty={novelty} />
        <LaunchPlanTile currency={currency} plan={plan} startActive={activate} state={state} />
        {plan ? (
          <AdsTile
            adAccountId={adAccountId}
            brandId={props.brandId}
            currency={currency}
            plan={plan}
          />
        ) : null}
      </div>

      {/* The decision */}
      <section className="space-y-3 border-border/50 border-t pt-4" data-testid="audience-decision">
        {state === 'none' ? askButton('Ask Jaina now') : null}

        {state === 'blocked_cbo' && block ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-foreground">This campaign holds the budget</p>
            <Muted>
              Recommendations need a daily budget per ad set to set the pace and compare ad sets.
              Convert the campaign, then ask Jaina for the proposal again.
            </Muted>
            {props.cboPreview?.ok && props.cboPreview.dryRun !== false ? (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="mb-1 font-medium text-foreground">
                  Preview: {props.cboPreview.adset_budgets.length} ad set
                  {props.cboPreview.adset_budgets.length === 1 ? '' : 's'} with a daily budget of
                  their own
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  {props.cboPreview.adset_budgets.slice(0, 6).map((b) => (
                    <li className="truncate" key={b.adset_id}>
                      {b.adset_name ?? b.adset_id} ·{' '}
                      {formatCurrency(b.daily_major, props.cboPreview?.currency ?? currency)}/day
                    </li>
                  ))}
                </ul>
                <Button
                  className={cn('mt-2', ROOMY_BUTTON)}
                  disabled={props.convertingCbo || !block.campaign_id}
                  onClick={() => block.campaign_id && props.onConvertCbo(block.campaign_id, false)}
                  size="sm"
                  type="button"
                >
                  {props.convertingCbo ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                  Convert the campaign to ad set budgets
                </Button>
              </div>
            ) : props.cboPreview?.ok && props.cboPreview.dryRun === false ? (
              <p className="text-foreground">
                Converted{props.cboPreview.deduped ? ' (already today)' : ''}. Ask Jaina for the
                proposal again.
              </p>
            ) : (
              <Button
                className={ROOMY_BUTTON}
                disabled={props.convertingCbo || !block.campaign_id}
                onClick={() => block.campaign_id && props.onConvertCbo(block.campaign_id, true)}
                size="sm"
                type="button"
                variant="secondary"
              >
                {props.convertingCbo ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                Preview the conversion
              </Button>
            )}
            {askButton(ASK_AGAIN, 'ghost')}
          </div>
        ) : null}

        {state === 'blocked' ? (
          <div className="space-y-3 text-sm">
            {/* The decision this section exists for, visibly off, with the reason in the
                proposed tile above — a blocked proposal must read as blocked here, not as a
                frame with nothing at the end. Same control a ready proposal offers. */}
            <Button
              className={ROOMY_BUTTON}
              data-testid="audience-create-blocked"
              disabled
              size="sm"
              title={block?.message}
              type="button"
            >
              Create the new ad set (paused)
            </Button>
            {rec.status === 'pending' ? (
              askButton(ASK_AGAIN)
            ) : (
              <Muted>
                The cycle already closed this recommendation, so it can't be asked for again from
                here.
              </Muted>
            )}
          </div>
        ) : null}

        {state === 'ready' && plan ? (
          <div className="space-y-3 text-sm">
            <label className="block space-y-1" htmlFor={`budget-${rec.id}`}>
              <span className="text-muted-foreground">Daily budget ({plan.budget.currency})</span>
              <Input
                className="h-8 max-w-48 text-sm"
                id={`budget-${rec.id}`}
                inputMode="decimal"
                onChange={(event) => setBudgetMajor(event.target.value)}
                value={budgetMajor}
              />
              <span className="block text-muted-foreground text-xs tabular-nums">
                between {majorUnits(plan.budget.bounds.min_minor_units)} and{' '}
                {majorUnits(plan.budget.bounds.max_minor_units)}
                {budgetClamped ? ' · clamped to the limits' : ''}
                {plan.budget.note ? ` · ${plan.budget.note}` : ''}
              </span>
            </label>
            <label className="flex items-center gap-2" htmlFor={`activate-${rec.id}`}>
              <Switch checked={activate} id={`activate-${rec.id}`} onCheckedChange={setActivate} />
              <span className="text-foreground">Start active</span>
              <span className="text-muted-foreground">
                {activate
                  ? plan.mode === 'replace'
                    ? '— pauses the current ad set once the new one is live'
                    : '— delivers as soon as Meta approves it'
                  : '— created paused; you switch it on'}
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                className={ROOMY_BUTTON}
                data-testid="audience-create"
                disabled={props.approving || props.busy}
                onClick={() => setConfirmOpen(true)}
                size="sm"
                type="button"
              >
                {props.approving ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                Create the new ad set ({activate ? 'active' : 'paused'})
              </Button>
              <Button
                className={ROOMY_BUTTON}
                disabled={props.busy}
                onClick={props.onCancel}
                size="sm"
                type="button"
                variant="ghost"
              >
                Discard
              </Button>
            </div>
            <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Create "{plan.adset_name}" in Meta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A new ad set in {plan.source.campaign_name ?? 'this campaign'} with the proposed
                    audience, {formatCurrency(majorUnits(budgetMinor), plan.budget.currency)}
                    /day and {plan.creatives.length} ad
                    {plan.creatives.length === 1 ? '' : 's'} reusing the portfolio's best creatives.{' '}
                    {activate
                      ? plan.mode === 'replace'
                        ? `It starts active and "${plan.source.adset_name ?? 'the current ad set'}" pauses once it is live.`
                        : 'It starts active.'
                      : 'It is created paused; you switch it on from this card.'}{' '}
                    Meta restarts the learning phase for a new ad set.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setConfirmOpen(false);
                      props.onApprove({ budgetMinorUnits: budgetMinor, activate });
                    }}
                  >
                    Create the ad set
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}

        {state === 'approved' ||
        state === 'executing' ||
        state === 'switching' ||
        state === 'undoing' ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-3.5 animate-spin" />
            {state === 'approved'
              ? 'Approved: the worker creates it in under a minute.'
              : state === 'executing'
                ? 'Creating the ad set and its ads in Meta…'
                : state === 'switching'
                  ? 'Activating the new ad set…'
                  : 'Undoing…'}
          </p>
        ) : null}

        {(state === 'executed' || state === 'undone') && result ? (
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                {state === 'undone' ? 'Undone' : 'Created in Meta'}
                {(row?.approval as { via?: string } | null)?.via === 'autopilot' ? (
                  <Badge className="ml-2 text-xs" variant="success">
                    Approved by autopilot · created paused
                  </Badge>
                ) : null}
              </p>
              {result.campaign ? (
                <p className="truncate text-muted-foreground">
                  Campaign {result.campaign.name ?? ''}{' '}
                  <span className="text-xs tabular-nums">{result.campaign.id}</span>
                </p>
              ) : null}
              {result.adset ? (
                <p className="truncate">
                  Ad set {result.adset.name ?? ''}{' '}
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {result.adset.id}
                  </span>{' '}
                  · {result.adset.effective_status ?? result.adset.status ?? ''}
                  {urls?.adset ? (
                    <a
                      className="ml-1 inline-flex items-center gap-0.5 text-primary"
                      href={urls.adset}
                      rel="noreferrer"
                      target="_blank"
                    >
                      open <ExternalLinkIcon className="size-3.5" />
                    </a>
                  ) : null}
                </p>
              ) : null}
              {result.ads.map((ad, index) => (
                <p className="truncate text-muted-foreground" key={ad.id}>
                  Ad {ad.name ?? ''} <span className="text-xs tabular-nums">{ad.id}</span> ·{' '}
                  {ad.effective_status ?? ad.status ?? ''}
                  {urls?.ads[index] ? (
                    <a
                      className="ml-1 inline-flex items-center gap-0.5 text-primary"
                      href={urls.ads[index]}
                      rel="noreferrer"
                      target="_blank"
                    >
                      open <ExternalLinkIcon className="size-3.5" />
                    </a>
                  ) : null}
                </p>
              ))}
            </div>
            <Collapsible>
              <CollapsibleTrigger
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'h-8 gap-1.5 px-3 text-sm',
                )}
              >
                <ChevronDownIcon className="size-3.5" /> What was implemented
              </CollapsibleTrigger>
              <CollapsibleContent>
                <dl className="mt-1.5 space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
                  {implementedRows(result, plan).map((line) => (
                    <div className="flex items-baseline gap-2" key={`${line.label}:${line.value}`}>
                      <dt className="w-28 shrink-0 text-muted-foreground text-xs">{line.label}</dt>
                      <dd className="min-w-0 break-words text-foreground">{line.value}</dd>
                    </div>
                  ))}
                </dl>
              </CollapsibleContent>
            </Collapsible>
            {state === 'executed' ? (
              <div className="flex flex-wrap gap-2">
                {plan?.mode === 'replace' && !result.activation?.requested ? (
                  <Button
                    className={ROOMY_BUTTON}
                    disabled={props.busy}
                    onClick={props.onActivate}
                    size="sm"
                    type="button"
                  >
                    Switch to the new one
                  </Button>
                ) : null}
                {!result.activation?.requested && plan?.mode === 'add' ? (
                  <Button
                    className={ROOMY_BUTTON}
                    disabled={props.busy}
                    onClick={props.onActivate}
                    size="sm"
                    type="button"
                  >
                    Activate
                  </Button>
                ) : null}
                <Button
                  className={ROOMY_BUTTON}
                  disabled={props.busy}
                  onClick={props.onUndo}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <UndoIcon className="size-3.5" /> Undo
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {failure ? null : <NoticeLine notice={notice} />}
      </section>
    </div>
  );
}
