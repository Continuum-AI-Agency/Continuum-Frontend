'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// Spent against the plan as one bar, with a tick where the plan expected spend to be by now.
import type { PacingCurrencyGroup } from './pacingModel';

export function PlanBar({
  group,
}: {
  group: Pick<PacingCurrencyGroup, 'spent' | 'plan' | 'expected'>;
}) {
  const betaUiText = useBetaTranslations('dashboard');

  const share = (value: number) => Math.max(0, Math.min(100, (value / group.plan) * 100));
  return (
    <div
      aria-label={betaUiText('beta_c0cf136b57ad', {
        value0: String(Math.round(share(group.spent))),
      })}
      className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      role="img"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${share(group.spent)}%` }} />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 w-0.5 bg-foreground/60"
        style={{ left: `${share(group.expected)}%` }}
      />
    </div>
  );
}
