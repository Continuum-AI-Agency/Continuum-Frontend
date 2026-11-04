'use client';

// The expanded stack: every opportunity the read returned, biggest first as it sorted them, each
// with its figure and why the figure is in those units. Read-only: the decisions themselves stay
// in the Optimizer's queue below it.

import type { HomeOpportunitiesData } from '@continuum/contracts';
import { oppConfidenceLine, oppImpactLine } from './oppsStack';

export function OppStack({ stack }: { stack: HomeOpportunitiesData }) {
  return (
    <section className="space-y-2" data-testid="home-opps-stack">
      <h4 className="font-medium text-sm">
        Biggest first
        {stack.goal ? (
          <span className="font-normal text-muted-foreground"> · priced in {stack.goal.label}</span>
        ) : null}
      </h4>
      <ul className="space-y-3">
        {stack.opportunities.map((card) => {
          const confidence = oppConfidenceLine(card);
          return (
            <li className="space-y-0.5 text-xs" data-testid="home-opps-stack-row" key={card.id}>
              <p className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 font-medium text-sm">{card.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {oppImpactLine(card, stack.goal)}
                </span>
              </p>
              {card.basis ? (
                <p className="break-words text-muted-foreground leading-snug">{card.basis}</p>
              ) : null}
              <p className="text-2xs text-muted-foreground leading-snug">
                {card.impact.goalUnitsBecause}
                {confidence ? ` · ${confidence}` : ''}
              </p>
            </li>
          );
        })}
      </ul>
      {stack.total > stack.opportunities.length ? (
        <p className="text-2xs text-muted-foreground">
          The {stack.opportunities.length} biggest of {stack.total}.
        </p>
      ) : null}
    </section>
  );
}
