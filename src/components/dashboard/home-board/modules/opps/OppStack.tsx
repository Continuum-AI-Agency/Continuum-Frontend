'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The expanded stack: every opportunity the read returned, biggest first as it sorted them, each
// with its figure and why the figure is in those units. Read-only: the decisions themselves stay
// in the Optimizer's queue below it.

import type { HomeOpportunitiesData } from '@continuum/contracts';
import { oppConfidenceLine, oppImpactLine } from './oppsStack';

export function OppStack({ stack }: { stack: HomeOpportunitiesData }) {
  const betaUiText = useBetaTranslations('dashboard');

  return (
    <section className="space-y-2" data-testid="home-opps-stack">
      <h4 className="font-medium text-sm">
        {betaUiText('beta_cb82eb8a0caa')}
        {stack.goal ? (
          <span className="font-normal text-muted-foreground">
            {' '}
            {betaUiText('beta_558178d3eb6d')} {stack.goal.label}
          </span>
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
          {betaUiText('beta_b344d80e24a3')} {stack.opportunities.length}{' '}
          {betaUiText('beta_1a5a56a5cfda')} {stack.total}.
        </p>
      ) : null}
    </section>
  );
}
