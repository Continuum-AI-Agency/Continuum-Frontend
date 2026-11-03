'use client';

// One decision: a stripe in its tier's colour, the tier and the group, the Optimizer's title,
// the line that names the figures, the bars its own figures compare, then what acting is
// worth and the button the mode allows. On a narrow card the button drops under the body; from
// 32rem it sits on the right, as in the design.

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  LockIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { CHECKLIST_STATUS } from '../../../platformCards/platformCardModel';
import type { BoardPlatform } from '../../types';
import { DecisionControlView, type DismissState, DismissView } from './DecisionControls';
import { type DecisionControl, type DismissControl, OPEN_PLATFORM_LABEL } from './decisionControl';
import {
  DECISION_FILTER_LABEL,
  DECISION_TIER_LABEL,
  type DecisionCard,
  type DecisionStep,
  type DecisionTier,
} from './decisionsModel';
import { EvidenceBars } from './EvidenceBars';
import { useWriteLanded } from './landedWrite';

const STRIPE: Record<DecisionTier, string> = {
  high: 'bg-destructive',
  medium: 'bg-warning',
  low: 'bg-muted-foreground/40',
};

const TIER_BADGE: Record<DecisionTier, 'destructive' | 'warning' | 'muted'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
};

function StepItem({ step }: { step: DecisionStep }) {
  const status = step.status ? CHECKLIST_STATUS[step.status] : null;
  return (
    <li data-status={step.status ?? 'none'} data-testid="decision-step">
      <span className={cn(step.status === 'done' && 'text-muted-foreground line-through')}>
        {step.label}
      </span>
      {status ? (
        <span className="text-muted-foreground">
          {' '}
          · <span aria-hidden="true">{status.glyph}</span> {status.label}
        </span>
      ) : null}
      {step.detail ? <span className="block text-muted-foreground">{step.detail}</span> : null}
    </li>
  );
}

export type DecisionCardViewProps = {
  card: DecisionCard;
  control: DecisionControl;
  dismiss: DismissControl | null;
  dismissState: DismissState;
  platform: BoardPlatform;
  /** The client runs the account: the steps are what the client does. */
  clientExecutes: boolean;
  /** The name of the portfolio the card sends a person to, when the board knows it. */
  portfolioName: string | null;
  onDismiss: (recommendationId: string) => void;
  onSelectPortfolio: (portfolioId: string) => void;
  onCreatePortfolio: () => void;
};

export function DecisionCardView({
  card,
  control,
  dismiss,
  dismissState,
  platform,
  clientExecutes,
  portfolioName,
  onDismiss,
  onSelectPortfolio,
  onCreatePortfolio,
}: DecisionCardViewProps) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const stepsId = useId();
  const hasSteps = card.steps.length > 0;
  const { portfolioId } = card;
  const applied = useWriteLanded(
    control.kind === 'approve' ? (control.target.recommendationId ?? null) : null,
  );

  return (
    <Card
      className="grid grid-cols-[4px_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl py-0"
      data-applied={applied ? 'true' : undefined}
      data-control={control.kind}
      data-group={card.group}
      data-recommendation-id={card.recommendationId ?? undefined}
      data-testid="decision-card"
      data-tier={card.tier}
    >
      <span aria-hidden="true" className={cn('rounded-r-sm', STRIPE[card.tier])} />
      <div className="@container/decision min-w-0">
        <div className="grid gap-3 p-3 @lg/decision:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge data-testid="decision-tier" variant={TIER_BADGE[card.tier]}>
                {card.tier === 'low' ? null : <AlertTriangleIcon aria-hidden="true" />}
                {DECISION_TIER_LABEL[card.tier]}
              </Badge>
              <Badge data-testid="decision-group" variant="outline">
                {DECISION_FILTER_LABEL[card.group]}
              </Badge>
              {card.doubted ? (
                <span className="text-warning text-xs" data-testid="decision-doubted">
                  Affected by the guard
                </span>
              ) : null}
            </div>
            <h4
              className="break-words text-pretty font-semibold text-foreground text-sm leading-snug"
              data-testid="decision-title"
            >
              {card.title}
            </h4>
            {card.figure ? (
              <p
                className="line-clamp-3 break-words text-muted-foreground text-xs leading-relaxed"
                data-testid="decision-figure"
                title={card.figure}
              >
                {card.figure}
              </p>
            ) : null}
            <EvidenceBars bars={card.bars} />
            {card.note ? (
              <p
                className="flex items-start gap-1.5 text-muted-foreground text-xs"
                data-testid="decision-note"
              >
                <LockIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 break-words">{card.note}</span>
              </p>
            ) : null}
            {hasSteps ? (
              <Collapsible onOpenChange={setStepsOpen} open={stepsOpen}>
                <CollapsibleTrigger
                  className="hit-area inline-flex items-center gap-1 font-medium text-primary-ink text-xs hover:underline"
                  data-testid="decision-steps-toggle"
                >
                  {clientExecutes ? 'What the client does' : 'Steps'} · {card.steps.length}
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={cn(
                      'size-3.5 transition-transform motion-reduce:transition-none',
                      stepsOpen && 'rotate-180',
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-1.5" id={stepsId}>
                  <ol
                    className="list-decimal space-y-1 pl-5 text-foreground text-xs"
                    data-testid="decision-steps"
                  >
                    {card.steps.map((step) => (
                      <StepItem key={step.label} step={step} />
                    ))}
                  </ol>
                  {control.kind === 'fix' ? (
                    <a
                      className="hit-area inline-flex items-center gap-1 font-medium text-primary-ink text-xs hover:underline"
                      data-testid="decision-open-platform"
                      href={control.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {OPEN_PLATFORM_LABEL[platform]}
                      <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
                    </a>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            {portfolioId ? (
              <button
                className="hit-area inline-flex max-w-full items-center gap-1 text-left text-muted-foreground text-xs hover:text-foreground hover:underline"
                data-testid="decision-portfolio"
                onClick={() => onSelectPortfolio(portfolioId)}
                type="button"
              >
                <span className="truncate">{portfolioName ?? 'Open portfolio'}</span>
                <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0" />
              </button>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 @lg/decision:flex-col @lg/decision:items-end">
            {card.impact ? (
              <Badge
                className="h-auto max-w-full shrink whitespace-normal text-left font-semibold tabular-nums"
                data-testid="decision-impact"
                variant="secondary"
              >
                {card.impact}
              </Badge>
            ) : null}
            {dismissState === 'done' ? (
              <span
                className="text-muted-foreground text-xs"
                data-testid="decision-dismissed"
                role="status"
              >
                Dismissed
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 @lg/decision:justify-end">
                <DecisionControlView
                  applied={applied}
                  control={control}
                  currency={card.currency}
                  hasSteps={hasSteps}
                  onCreatePortfolio={onCreatePortfolio}
                  onToggleSteps={() => setStepsOpen((open) => !open)}
                  stepsId={stepsId}
                  stepsOpen={stepsOpen}
                />
                {dismiss && !applied ? (
                  <DismissView control={dismiss} onDismiss={onDismiss} state={dismissState} />
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
