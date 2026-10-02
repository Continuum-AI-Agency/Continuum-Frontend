'use client';

// The recommendation cards: what the Optimizer Overview says to DO, once it has said how the
// account is doing (the headline, the KPI tiles, the Jaina band) and before the portfolio rows.
//
// Every card is one sentence that names the entity, the figure and the comparison — the title
// the Backend stamped, or the same title composed here from the candidate's own figures when it
// has not — and one button that says the verb. The reading used to lead ("The auction moved,
// not the ad"); a reading is something a person has to interpret, so it sits in the body under
// a title they can verify. No charts: a card is a decision, and the evidence is one question to
// Jaina away.
//
// Guards come first and only when they fire. A red box that appears every day is a red box
// people learn to scroll past, so the zone is absent otherwise; when one does fire, every card
// it poisons says so, because a guard that cannot name what it invalidates is decoration.
//
// Four on screen is what a person carries away. The rest sits behind one control that says what
// skipping it costs, so skipping is a decision and not an accident. The first card is the
// principal one and the only one that breathes.
//
// Nothing here is written by a model. Every figure came from a detector, and the RANK used a
// discounted value while the card shows the real money.

import type { AccountCandidate } from '@continuum/contracts';
import {
  ACCOUNT_DETECTOR_META,
  ACTION_FAMILY_COPY,
  ACTION_VERB_LABEL,
  accountCandidateAction,
  accountCandidateTitle,
  accountGuards,
  actionLabel,
  DETECTOR_ACTION_FAMILY,
  impactTier,
  rankAccountCandidates,
  titleText,
} from '@continuum/contracts';
import { AlertTriangleIcon, ChevronDownIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { cn } from '@/lib/utils';
import { formatPerPeriod } from '../../format';
import { PlatformChip } from '../platforms/PlatformChip';
import type { AdPlatform } from '../platforms/platformTabsModel';
import * as typeScale from '../../typeScale';
import { CalmRule, HeadlineFigure, MoneyLine } from './candidateHeadline';
import { doubtedBy } from './guardScope';

/** How many cards show before the fold. Four is what someone carries away from a screen. */
const SHOWN_COUNT = 4;

const TIER_VARIANT = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
} as const;

const TIER_LABEL = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} as const;

export type AccountReadProps = {
  /** Guards included; the component splits them from the ranked list. */
  candidates: AccountCandidate[];
  currency: string | null;
  /** The account's daily spend — the scale the impact tiers are read against. */
  dailySpend: number | null;
  /** Portfolio id → name, so a card can say which portfolio it is about. */
  portfolioNames: ReadonlyMap<string, string>;
  onOpenPortfolio?: (portfolioId: string) => void;
  /** The platform the cards are about; each card names it in a chip. */
  platform?: AdPlatform;
};

function StateNote({ candidate }: { candidate: AccountCandidate }) {
  if (!candidate.state) return null;
  const family = ACTION_FAMILY_COPY[DETECTOR_ACTION_FAMILY[candidate.detector]].label;
  if (candidate.state_lowered) {
    return (
      <p className="text-warning text-xs" data-testid="state-lowered">
        Marked to act on its own, but “{family}” does not allow it yet — it will recommend.
      </p>
    );
  }
  if (candidate.state === 'autopilot') {
    return <p className="text-muted-foreground text-xs">Acts on its own, within your limits.</p>;
  }
  return null;
}

function CapNote({ candidate }: { candidate: AccountCandidate }) {
  if (!candidate.capped_by) return null;
  return (
    <p className="text-muted-foreground text-xs">
      {candidate.capped_by === 'velocity'
        ? "Capped by this objective's per-cycle ceiling, not by the gap."
        : 'Capped by your guardrail, not by the gap.'}
    </p>
  );
}

function portfolioNamesOf(
  candidate: AccountCandidate,
  portfolioNames: ReadonlyMap<string, string>,
): string[] {
  return candidate.portfolio_ids
    .map((id) => portfolioNames.get(id))
    .filter((name): name is string => Boolean(name));
}

function jainaPrompt(titleLine: string, names: string[]): string {
  const where = names.length > 0 ? names.join(' · ') : 'the account';
  return `About the recommendation "${titleLine}" in ${where}: walk me through the evidence and what happens if I apply it.`;
}

function RecommendationCard({
  candidate,
  currency,
  dailySpend,
  doubted,
  lead,
  portfolioNames,
  onOpenPortfolio,
  platform,
}: {
  candidate: AccountCandidate;
  currency: string | null;
  dailySpend: number | null;
  doubted: boolean;
  lead: boolean;
  portfolioNames: ReadonlyMap<string, string>;
  onOpenPortfolio?: (portfolioId: string) => void;
  platform?: AdPlatform;
}) {
  const meta = ACCOUNT_DETECTOR_META[candidate.detector];
  const tier = impactTier(candidate.impact_per_day, dailySpend);
  const title = candidate.title ?? accountCandidateTitle(candidate, currency);
  const action = candidate.action ?? accountCandidateAction(candidate, currency);
  const titleLine = title ? titleText(title) : meta.label;
  const names = portfolioNamesOf(candidate, portfolioNames);
  const target = candidate.cta.kind === 'portfolio' ? candidate.cta.target_id : null;
  const figureKey = `card.${candidate.detector}`;

  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4',
        lead ? 'border-primary/40' : 'border-border/60',
      )}
      data-detector={candidate.detector}
      data-lead={lead ? 'true' : 'false'}
      data-testid="account-card"
    >
      <CalmRule play={lead} testId="account-card-rule" />
      <div className="flex flex-wrap items-center gap-1.5">
        {platform ? <PlatformChip platform={platform} /> : null}
        {lead ? (
          <Badge className="text-xs" variant="violet">
            Lead
          </Badge>
        ) : null}
        <Badge className="text-xs" variant={TIER_VARIANT[tier]}>
          {TIER_LABEL[tier]}
        </Badge>
        <Badge className="text-xs" variant="muted">
          {ACTION_VERB_LABEL[action.verb]}
        </Badge>
        {doubted ? <span className="text-warning text-xs">affected by the guard</span> : null}
      </div>
      <h3 className={cn(typeScale.bodyLg, 'font-semibold text-foreground')}>{titleLine}</h3>
      {title ? null : (
        <HeadlineFigure
          candidate={candidate}
          currency={currency}
          figureKey={figureKey}
          size="column"
        />
      )}
      <MoneyLine candidate={candidate} currency={currency} figureKey={figureKey} />
      <p className="text-muted-foreground text-sm">{candidate.impact_basis}</p>
      <CapNote candidate={candidate} />
      <StateNote candidate={candidate} />
      <footer className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {names.length > 0 ? (
          <p className="w-full text-muted-foreground text-xs" data-testid="account-card-portfolios">
            {names.join(' · ')}
          </p>
        ) : null}
        {target && onOpenPortfolio ? (
          <Button
            data-testid="account-card-action"
            onClick={() => onOpenPortfolio(target)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {actionLabel(action)}
          </Button>
        ) : null}
        <a
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-primary')}
          data-testid="account-card-jaina"
          href={jainaPromptHref(jainaPrompt(titleLine, names))}
        >
          <SparklesIcon aria-hidden className="size-3.5" />
          Ask Jaina
        </a>
      </footer>
    </article>
  );
}

export function AccountRead({
  candidates,
  currency,
  dailySpend,
  portfolioNames,
  onOpenPortfolio,
  platform,
}: AccountReadProps) {
  const [showRest, setShowRest] = useState(false);
  const guards = accountGuards(candidates);
  const ranked = rankAccountCandidates(candidates);
  const doubted = doubtedBy(guards);

  if (guards.length === 0 && ranked.length === 0) return null;

  const rest = ranked.slice(SHOWN_COUNT);
  const restWorth = rest.reduce((sum, candidate) => sum + candidate.impact_per_day, 0);
  const visible = showRest ? ranked : ranked.slice(0, SHOWN_COUNT);

  return (
    <section className="space-y-3" data-testid="account-cards">
      {guards.map((guard) => (
        <div
          className="flex gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4"
          data-guard={guard.detector}
          key={guard.id}
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 space-y-1">
            <h3 className="font-semibold text-foreground text-sm">
              {ACCOUNT_DETECTOR_META[guard.detector].label}
            </h3>
            <p className="text-muted-foreground text-xs">{guard.impact_basis}</p>
            <p className="text-muted-foreground text-xs">
              Read this before the cards: it decides whether the rest of these figures mean
              anything.
            </p>
          </div>
        </div>
      ))}

      {ranked.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2">
          {visible.map((candidate, index) => (
            <RecommendationCard
              candidate={candidate}
              currency={currency}
              dailySpend={dailySpend}
              doubted={doubted.has(candidate.detector)}
              key={candidate.id}
              lead={index === 0}
              onOpenPortfolio={onOpenPortfolio}
              platform={platform}
              portfolioNames={portfolioNames}
            />
          ))}
        </div>
      ) : null}

      {rest.length > 0 ? (
        <Button
          aria-expanded={showRest}
          className="w-full justify-center gap-1.5 text-xs"
          onClick={() => setShowRest((open) => !open)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ChevronDownIcon
            className={cn('size-3.5 transition-transform', showRest && 'rotate-180')}
          />
          {showRest
            ? 'Hide the rest'
            : `${rest.length} more · ${formatPerPeriod(restWorth, currency)} between them`}
        </Button>
      ) : null}
    </section>
  );
}
