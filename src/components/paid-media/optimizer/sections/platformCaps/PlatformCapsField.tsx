'use client';

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
  const caps = usePortfolioPlatformCaps(portfolioId);
  const setCap = useSetPortfolioPlatformCap(portfolioId);

  if (caps.status === 'loading') {
    return <p className="text-xs text-muted-foreground">Reading the platform limits…</p>;
  }
  if (caps.status === 'unavailable') {
    return (
      <p className="text-xs text-muted-foreground">
        Per-platform limits aren&rsquo;t available yet.
      </p>
    );
  }
  if (caps.status === 'error') {
    return <p className="text-xs text-destructive">The platform limits could not be read.</p>;
  }
  if (caps.caps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This portfolio has no platform accounts to limit yet.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
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
  const currency = normalizeCurrency(cap.currency);
  const stored = platformCapToInput(cap.dailyCapMinor, cap.platform, currency);
  const [value, setValue] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const parsed = parsePlatformCapInput(value, cap.platform, currency);
  const dirty = value.trim() !== stored;
  const id = `manage-platform-cap-${cap.platform}-${portfolioId}`;

  async function handleSave() {
    if (!parsed.ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      await save(parsed.minor);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The limit could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {platformCapLabel(cap.platform)}
        {currency ? ` (${currency})` : ''}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          aria-invalid={(dirty && !parsed.ok) || undefined}
          disabled={!currency || saving}
          id={id}
          inputMode="decimal"
          onChange={(event) => setValue(event.target.value)}
          placeholder="No limit"
          value={value}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!dirty || !parsed.ok || saving}
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Save
        </Button>
      </div>
      {!currency ? (
        <p className="text-xs text-muted-foreground">
          The {PLATFORM_NAMES[cap.platform]} accounts here use more than one currency, so one limit
          can&rsquo;t be set for them.
        </p>
      ) : cap.accounts > 1 ? (
        <p className="text-xs text-muted-foreground">
          Applies to each of the {cap.accounts} {PLATFORM_NAMES[cap.platform]} accounts on its own.
        </p>
      ) : null}
      {dirty && !parsed.ok && currency ? (
        <p className="text-xs text-destructive">{parsed.message}</p>
      ) : null}
      {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}
    </div>
  );
}
