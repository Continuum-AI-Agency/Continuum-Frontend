'use client';

// What autopilot may approve on its own — one switch per scope, one line each. Every change
// saves at once (a partial patch the RPC merges), like Stop / Resume beside it; nothing
// waits for the form's Save. Everything is still recommended; anything a scope creates
// is born paused.
//
// 'Move budget between platforms' (decision 18) is off unless someone turns it on, and the
// field says a person should approve those moves. Until the database accepts the key
// (20261005120000) the merged patch fails its check (23514) and nothing is saved; the field
// says the scope is not available yet rather than flicking a switch that did nothing.

import type { AutopilotScope, AutopilotScopes } from '@continuum/contracts';
import { AUTOPILOT_SCOPE_COPY, DEFAULT_AUTOPILOT_SCOPES } from '@continuum/contracts';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
};

export function AutopilotScopesField({
  portfolioId,
  scopes,
  noActor,
  disabled,
  savingScope,
  onChange,
}: AutopilotScopesFieldProps) {
  const current = scopes ?? DEFAULT_AUTOPILOT_SCOPES;
  const [unavailable, setUnavailable] = useState<ReadonlySet<AutopilotScope>>(new Set());

  const change = (scope: AutopilotScope, enabled: boolean) => {
    const saving = onChange(scope, enabled);
    if (!saving) return;
    saving.catch((error: unknown) => {
      if (rejectsTheKey(error)) setUnavailable((prev) => new Set(prev).add(scope));
    });
  };

  return (
    <div className="space-y-2" data-testid="autopilot-scopes">
      <ul className="space-y-1.5">
        {ORDER.map((scope) => {
          const copy = AUTOPILOT_SCOPE_COPY[scope];
          const id = `autopilot-scope-${scope}-${portfolioId}`;
          const notYet = unavailable.has(scope);
          return (
            <li className="flex items-start gap-2" key={scope}>
              <Switch
                checked={current[scope] ?? false}
                disabled={disabled || notYet || savingScope !== null}
                id={id}
                onCheckedChange={(checked) => change(scope, checked)}
              />
              <div className="min-w-0">
                <Label className="flex items-center gap-1.5" htmlFor={id}>
                  {copy.label}
                  {savingScope === scope ? (
                    <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
                  ) : null}
                </Label>
                <p className="text-xs text-muted-foreground">{copy.body}</p>
                {scope === 'budget_move' ? (
                  <p
                    className="font-medium text-foreground text-xs"
                    data-testid="budget-move-recommendation"
                  >
                    {MOVE_APPROVAL_RECOMMENDATION}
                  </p>
                ) : null}
                {notYet ? (
                  <p
                    className="text-amber-600 text-xs dark:text-amber-400"
                    data-testid="budget-move-unavailable"
                    role="status"
                  >
                    This is not available yet for this portfolio. Nothing was saved.
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Everything is still recommended in the queue. Nothing a scope creates spends until you
        activate it. Stop halts all of these.
      </p>
      {noActor ? (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
          Autopilot needs a person to act as. Toggle any scope once so your account is recorded as
          the approver.
        </p>
      ) : null}
    </div>
  );
}
