// The line above the Home that says how it reads this brand: the goal it leads with, how
// Continuum works the account, the module it opens with and the biggest opportunity waiting.
// Everything on it comes from the reading, so the order of the modules below is never a mystery.

import { HOME_MODULE_LABELS, type HomeBrandReading, type HomeMode } from '@continuum/contracts';
import { cn } from '@/lib/utils';

const MODE_TONE: Record<HomeMode, string> = {
  setup: 'text-muted-foreground',
  fix: 'text-destructive-ink',
  operate: 'text-success-ink',
  approve: 'text-primary-ink',
  recommend: 'text-foreground',
};

function Cell({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="line-clamp-2 text-sm font-medium" title={value}>
        {value}
      </span>
      <span className="text-2xs text-muted-foreground">{detail}</span>
    </div>
  );
}

export function HomeReadingStrip({ reading }: { reading: HomeBrandReading }) {
  const [first] = reading.modules;
  const [top] = reading.opportunities;
  const opening = first
    ? { value: HOME_MODULE_LABELS[first.id], detail: first.reason }
    : { value: 'Overview', detail: 'Every module in its usual place' };

  return (
    <section
      data-home-reading={reading.mode}
      aria-label="How the Home reads this brand"
      className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-4 py-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <Cell label="Goal" value={reading.goal.label} detail={reading.goal.detail} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">
          How Continuum works it
        </span>
        <span
          data-home-mode
          className={cn('truncate text-sm font-medium', MODE_TONE[reading.mode])}
        >
          {reading.modeLabel}
        </span>
        <span className="text-2xs text-muted-foreground">{reading.modeReason}</span>
      </div>
      <Cell label="Opens with" value={opening.value} detail={opening.detail} />
      <Cell
        label="Top opportunity"
        value={top ? top.title : 'Nothing waiting'}
        detail={
          top
            ? top.count > 0
              ? 'Open it in Performance +'
              : 'A suggestion from the reading'
            : 'No recommendation is waiting for a decision'
        }
      />
    </section>
  );
}
