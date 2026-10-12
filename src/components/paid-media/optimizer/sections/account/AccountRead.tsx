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
// skipping it costs, so skipping is a decision and not an accident. No card has a frame: each
// is a module on a soft neutral fill with its control on the right, and the first, the
// principal one, takes a faint primary tint and the primary button.
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
  type RecommendationTitle,
  rankAccountCandidates,
  titleFigure,
  titleText,
} from '@continuum/contracts';
import { AlertTriangleIcon, ChevronDownIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { cn } from '@/lib/utils';
import { formatPerPeriod } from '../../format';
import * as typeScale from '../../typeScale';
import { PlatformCardBody } from '../platformCards/PlatformCardBody';
import {
  cardActionAvailability,
  type PlatformCardAction,
} from '../platformCards/platformCardActionModel';
import {
  isReadOnly,
  ownsItsActions,
  PLATFORM_CARD_TYPE,
  platformCardActionLabel,
  platformCardOf,
  platformCardTitle,
  platformsOf,
} from '../platformCards/platformCardModel';
import { PlatformChip } from '../platforms/PlatformChip';
import type { AdPlatform } from '../platforms/platformTabsModel';
import { HeadlineFigure, MoneyLine } from './candidateHeadline';
import { doubtedBy } from './guardScope';

/** How many cards show before the fold. Four is what someone carries away from a screen. */
const SHOWN_COUNT = 4;

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
  /** Candidate id → the engine's executable action for its platform card. A card with one shows
   *  its own control (the approval flow) in place of the generic button. Absent, nothing
   *  changes. */
  cardActions?: ReadonlyMap<string, PlatformCardAction>;
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
  cardAction,
}: {
  candidate: AccountCandidate;
  currency: string | null;
  dailySpend: number | null;
  doubted: boolean;
  lead: boolean;
  portfolioNames: ReadonlyMap<string, string>;
  onOpenPortfolio?: (portfolioId: string) => void;
  platform?: AdPlatform;
  cardAction?: PlatformCardAction;
}) {
  const meta = ACCOUNT_DETECTOR_META[candidate.detector];
  const tier = impactTier(candidate.impact_per_day, dailySpend);
  const title = candidate.title ?? accountCandidateTitle(candidate, currency);
  const action = candidate.action ?? accountCandidateAction(candidate, currency);
  // A Google or TikTok subject renders its own variant; absent, the generic card is unchanged.
  const platformCard = platformCardOf(candidate);
  const titleLine = platformCard
    ? platformCardTitle(platformCard)
    : title
      ? titleText(title)
      : meta.label;
  const chips = platformCard ? platformsOf(platformCard) : platform ? [platform] : [];
  const cardHoldsAction =
    platformCard != null && cardActionAvailability(platformCard, cardAction) !== 'none';
  const names = portfolioNamesOf(candidate, portfolioNames);
  const target = candidate.cta.kind === 'portfolio' ? candidate.cta.target_id : null;
  const figureKey = `card.${candidate.detector}`;

  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg p-4',
        lead ? 'bg-primary/5' : 'bg-muted/50',
      )}
      data-detector={candidate.detector}
      data-lead={lead ? 'true' : 'false'}
      data-variant={platformCard?.variant ?? 'generic'}
      data-testid="account-card"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
        {chips.map((chip) => (
          <PlatformChip key={chip} platform={chip} />
        ))}
        {lead ? <span className="font-semibold text-primary-ink">Lead</span> : null}
        <span className={cn(tier === 'high' && 'font-medium text-foreground')} data-tier={tier}>
          {TIER_LABEL[tier]}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {platformCard ? PLATFORM_CARD_TYPE[platformCard.variant] : ACTION_VERB_LABEL[action.verb]}
        </span>
        {doubted ? <span className="text-warning">affected by the guard</span> : null}
      </div>
      <div className="grid gap-x-6 gap-y-3 @2xl/recs:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-1.5">
          {platformCard ? (
            <PlatformCardBody
              action={cardAction}
              card={platformCard}
              onAddNegatives={target && onOpenPortfolio ? () => onOpenPortfolio(target) : undefined}
            />
          ) : (
            <h3 className={cn(typeScale.bodyLg, 'font-semibold text-foreground')}>
              <TitleLine fallback={titleLine} title={title} />
            </h3>
          )}
          {title || platformCard ? null : (
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
          {names.length > 0 ? (
            <p className="text-muted-foreground text-xs" data-testid="account-card-portfolios">
              {names.join(' · ')}
            </p>
          ) : null}
        </div>
        <footer className="flex flex-wrap items-center gap-2 self-start @2xl/recs:flex-col @2xl/recs:items-end">
          {target &&
          onOpenPortfolio &&
          !cardHoldsAction &&
          !(platformCard && (isReadOnly(platformCard) || ownsItsActions(platformCard))) ? (
            <Button
              data-testid="account-card-action"
              onClick={() => onOpenPortfolio(target)}
              size="sm"
              type="button"
              variant={lead ? 'default' : 'secondary'}
            >
              {(platformCard && platformCardActionLabel(platformCard)) ?? actionLabel(action)}
            </Button>
          ) : null}
          <a
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-primary-ink')}
            data-testid="account-card-jaina"
            href={jainaPromptHref(jainaPrompt(titleLine, names))}
          >
            <SparklesIcon aria-hidden className="size-3.5" />
            Ask Jaina
          </a>
        </footer>
      </div>
    </article>
  );
}

/** A figure in a title — "101 MXN", "35%", "2.9×", "38,751" — so it can sit in mono. */
const TITLE_FIGURE = /(\d[\d,]*(?:\.\d+)?(?:%|×|\s[A-Z]{3}\b)?)/;

/** Prose with each figure in mono, at the prose's own weight. */
function WithMonoFigures({ text }: { text: string }) {
  return (
    <>
      {text.split(TITLE_FIGURE).map((part, index) =>
        index % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string, in order
          <span className="font-mono tabular-nums" key={index}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** The claim: the entity as written (its name may hold digits that are not figures), then the
 *  figure and the comparison with their figures in mono. The text is exactly `titleText`. */
function TitleLine({ title, fallback }: { title: RecommendationTitle | null; fallback: string }) {
  if (!title) return <>{fallback}</>;
  return (
    <>
      {title.entity}: <WithMonoFigures text={`${titleFigure(title)}, ${title.comparator}`} />
    </>
  );
}

export function AccountRead({
  candidates,
  currency,
  dailySpend,
  portfolioNames,
  onOpenPortfolio,
  platform,
  cardActions,
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
          className="flex gap-3 rounded-lg bg-warning/10 p-4"
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
        <div className="@container/recs space-y-2">
          {visible.map((candidate, index) => (
            <RecommendationCard
              candidate={candidate}
              cardAction={cardActions?.get(candidate.id)}
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
