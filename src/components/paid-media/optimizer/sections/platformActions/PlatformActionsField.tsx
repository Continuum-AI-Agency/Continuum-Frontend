'use client';

// The action kinds this portfolio may execute on each platform the executor writes for (Google,
// TikTok), one row per platform, each saved on its own as the platform limits are. A kind left
// unticked is refused at reservation, whatever a card proposes. Ticking one switches no write
// on: every card still needs a person's approval, and a platform's writes stay off for the
// portfolio until they are enabled there.
//
// An EMPTY list is an operator's decision, not a client's: it is how a read-only account is
// held (Vivo 47's Google account, 20261014220000, decision 14). So a row stored empty shows
// locked, and the control never saves an empty list itself. The write switch (apply_enabled)
// stays the gate either way; the set RPC itself accepts any member's list.

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import {
  ACTION_KIND_COPY,
  type ActionKind,
  DEFAULT_ALLOWED_ACTIONS,
  type PlatformActions,
  platformActionKinds,
  usePortfolioPlatformActions,
  useSetPortfolioPlatformActions,
} from './usePortfolioPlatformActions';

export function PlatformActionsField({ portfolioId }: { portfolioId: string }) {
  const actions = usePortfolioPlatformActions(portfolioId);
  const setActions = useSetPortfolioPlatformActions(portfolioId);

  if (actions.status === 'loading') {
    return <p className="text-xs text-muted-foreground">Reading the allowed actions…</p>;
  }
  if (actions.status === 'unavailable') {
    return (
      <p className="text-xs text-muted-foreground">Allowed actions aren&rsquo;t available yet.</p>
    );
  }
  if (actions.status === 'error') {
    return <p className="text-xs text-destructive">The allowed actions could not be read.</p>;
  }
  if (actions.platforms.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This portfolio holds no Google or TikTok campaigns. Meta&rsquo;s changes follow the
        portfolio&rsquo;s mode.
      </p>
    );
  }
  return (
    <div data-testid="platform-actions">
      {actions.platforms.map((row) => (
        <PlatformActionsRow
          // Remount when the stored list changes, so the boxes re-seed from what was saved.
          key={`${row.platform}:${row.allowed?.join(',') ?? 'mixed'}`}
          portfolioId={portfolioId}
          row={row}
          save={(allowed) => setActions.mutateAsync({ platform: row.platform, allowed })}
        />
      ))}
    </div>
  );
}

function PlatformActionsRow({
  portfolioId,
  row,
  save,
}: {
  portfolioId: string;
  row: PlatformActions;
  save: (allowed: readonly ActionKind[]) => Promise<unknown>;
}) {
  const kinds = platformActionKinds(row.platform);
  const stored = kinds.filter((kind) => row.allowed?.includes(kind));
  const [chosen, setChosen] = useState<ActionKind[]>(stored);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = chosen.length !== stored.length || chosen.some((kind) => !stored.includes(kind));
  const name = PLATFORM_NAMES[row.platform];
  const locked = row.allowed !== null && row.allowed.length === 0;

  function toggle(kind: ActionKind, on: boolean) {
    setChosen((current) => kinds.filter((k) => (k === kind ? on : current.includes(k))));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await save(chosen);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The actions could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset
      className="grid gap-1.5 py-2.5 @lg/sheet:grid-cols-[11rem_minmax(0,1fr)] @lg/sheet:gap-6"
      data-platform={row.platform}
    >
      <legend className="sr-only">{name} actions</legend>
      <p aria-hidden="true" className="self-start text-muted-foreground text-sm @lg/sheet:pt-0.5">
        {name}
      </p>
      <div className="min-w-0 space-y-2">
        {row.allowed === null ? (
          <p className="text-xs text-muted-foreground">
            The {row.accounts} {name} accounts here allow different actions; saving sets the same
            list on each.
          </p>
        ) : null}
        <ul className="space-y-2">
          {kinds.map((kind) => {
            const id = `manage-platform-action-${row.platform}-${kind}-${portfolioId}`;
            return (
              <li className="flex items-start gap-2.5" key={kind}>
                <Checkbox
                  checked={chosen.includes(kind)}
                  className="mt-0.5"
                  disabled={saving || locked}
                  id={id}
                  onCheckedChange={(on) => toggle(kind, on === true)}
                />
                <label className="min-w-0 space-y-0.5" htmlFor={id}>
                  <span className="block text-foreground text-sm">
                    {ACTION_KIND_COPY[kind].label}
                    {DEFAULT_ALLOWED_ACTIONS.includes(kind) ? (
                      <span className="text-muted-foreground"> · default</span>
                    ) : null}
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    {ACTION_KIND_COPY[kind].explanation}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {locked ? (
          <p className="text-xs text-muted-foreground" data-testid="platform-actions-locked">
            Nothing may be changed on {name} for this portfolio: its account is read-only. Only
            Continuum can change that.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              disabled={!dirty || saving || chosen.length === 0}
              onClick={() => void handleSave()}
              size="sm"
              type="button"
              variant="outline"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Save
            </Button>
            {chosen.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Keep at least one. Switching {name} off for a portfolio is Continuum&rsquo;s call.
              </p>
            ) : null}
          </div>
        )}
        {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}
      </div>
    </fieldset>
  );
}
