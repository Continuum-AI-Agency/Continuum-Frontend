'use client';
import { useTranslations } from 'next-intl';

import { useUiErrorMessage } from '@/i18n/errors';

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
  platformActionCopy,
  type ActionKind,
  DEFAULT_ALLOWED_ACTIONS,
  type PlatformActions,
  platformActionKinds,
  usePortfolioPlatformActions,
  useSetPortfolioPlatformActions,
} from './usePortfolioPlatformActions';

export function PlatformActionsField({ portfolioId }: { portfolioId: string }) {
  const uiText = useTranslations('scale');
  const actions = usePortfolioPlatformActions(portfolioId);
  const setActions = useSetPortfolioPlatformActions(portfolioId);

  if (actions.status === 'loading') {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('reading_the_allowed_actions_c22477a')}
      </p>
    );
  }
  if (actions.status === 'unavailable') {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('allowed_actions_aren_t_available_yet_a2321e0')}
      </p>
    );
  }
  if (actions.status === 'error') {
    return (
      <p className="text-xs text-destructive">
        {uiText('the_allowed_actions_could_not_be_read_4f5d924')}
      </p>
    );
  }
  if (actions.platforms.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('this_portfolio_holds_no_google_or_tiktok_camp_800338d')}
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
  const uiText = useTranslations('scale');
  const formatUiError = useUiErrorMessage();
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
      setSaveError(formatUiError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset
      className="grid gap-1.5 py-2.5 @lg/sheet:grid-cols-[11rem_minmax(0,1fr)] @lg/sheet:gap-6"
      data-platform={row.platform}
    >
      <legend className="sr-only">{uiText.rich('sentence_6f4adc336b07', { v0: name })}</legend>
      <p aria-hidden="true" className="self-start text-muted-foreground text-sm @lg/sheet:pt-0.5">
        {name}
      </p>
      <div className="min-w-0 space-y-2">
        {row.allowed === null ? (
          <p className="text-xs text-muted-foreground">
            {uiText.rich('sentence_0465d47fed1a', { v0: row.accounts, v1: name })}
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
                    {platformActionCopy(kind,uiText).label}
                    {DEFAULT_ALLOWED_ACTIONS.includes(kind) ? (
                      <span className="text-muted-foreground">{uiText('default_45e596b')}</span>
                    ) : null}
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    {platformActionCopy(kind,uiText).explanation}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {locked ? (
          <p className="text-xs text-muted-foreground" data-testid="platform-actions-locked">
            {uiText.rich('sentence_eea88e118c5f', { v0: name })}
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
              {uiText.rich('sentence_e66795836de4', {
                v0: () => (saving ? <Loader2 className="size-3.5 animate-spin" /> : null),
              })}
            </Button>
            {chosen.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {uiText.rich('sentence_543cc3f01702', { v0: name })}
              </p>
            ) : null}
          </div>
        )}
        {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}
      </div>
    </fieldset>
  );
}
