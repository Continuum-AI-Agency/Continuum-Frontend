'use client';

// An audience recommendation, ready to execute: the current audience on the left, the
// proposal in the middle (diagnosis, the options per bucket with what Jaina chose and
// what the brand rules blocked, reach, budget, the creatives that carry over), and on the
// right the one decision — create the new ad set. Every state of the proposal row has a
// face here, from "the daily analysis has not run yet" to "here is what Meta now holds".

import type {
  AdSetSnapshot,
  AudienceProposalPlan,
  ConvertCboResponse,
  RecommendationRow,
} from '@continuum/contracts';
import { adsManagerUrls, clampBudgetMinorUnits } from '@continuum/contracts';
import {
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SparklesIcon,
  UndoIcon,
  UsersIcon,
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
import { cn } from '@/lib/utils';
import { formatCurrency } from '../format';
import {
  type AudienceCardView,
  estimateLabel,
  implementedRows,
  majorUnits,
  minorUnits,
  optionsByBucket,
  reachDeltaLabel,
  targetingSummaryLine,
} from './audienceCardModel';
import { evidenceLine, queueHeadlineLine } from './recQueueModel';

export type AudienceRecommendationCardProps = {
  rec: RecommendationRow;
  adsetName: string | null;
  snapshot: AdSetSnapshot | null;
  view: AudienceCardView;
  currency: string | null;
  adAccountId: string;
  onRequest: () => void;
  requesting: boolean;
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
const ROOMY_BUTTON = 'h-9 px-3 text-sm';

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground text-xs">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

function CurrentAudience({
  plan,
  snapshot,
  rec,
  currency,
  resultWord,
}: {
  plan: AudienceProposalPlan | null;
  snapshot: AdSetSnapshot | null;
  rec: RecommendationRow;
  currency: string | null;
  resultWord: string;
}) {
  const line = plan ? targetingSummaryLine(plan.previous_spec) : null;
  const evidence = queueHeadlineLine(rec, currency) ?? evidenceLine(rec.evidence, currency);
  return (
    <section className="space-y-3">
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
        <UsersIcon className="size-3.5" /> Audience today
      </p>
      <p className="text-base text-foreground">{line ?? snapshot?.audienceType ?? 'this ad set'}</p>
      <dl className="space-y-1.5 text-sm">
        {plan?.reach.current ? (
          <Line label="Reach">{estimateLabel(plan.reach.current)}</Line>
        ) : null}
        {snapshot?.frequency7d != null ? (
          <Line label="Frequency">{snapshot.frequency7d.toFixed(2)} · 7d</Line>
        ) : null}
        <Line label="Signal">{evidence ?? rec.reason ?? rec.trigger}</Line>
        {plan?.source.daily_budget_minor_units != null ? (
          <Line label="Budget">
            {formatCurrency(majorUnits(plan.source.daily_budget_minor_units), currency)}/day
          </Line>
        ) : null}
        <Line label="Result">{resultWord}</Line>
      </dl>
    </section>
  );
}

function ProposalBody({ plan, currency }: { plan: AudienceProposalPlan; currency: string | null }) {
  const groups = optionsByBucket(plan);
  const reach = reachDeltaLabel(plan);
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className="text-xs uppercase"
          variant={plan.mode === 'replace' ? 'default' : 'secondary'}
        >
          {plan.mode === 'replace' ? 'Replace audience' : 'Add audience'}
        </Badge>
        <span className="text-muted-foreground">
          {plan.mode === 'replace'
            ? 'New ad set takes over; the current one pauses once the new one is active.'
            : 'New ad set beside the current one; both keep running.'}
        </span>
      </div>
      <p className="font-medium text-base text-foreground">{plan.diagnosis}</p>
      <p className="text-muted-foreground">{plan.rationale}</p>
      {groups.map((group) => (
        <div key={group.bucket}>
          <p className="mb-1.5 text-muted-foreground text-xs uppercase tracking-wide">
            {group.label}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {group.options.map((option) => (
              <li
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1',
                  option.chosen
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : option.blocked_by
                      ? 'border-border/50 text-muted-foreground line-through'
                      : 'border-border/60 text-muted-foreground',
                )}
                key={`${group.bucket}:${option.id ?? option.name}`}
                title={option.blocked_by ?? option.rationale ?? undefined}
              >
                {option.chosen ? <CheckIcon className="size-3.5" /> : null}
                {option.name}
                {option.estimate ? (
                  <span className="text-xs tabular-nums opacity-70">
                    {estimateLabel(option.estimate)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <dl className="space-y-1">
        {reach ? <Line label="Reach">{reach}</Line> : null}
        <Line label="Advantage+">
          {plan.advantage_audience.enabled ? 'on' : 'off'}
          <span className="text-muted-foreground"> · {plan.advantage_audience.rationale}</span>
        </Line>
        <Line label="New name">{plan.adset_name}</Line>
      </dl>
      {plan.creatives.length > 0 ? (
        <div>
          <p className="mb-1.5 text-muted-foreground text-xs uppercase tracking-wide">
            Creatives carried over
          </p>
          <ul className="flex flex-wrap gap-3">
            {plan.creatives.map((creative) => (
              <li className="w-28" key={creative.creative_id}>
                {creative.poster_url ? (
                  // biome-ignore lint/performance/noImgElement: signed, expiring Meta CDN URL; next/image cannot proxy it.
                  <img
                    alt={creative.ad_name ?? creative.ad_id}
                    className="aspect-square w-full rounded-md border border-border/60 object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={creative.poster_url}
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md border border-border/60 border-dashed text-muted-foreground text-sm tabular-nums">
                    #{creative.rank}
                  </div>
                )}
                <p
                  className="mt-1.5 truncate text-foreground text-sm"
                  title={creative.ad_name ?? creative.ad_id}
                >
                  {creative.ad_name ?? creative.ad_id}
                </p>
                <p className="truncate text-muted-foreground text-xs tabular-nums">
                  {creative.cost_per_event != null
                    ? formatCurrency(creative.cost_per_event, currency)
                    : '—'}{' '}
                  · {creative.events} · {creative.source_adset_name ?? creative.source_adset_id}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-muted-foreground text-xs">{plan.creatives_disclosure}</p>
        </div>
      ) : null}
    </div>
  );
}

export function AudienceRecommendationCard(props: AudienceRecommendationCardProps) {
  const { rec, view, currency, adAccountId, resultWord } = props;
  const { plan, state, block, result, row } = view;
  const [budgetMajor, setBudgetMajor] = React.useState<string>('');
  const [activate, setActivate] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  React.useEffect(() => {
    if (plan) setBudgetMajor(String(majorUnits(plan.budget.suggested_minor_units)));
  }, [plan]);

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

  return (
    <div
      className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)_minmax(16rem,20rem)]"
      data-testid="audience-recommendation-card"
    >
      <CurrentAudience
        currency={currency}
        plan={plan}
        rec={rec}
        resultWord={resultWord}
        snapshot={props.snapshot}
      />

      {/* Middle — the proposal */}
      <section className="space-y-3 md:border-border/50 md:border-l md:pl-6">
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
          <SparklesIcon className="size-3.5" /> Jaina's proposal
        </p>
        {plan ? (
          <ProposalBody currency={currency} plan={plan} />
        ) : state === 'queued' || state === 'proposing' ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            {state === 'queued'
              ? 'Queued — Jaina picks it up within a minute.'
              : 'Jaina is reading the audience, the catalogue and the creatives…'}
          </p>
        ) : state === 'blocked_cbo' || state === 'blocked' ? (
          <div className="space-y-1.5 text-sm">
            <p className="font-medium text-foreground">
              {state === 'blocked_cbo'
                ? 'This campaign holds the budget'
                : 'No proposal could be built'}
            </p>
            <p className="text-muted-foreground">{block?.message}</p>
          </div>
        ) : state === 'failed' ? (
          <div className="space-y-1.5 text-sm">
            <p className="font-medium text-foreground">The analysis failed</p>
            <p className="text-muted-foreground">{view.errorMessage ?? 'Unknown error.'}</p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Jaina's audience analysis runs with the daily optimizer cycle for this ad set. Ask now
            to build the proposal today.
          </p>
        )}
      </section>

      {/* Right — the decision */}
      <section className="space-y-3 md:border-border/50 md:border-l md:pl-6">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">Decision</p>

        {state === 'none' || state === 'failed' ? (
          <Button
            disabled={props.requesting}
            onClick={props.onRequest}
            className={ROOMY_BUTTON}
            size="sm"
            type="button"
            variant="secondary"
          >
            {props.requesting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SparklesIcon className="size-4" />
            )}
            {state === 'failed' ? 'Ask Jaina again' : 'Ask Jaina now'}
          </Button>
        ) : null}

        {state === 'blocked_cbo' && block ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Recommendations need ad-set daily budgets to pace and compare ad sets. Convert the
              campaign, then ask Jaina again.
            </p>
            {props.cboPreview?.ok && props.cboPreview.dryRun !== false ? (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="mb-1 font-medium text-foreground">
                  Preview: {props.cboPreview.adset_budgets.length} ad set
                  {props.cboPreview.adset_budgets.length === 1 ? '' : 's'} get their own daily
                  budget
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
                  {props.convertingCbo ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Convert campaign to ad-set budgets
                </Button>
              </div>
            ) : props.cboPreview?.ok && props.cboPreview.dryRun === false ? (
              <p className="text-foreground">
                Converted{props.cboPreview.deduped ? ' (already today)' : ''}. Ask Jaina again to
                build the proposal.
              </p>
            ) : (
              <Button
                disabled={props.convertingCbo || !block.campaign_id}
                onClick={() => block.campaign_id && props.onConvertCbo(block.campaign_id, true)}
                className={ROOMY_BUTTON}
                size="sm"
                type="button"
                variant="secondary"
              >
                {props.convertingCbo ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Preview the conversion
              </Button>
            )}
            <Button
              disabled={props.requesting}
              onClick={props.onRequest}
              className={ROOMY_BUTTON}
              size="sm"
              type="button"
              variant="ghost"
            >
              Ask Jaina again
            </Button>
          </div>
        ) : null}

        {state === 'blocked' ? (
          <Button
            disabled={props.requesting}
            onClick={props.onRequest}
            className={ROOMY_BUTTON}
            size="sm"
            type="button"
            variant="secondary"
          >
            Ask Jaina again
          </Button>
        ) : null}

        {state === 'ready' && plan ? (
          <div className="space-y-3 text-sm">
            <label className="block space-y-1" htmlFor={`budget-${rec.id}`}>
              <span className="text-muted-foreground">Daily budget ({plan.budget.currency})</span>
              <Input
                className="h-9 text-sm"
                id={`budget-${rec.id}`}
                inputMode="decimal"
                onChange={(event) => setBudgetMajor(event.target.value)}
                value={budgetMajor}
              />
              <span className="block text-muted-foreground text-xs tabular-nums">
                {majorUnits(plan.budget.bounds.min_minor_units)}–
                {majorUnits(plan.budget.bounds.max_minor_units)}
                {budgetClamped ? ' · adjusted to the bounds' : ''}
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
                  : '— created paused, for review'}
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={props.approving || props.busy}
                onClick={() => setConfirmOpen(true)}
                className={ROOMY_BUTTON}
                size="sm"
                type="button"
              >
                {props.approving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create new ad set
              </Button>
              <Button
                disabled={props.busy}
                onClick={props.onCancel}
                className={ROOMY_BUTTON}
                size="sm"
                type="button"
                variant="ghost"
              >
                Dismiss
              </Button>
            </div>
            <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Create "{plan.adset_name}" on Meta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A new ad set in {plan.source.campaign_name ?? 'this campaign'} with the proposed
                    audience, {formatCurrency(majorUnits(budgetMinor), plan.budget.currency)}/day,{' '}
                    {plan.creatives.length} ad
                    {plan.creatives.length === 1 ? '' : 's'} reusing the portfolio's best creatives.{' '}
                    {activate
                      ? plan.mode === 'replace'
                        ? `It starts active and "${plan.source.adset_name ?? 'the current ad set'}" is paused once it is live.`
                        : 'It starts active.'
                      : 'It is created paused; you can switch it on from this card.'}{' '}
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
                    Create ad set
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
            <Loader2Icon className="size-4 animate-spin" />
            {state === 'approved'
              ? 'Approved — the worker creates it within a minute.'
              : state === 'executing'
                ? 'Creating the ad set and its ads on Meta…'
                : state === 'switching'
                  ? 'Activating the new ad set…'
                  : 'Undoing…'}
          </p>
        ) : null}

        {(state === 'executed' || state === 'undone') && result ? (
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium text-base text-foreground">
                {state === 'undone' ? 'Undone' : 'Created on Meta'}
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
                  'h-9 gap-1.5 px-3 text-sm',
                )}
              >
                <ChevronDownIcon className="size-4" /> What was implemented
              </CollapsibleTrigger>
              <CollapsibleContent>
                <dl className="mt-1.5 space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-3">
                  {implementedRows(result, plan).map((entry) => (
                    <Line key={`${entry.label}:${entry.value}`} label={entry.label}>
                      <span className="break-words">{entry.value}</span>
                    </Line>
                  ))}
                </dl>
              </CollapsibleContent>
            </Collapsible>
            {state === 'executed' ? (
              <div className="flex flex-wrap gap-2">
                {plan?.mode === 'replace' && !result.activation?.requested ? (
                  <Button
                    disabled={props.busy}
                    onClick={props.onActivate}
                    className={ROOMY_BUTTON}
                    size="sm"
                    type="button"
                  >
                    Switch over
                  </Button>
                ) : null}
                {!result.activation?.requested && plan?.mode === 'add' ? (
                  <Button
                    disabled={props.busy}
                    onClick={props.onActivate}
                    className={ROOMY_BUTTON}
                    size="sm"
                    type="button"
                  >
                    Activate
                  </Button>
                ) : null}
                <Button
                  disabled={props.busy}
                  onClick={props.onUndo}
                  className={ROOMY_BUTTON}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <UndoIcon className="size-4" /> Undo
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {row?.status === 'failed' && result?.adset ? (
          <p className="text-muted-foreground text-xs">
            A partial result exists (ad set {result.adset.id}); retrying resumes from it.
          </p>
        ) : null}
      </section>
    </div>
  );
}
