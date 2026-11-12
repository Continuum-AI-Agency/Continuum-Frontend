'use client';
import {accountFamilyCopy} from '@/lib/paid-media/accountPresentation';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

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
  const uiText = useTranslations('scale');
  return (
    <div className="space-y-0.5">
      <h2 className="font-semibold text-base text-foreground tracking-tight">
        {uiText('what_this_account_may_do_on_its_own_bec3abe')}
      </h2>
      <p className="text-muted-foreground text-xs">
        {uiText('every_portfolio_on_this_account_unless_its_ow_a98d010')}
      </p>
    </div>
  );
}

export function FamilyCeilings({ current, defaults, onSetFamily, error }: FamilyCeilingsProps) {
  const uiText = useTranslations('scale');
  const STATE_COPY: Record<InsightState, { label: string; hint: string }> = useMemo(
    () => ({
      off: { label: uiText('never_6300ef8'), hint: uiText('not_even_as_a_suggestion_832f77e') },
      recommend: { label: uiText('suggest_4b5a16b'), hint: uiText('tell_me_and_wait_for_me_e8ec432') },
      autopilot: { label: uiText('doItFamily'), hint: uiText('act_without_asking_643e4ef') },
    }),
    [uiText],
  );

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
                  {accountFamilyCopy(family,uiText).label}
                </p>
                <p className="text-muted-foreground text-xs">{accountFamilyCopy(family,uiText).body}</p>
                {/* Says the value is the one we shipped, not one anybody chose — so a row nobody
                 *  has touched does not read as a decision someone made. */}
                {untouched ? (
                  <p className="text-muted-foreground/80 text-xs" data-testid="family-shipped">
                    {uiText('not_set_using_what_we_ship_for_this_kind_of_a_f7bd841')}
                  </p>
                ) : null}
              </div>
              <fieldset className="ml-auto inline-flex shrink-0 gap-0.5 rounded-lg border-0 bg-muted/60 p-0.5">
                <legend className="sr-only">{accountFamilyCopy(family,uiText).label}</legend>
                {insightStateSchema.options.map((state) => (
                  <button
                    aria-pressed={state === active}
                    className={cn(
                      'hit-area rounded-md px-2.5 py-1 font-medium text-xs transition-colors',
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
