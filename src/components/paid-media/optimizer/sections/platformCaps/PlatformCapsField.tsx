'use client';
import { useTranslations } from 'next-intl';

import { useUiErrorMessage } from '@/i18n/errors';

// One optional daily limit per platform among the portfolio's members, each in that platform
// account's own currency. Each row saves on its own (optimizer_set_portfolio_platform_cap), as
// the autopilot scopes do: the limit is a per-platform guardrail beside the portfolio form, not
// a column of it. Amounts are never added across platforms, so two currencies never meet here.

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizeCurrency } from '../../format';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import { parsePlatformCapInput, platformCapLabel, platformCapToInput } from '../portfolioFields';
import {
  type PlatformCap,
  usePortfolioPlatformCaps,
  useSetPortfolioPlatformCap,
} from './usePortfolioPlatformCaps';

export function PlatformCapsField({ portfolioId }: { portfolioId: string }) {
  const uiText = useTranslations('scale');
  const caps = usePortfolioPlatformCaps(portfolioId);
  const setCap = useSetPortfolioPlatformCap(portfolioId);

  if (caps.status === 'loading') {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('reading_the_platform_limits_9b90a4d')}
      </p>
    );
  }
  if (caps.status === 'unavailable') {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('per_platform_limits_aren_t_available_yet_c61c917')}
      </p>
    );
  }
  if (caps.status === 'error') {
    return (
      <p className="text-xs text-destructive">
        {uiText('the_platform_limits_could_not_be_read_a27fe87')}
      </p>
    );
  }
  if (caps.caps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('this_portfolio_has_no_platform_accounts_to_li_58a54af')}
      </p>
    );
  }
  return (
    <div>
      {caps.caps.map((cap) => (
        <PlatformCapRow
          // Remount when the stored cap changes, so the input re-seeds from what was saved.
          key={`${cap.platform}:${cap.dailyCapMinor ?? 'none'}`}
          cap={cap}
          portfolioId={portfolioId}
          save={(dailyCapMinor) => setCap.mutateAsync({ platform: cap.platform, dailyCapMinor })}
        />
      ))}
    </div>
  );
}

function PlatformCapRow({
  cap,
  portfolioId,
  save,
}: {
  cap: PlatformCap;
  portfolioId: string;
  save: (dailyCapMinor: number | null) => Promise<unknown>;
}) {
  const uiText = useTranslations('scale');
  const formatUiError = useUiErrorMessage();
  const currency = normalizeCurrency(cap.currency);
  const stored = platformCapToInput(cap.dailyCapMinor, cap.platform, currency);
  const [value, setValue] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const parsed = parsePlatformCapInput(value, cap.platform, currency,uiText);
  const dirty = value.trim() !== stored;
  const id = `manage-platform-cap-${cap.platform}-${portfolioId}`;

  async function handleSave() {
    if (!parsed.ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      await save(parsed.minor);
    } catch (error) {
      setSaveError(formatUiError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    // Same label-left / control-right row as the rest of the Manage sheet.
    <div className="grid gap-1.5 py-2.5 @lg/sheet:grid-cols-[11rem_minmax(0,1fr)] @lg/sheet:gap-6">
      <Label className="self-start text-muted-foreground @lg/sheet:pt-2" htmlFor={id}>
        {platformCapLabel(cap.platform, uiText)}
        {currency ? ` (${currency})` : ''}
      </Label>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Input
            className="max-w-[12rem] tabular-nums"
            aria-invalid={(dirty && !parsed.ok) || undefined}
            disabled={!currency || saving}
            id={id}
            inputMode="decimal"
            onChange={(event) => setValue(event.target.value)}
            placeholder={uiText('no_limit_f7fcff0')}
            value={value}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!dirty || !parsed.ok || saving}
            onClick={() => void handleSave()}
          >
            {uiText.rich('sentence_e66795836de4', {
              v0: () => (saving ? <Loader2 className="size-3.5 animate-spin" /> : null),
            })}
          </Button>
        </div>
        {!currency ? (
          <p className="text-xs text-muted-foreground">
            {uiText.rich('sentence_5dfd8b427ebf', { v0: PLATFORM_NAMES[cap.platform] })}
          </p>
        ) : cap.accounts > 1 ? (
          <p className="text-xs text-muted-foreground">
            {uiText.rich('sentence_5d9959c1d2de', {
              v0: cap.accounts,
              v1: PLATFORM_NAMES[cap.platform],
            })}
          </p>
        ) : null}
        {dirty && !parsed.ok && currency ? (
          <p className="text-xs text-destructive">{parsed.message}</p>
        ) : null}
        {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}
      </div>
    </div>
  );
}
