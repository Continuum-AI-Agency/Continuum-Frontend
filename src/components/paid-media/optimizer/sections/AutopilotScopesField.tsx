'use client';
import { useTranslations as useBetaTranslations, useTranslations } from 'next-intl';

// What autopilot may approve on its own — one switch per scope, one line each. Every change
// saves at once (a partial patch the RPC merges), like Stop / Resume beside it; nothing
// waits for the form's Save. Everything is still recommended; anything a scope creates
// is born paused.
//
// 'Move budget between platforms' (decision 18) is off unless someone turns it on, and the
// field says a person should approve those moves. Until the database accepts the key
// (20261005120000) the merged patch fails its check (23514) and nothing is saved; the field
// says the scope is not available yet rather than flicking a switch that did nothing.
//
// Two shapes of the same field: the Manage panel's `list` (each scope with what it does), and
// the Automations page's `chips` (a row of switches, what each does on hover), where every
// portfolio's scopes sit under its autonomy dial.

import type { AutopilotScope, AutopilotScopes } from '@continuum/contracts';
import { AUTOPILOT_SCOPE_COPY, DEFAULT_AUTOPILOT_SCOPES } from '@continuum/contracts';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { MOVE_APPROVAL_RECOMMENDATION } from './crossPlatformMove/queuedMoveModel';

const ORDER: AutopilotScope[] = [
  'budget',
  'creative_swap',
  'audience_change',
  'new_audience',
  'new_creatives',
  'budget_move',
];

const CHECK_VIOLATION = '23514';

function rejectsTheKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === CHECK_VIOLATION
  );
}

export type AutopilotScopesFieldProps = {
  portfolioId: string;
  scopes: AutopilotScopes | null | undefined;
  /** Nobody to act as: the portfolio was never armed by a person. */
  noActor: boolean;
  disabled?: boolean;
  savingScope: AutopilotScope | null;
  /** Saves one scope. A returned promise lets the field read a refusal of the key itself. */
  onChange: (scope: AutopilotScope, enabled: boolean) => void | Promise<unknown>;
  /** `list` (default): every scope with what it does. `chips`: a compact row of switches. */
  variant?: 'list' | 'chips';
  /** The scopes this portfolio can use; every scope when absent. */
  shown?: (scope: AutopilotScope) => boolean;
};

function BudgetMoveLines({ notYet }: { notYet: boolean }) {
  const betaUiText = useBetaTranslations('scale');

  return (
    <>
      <p className="font-medium text-foreground text-xs" data-testid="budget-move-recommendation">
        {MOVE_APPROVAL_RECOMMENDATION}
      </p>
      {notYet ? (
        <p
          className="text-amber-600 text-xs dark:text-amber-400"
          data-testid="budget-move-unavailable"
          role="status"
        >
          {betaUiText('beta_9ae9ac62492b')}
        </p>
      ) : null}
    </>
  );
}

export function AutopilotScopesField({
  portfolioId,
  scopes,
  noActor,
  disabled,
  savingScope,
  onChange,
  variant = 'list',
  shown,
}: AutopilotScopesFieldProps) {
  const betaUiText = useBetaTranslations('scale');

  const uiText = useTranslations('scale');
  const current = scopes ?? DEFAULT_AUTOPILOT_SCOPES;
  const [unavailable, setUnavailable] = useState<ReadonlySet<AutopilotScope>>(new Set());
  const order = shown ? ORDER.filter(shown) : ORDER;

  const change = (scope: AutopilotScope, enabled: boolean) => {
    const saving = onChange(scope, enabled);
    if (!saving) return;
    saving.catch((error: unknown) => {
      if (rejectsTheKey(error)) setUnavailable((prev) => new Set(prev).add(scope));
    });
  };

  const scopeSwitch = (scope: AutopilotScope, id: string) => (
    <Switch
      checked={current[scope] ?? false}
      disabled={disabled || unavailable.has(scope) || savingScope !== null}
      id={id}
      onCheckedChange={(checked) => change(scope, checked)}
      size={variant === 'chips' ? 'sm' : 'default'}
    />
  );

  const noActorLine = noActor ? (
    <p className="text-xs text-amber-600 dark:text-amber-400">{betaUiText('beta_ed2a16f6d214')}</p>
  ) : null;

  if (variant === 'chips') {
    return (
      <div className="space-y-1.5" data-testid="autopilot-scopes">
        <ul className="flex flex-wrap gap-1.5">
          {order.map((scope) => {
            const copy = AUTOPILOT_SCOPE_COPY[scope];
            const id = `autopilot-scope-${scope}-${portfolioId}`;
            return (
              <li
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border bg-background py-1 pr-2.5 pl-1.5',
                  (current[scope] ?? false) && !disabled && 'border-primary/40',
                )}
                data-scope={scope}
                key={scope}
                title={copy.body}
              >
                {scopeSwitch(scope, id)}
                <Label className="flex items-center gap-1 font-medium text-xs" htmlFor={id}>
                  {copy.label}
                  {savingScope === scope ? (
                    <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
                  ) : null}
                </Label>
              </li>
            );
          })}
        </ul>
        {order.includes('budget_move') && (current.budget_move ?? false) ? (
          <BudgetMoveLines notYet={unavailable.has('budget_move')} />
        ) : unavailable.has('budget_move') ? (
          <BudgetMoveLines notYet />
        ) : null}
        {noActorLine}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="autopilot-scopes">
      <ul className="space-y-1.5">
        {order.map((scope) => {
          const copy = AUTOPILOT_SCOPE_COPY[scope];
          const id = `autopilot-scope-${scope}-${portfolioId}`;
          return (
            <li className="flex items-start gap-2" key={scope}>
              {scopeSwitch(scope, id)}
              <div className="min-w-0">
                <Label className="flex items-center gap-1.5" htmlFor={id}>
                  {copy.label}
                  {savingScope === scope ? (
                    <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
                  ) : null}
                </Label>
                <p className="text-xs text-muted-foreground">{copy.body}</p>
                {scope === 'budget_move' ? (
                  <BudgetMoveLines notYet={unavailable.has(scope)} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {uiText('everything_is_still_recommended_in_the_queue__9f695d8')}
      </p>
      {noActorLine}
    </div>
  );
}
