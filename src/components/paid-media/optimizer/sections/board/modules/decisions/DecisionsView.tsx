'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The Decisions module's body. At size s: how many decisions wait, split by tier, and the top
// card. At m, l and w: the filters (All, Fix, Grow, Clean, each with its count) and the stack in
// impact order, the first few shown and the rest one press away. Changing the filter moves the
// cards to their new places (Motion layout); under reduced motion they simply appear there.

import type { BoardModuleSize } from '@continuum/contracts';
import { PlusIcon } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DecisionCardView } from './DecisionCard';
import type { DismissState } from './DecisionControls';
import { type ControlContext, controlOf, dismissOf } from './decisionControl';
import {
  cardsInFilter,
  DECISION_FILTER_LABEL,
  DECISION_FILTERS,
  DECISION_TIER_LABEL,
  type DecisionCard,
  type DecisionFilter,
  type DecisionTier,
  decisionCounts,
  STACK_LIMIT,
  tierCounts,
} from './decisionsModel';

export type DecisionsViewProps = {
  cards: readonly DecisionCard[];
  size: BoardModuleSize;
  context: ControlContext;
  portfolioNames: ReadonlyMap<string, string>;
  dismissStateOf: (recommendationId: string | null) => DismissState;
  onDismiss: (recommendationId: string) => void;
  onSelectPortfolio: (portfolioId: string) => void;
  onCreatePortfolio: () => void;
};

const TIERS: readonly DecisionTier[] = ['high', 'medium', 'low'];

const TIER_SEGMENT: Record<DecisionTier, string> = {
  high: 'bg-destructive',
  medium: 'bg-warning',
  low: 'bg-muted-foreground/40',
};

function isFilter(value: string): value is DecisionFilter {
  return (DECISION_FILTERS as readonly string[]).includes(value);
}

function CardSlot({ card, props }: { card: DecisionCard; props: DecisionsViewProps }) {
  const { context } = props;
  return (
    <DecisionCardView
      card={card}
      clientExecutes={context.mode === 'recommend'}
      control={controlOf(card, context)}
      dismiss={dismissOf(card, context.mode)}
      dismissState={props.dismissStateOf(card.recommendationId)}
      onCreatePortfolio={props.onCreatePortfolio}
      onDismiss={props.onDismiss}
      onSelectPortfolio={props.onSelectPortfolio}
      platform={context.platform}
      portfolioName={card.portfolioId ? (props.portfolioNames.get(card.portfolioId) ?? null) : null}
    />
  );
}

/** Size s: the count, the split by tier as one thin bar, and the card that leads. */
function DecisionsSummary(props: DecisionsViewProps) {
  const betaUiText = useBetaTranslations('scale');

  const { cards } = props;
  const tiers = tierCounts(cards);
  const split = TIERS.filter((tier) => tiers[tier] > 0)
    .map((tier) => `${tiers[tier]} ${DECISION_TIER_LABEL[tier].toLowerCase()}`)
    .join(' · ');
  const top = cards[0];
  return (
    <div className="space-y-3" data-testid="decisions-summary">
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span
            className="font-semibold text-3xl text-foreground tabular-nums"
            data-testid="decisions-count"
          >
            {cards.length}
          </span>
          <span className="text-muted-foreground text-xs">
            {cards.length === 1 ? betaUiText('beta_059de7f9a538') : betaUiText('beta_328f9a3ffe75')}
            {split ? ` · ${split}` : ''}
          </span>
        </p>
        <div aria-hidden="true" className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
          {TIERS.filter((tier) => tiers[tier] > 0).map((tier) => (
            <span
              className={TIER_SEGMENT[tier]}
              key={tier}
              style={{ flexGrow: tiers[tier], flexBasis: 0 }}
            />
          ))}
        </div>
      </div>
      {top ? <CardSlot card={top} props={props} /> : null}
    </div>
  );
}

/** Sizes m, l and w: the filters and the stack. */
function DecisionsStackList(props: DecisionsViewProps) {
  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<DecisionFilter>('all');
  const [expanded, setExpanded] = useState(false);
  const counts = decisionCounts(props.cards);
  // A filter whose last card was just decided falls back to All rather than an empty stack.
  const active: DecisionFilter = counts[filter] === 0 ? 'all' : filter;
  const filtered = cardsInFilter(props.cards, active);
  const visible = expanded ? filtered : filtered.slice(0, STACK_LIMIT[props.size]);
  const hidden = filtered.length - visible.length;

  return (
    <div className="space-y-3">
      <ToggleGroup
        aria-label={betaUiText('beta_6095f16bac42')}
        className="flex-wrap"
        onValueChange={(value) => {
          if (!isFilter(value)) return;
          setFilter(value);
          setExpanded(false);
        }}
        size="sm"
        type="single"
        value={active}
        variant="outline"
      >
        {DECISION_FILTERS.map((option) => (
          <ToggleGroupItem
            aria-label={`${DECISION_FILTER_LABEL[option]}, ${counts[option]}`}
            className="h-7 gap-1.5 px-2 text-xs"
            data-testid={`decisions-filter-${option}`}
            disabled={option !== 'all' && counts[option] === 0}
            key={option}
            value={option}
          >
            {DECISION_FILTER_LABEL[option]}
            <span className="font-mono text-muted-foreground tabular-nums">{counts[option]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <LayoutGroup>
        <motion.ul
          className="space-y-2"
          data-filter={active}
          data-testid="decisions-list"
          layout={!reduce}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((card) => (
              <motion.li
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                key={card.id}
                layout={!reduce}
                transition={
                  reduce ? { duration: 0 } : { type: 'spring', visualDuration: 0.4, bounce: 0.15 }
                }
              >
                <CardSlot card={card} props={props} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      </LayoutGroup>
      {hidden > 0 ? (
        <Button
          className="w-full text-xs"
          data-testid="decisions-show-more"
          onClick={() => setExpanded(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {betaUiText('beta_0df6f1cad36c')} {hidden} {betaUiText('beta_187897ce0afc')}
        </Button>
      ) : null}
    </div>
  );
}

function NoDecisions({
  mode,
  onCreatePortfolio,
}: {
  mode: ControlContext['mode'];
  onCreatePortfolio: () => void;
}) {
  const betaUiText = useBetaTranslations('scale');

  if (mode === 'setup') {
    return (
      <div className="space-y-2" data-testid="decisions-empty">
        <p className="text-muted-foreground text-sm">{betaUiText('beta_b10191dc4407')}</p>
        <Button data-testid="decision-create" onClick={onCreatePortfolio} size="sm" type="button">
          <PlusIcon aria-hidden="true" />
          {betaUiText('beta_a53487ce414c')}
        </Button>
      </div>
    );
  }
  return (
    <p className="text-muted-foreground text-sm" data-testid="decisions-empty">
      {betaUiText('beta_231603abdef3')}
    </p>
  );
}

export function DecisionsView(props: DecisionsViewProps) {
  if (props.cards.length === 0) {
    return <NoDecisions mode={props.context.mode} onCreatePortfolio={props.onCreatePortfolio} />;
  }
  return props.size === 's' ? <DecisionsSummary {...props} /> : <DecisionsStackList {...props} />;
}
