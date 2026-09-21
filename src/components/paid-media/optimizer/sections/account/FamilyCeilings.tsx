'use client';

// What each kind of action is allowed to do, for this whole account.
//
// The card is where someone DECIDES to trust a recommendation — three weeks into watching it
// be right, looking at it. This is the other half: where that decision gets a boundary. An
// insight can never exceed its family, so without a way to move the family the per-insight
// switch is capped by something nobody can reach, and every account runs forever on the
// shipped defaults.
//
// `measurement` is absent on purpose. It approves nothing — it only ever tells you something.

import {
  ACTION_FAMILY_COPY,
  type ActionFamily,
  APPROVABLE_FAMILIES,
  type InsightState,
  insightStateSchema,
} from '@continuum/contracts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STATE_COPY: Record<InsightState, { label: string; hint: string }> = {
  off: { label: 'Never', hint: 'Not even as a suggestion.' },
  recommend: { label: 'Suggest', hint: 'Tell me, and wait for me.' },
  autopilot: { label: 'Do it', hint: 'Act without asking.' },
};

export type FamilyCeilingsProps = {
  /** What is set today, family by family. Absent means the shipped default answers. */
  current: Record<string, string>;
  /** The defaults the read was composed under, so a row shows the value actually in force. */
  defaults: Record<string, string>;
  onSetFamily: (family: ActionFamily, state: InsightState) => void;
  /** Named when a change was refused, so the row that failed says why. */
  error?: string | null;
};

function stateOf(
  family: ActionFamily,
  current: Record<string, string>,
  defaults: Record<string, string>,
): InsightState {
  const chosen = insightStateSchema.safeParse(current[family]);
  if (chosen.success) return chosen.data;
  const shipped = insightStateSchema.safeParse(defaults[family]);
  return shipped.success ? shipped.data : 'recommend';
}

export function FamilyCeilings({ current, defaults, onSetFamily, error }: FamilyCeilingsProps) {
  return (
    <details
      className="mt-3 rounded-lg border border-border/60 bg-card"
      data-testid="family-ceilings"
    >
      <summary className="cursor-pointer list-none px-4 py-2.5 text-foreground text-xs">
        What this account is allowed to do on its own
      </summary>
      <div className="space-y-1 border-border/60 border-t px-4 py-3">
        {APPROVABLE_FAMILIES.map((family) => {
          const active = stateOf(family, current, defaults);
          const untouched = !insightStateSchema.safeParse(current[family]).success;
          return (
            <div
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-1.5"
              data-family={family}
              key={family}
            >
              <div className="min-w-0">
                <p className="text-foreground text-xs">{ACTION_FAMILY_COPY[family].label}</p>
                <p className="text-3xs text-muted-foreground">{ACTION_FAMILY_COPY[family].body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {insightStateSchema.options.map((state) => (
                  <Button
                    aria-pressed={state === active}
                    className={cn('text-3xs', state === active && 'ring-1 ring-primary')}
                    data-state-option={state}
                    key={state}
                    onClick={() => onSetFamily(family, state)}
                    size="sm"
                    title={STATE_COPY[state].hint}
                    type="button"
                    variant={state === active ? 'secondary' : 'ghost'}
                  >
                    {STATE_COPY[state].label}
                  </Button>
                ))}
              </div>
              {/* Says the value is the one we shipped, not one anybody chose — so a row nobody
               *  has touched does not read as a decision someone made. */}
              {untouched ? (
                <p className="w-full text-3xs text-muted-foreground" data-testid="family-shipped">
                  Not set — using what we ship for this kind of account.
                </p>
              ) : null}
            </div>
          );
        })}
        {error ? (
          <p className="text-2xs text-destructive" data-testid="family-error">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
