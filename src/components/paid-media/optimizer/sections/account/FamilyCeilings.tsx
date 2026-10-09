'use client';

// What each kind of action is allowed to do, for this whole account.
//
// The card is where someone DECIDES to trust a recommendation — three weeks into watching it
// be right, looking at it. This is the other half: where that decision gets a boundary. An
// insight can never exceed its family, so without a way to move the family the per-insight
// switch is capped by something nobody can reach, and every account runs forever on the
// shipped defaults.
//
// It is an open list on the Automations tab, not a folded strip. It used to be a one-line
// `<details>` between the account read and the portfolio list on Overview, and a control that
// has to be found before it can be used is a control that stays on its defaults.
//
// `measurement` is absent on purpose. It approves nothing — it only ever tells you something.

import {
  ACTION_FAMILY_COPY,
  type ActionFamily,
  APPROVABLE_FAMILIES,
  type InsightState,
  insightStateSchema,
} from '@continuum/contracts';
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

/** The section title, shared with the pending note so the tab reads the same before and after
 *  the first account read lands. */
export function FamilyCeilingsHeading() {
  return (
    <div className="space-y-0.5">
      <h2 className="font-semibold text-base text-foreground tracking-tight">
        What this account may do on its own
      </h2>
      <p className="text-muted-foreground text-xs">
        Every portfolio on this account, unless its own settings say less.
      </p>
    </div>
  );
}

export function FamilyCeilings({ current, defaults, onSetFamily, error }: FamilyCeilingsProps) {
  return (
    <section className="space-y-2" data-testid="family-ceilings">
      <FamilyCeilingsHeading />
      <div className="divide-y divide-border/60">
        {APPROVABLE_FAMILIES.map((family) => {
          const active = stateOf(family, current, defaults);
          const untouched = !insightStateSchema.safeParse(current[family]).success;
          return (
            <div
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3"
              data-family={family}
              key={family}
            >
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-semibold text-foreground text-sm">
                  {ACTION_FAMILY_COPY[family].label}
                </p>
                <p className="text-muted-foreground text-xs">{ACTION_FAMILY_COPY[family].body}</p>
                {/* Says the value is the one we shipped, not one anybody chose — so a row nobody
                 *  has touched does not read as a decision someone made. */}
                {untouched ? (
                  <p className="text-muted-foreground/80 text-xs" data-testid="family-shipped">
                    Not set — using what we ship for this kind of account.
                  </p>
                ) : null}
              </div>
              <fieldset className="ml-auto inline-flex shrink-0 gap-0.5 rounded-lg border-0 bg-muted/60 p-0.5">
                <legend className="sr-only">{ACTION_FAMILY_COPY[family].label}</legend>
                {insightStateSchema.options.map((state) => (
                  <button
                    aria-pressed={state === active}
                    className={cn(
                      'rounded-md px-2.5 py-1 font-medium text-xs transition-colors',
                      state === active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    data-state-option={state}
                    key={state}
                    onClick={() => onSetFamily(family, state)}
                    title={STATE_COPY[state].hint}
                    type="button"
                  >
                    {STATE_COPY[state].label}
                  </button>
                ))}
              </fieldset>
            </div>
          );
        })}
      </div>
      {error ? (
        <p className="text-xs text-destructive" data-testid="family-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
