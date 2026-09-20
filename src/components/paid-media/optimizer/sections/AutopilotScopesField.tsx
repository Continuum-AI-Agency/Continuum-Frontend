'use client';

// What autopilot may approve on its own — five switches, one line each. Every change
// saves at once (a partial patch the RPC merges), like Stop / Resume beside it; nothing
// waits for the form's Save. Everything is still recommended; anything a scope creates
// is born paused.

import type { AutopilotScope, AutopilotScopes } from '@continuum/contracts';
import { AUTOPILOT_SCOPE_COPY, DEFAULT_AUTOPILOT_SCOPES } from '@continuum/contracts';
import { Loader2Icon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const ORDER: AutopilotScope[] = [
  'budget',
  'creative_swap',
  'audience_change',
  'new_audience',
  'new_creatives',
];

export type AutopilotScopesFieldProps = {
  portfolioId: string;
  scopes: AutopilotScopes | null | undefined;
  /** Nobody to act as: the portfolio was never armed by a person. */
  noActor: boolean;
  disabled?: boolean;
  savingScope: AutopilotScope | null;
  onChange: (scope: AutopilotScope, enabled: boolean) => void;
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
  return (
    <div className="space-y-2" data-testid="autopilot-scopes">
      <ul className="space-y-1.5">
        {ORDER.map((scope) => {
          const copy = AUTOPILOT_SCOPE_COPY[scope];
          const id = `autopilot-scope-${scope}-${portfolioId}`;
          return (
            <li className="flex items-start gap-2" key={scope}>
              <Switch
                checked={current[scope]}
                disabled={disabled || savingScope !== null}
                id={id}
                onCheckedChange={(checked) => onChange(scope, checked)}
              />
              <div className="min-w-0">
                <Label className="flex items-center gap-1.5" htmlFor={id}>
                  {copy.label}
                  {savingScope === scope ? (
                    <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
                  ) : null}
                </Label>
                <p className="text-2xs text-muted-foreground">{copy.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-2xs text-muted-foreground">
        Everything is still recommended in the queue. Nothing a scope creates spends until you
        activate it. Stop halts all of these.
      </p>
      {noActor ? (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-2xs text-amber-600 dark:text-amber-400">
          Autopilot needs a person to act as. Toggle any scope once so your account is recorded as
          the approver.
        </p>
      ) : null}
    </div>
  );
}
