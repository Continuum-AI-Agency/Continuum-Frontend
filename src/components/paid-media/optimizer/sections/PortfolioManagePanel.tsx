'use client';

// Inline management for one portfolio: edit its config, add/remove ad sets via the
// campaign -> ad-set tree, and archive it. Save computes a DIFF — it patches only
// changed config fields, enrolls newly-selected ad sets, and unenrolls removed
// ones. Objective is immutable after create (shown read-only). Reached from a
// portfolio card's "Manage" disclosure.

import type {
  ApplyMode,
  OptimizationModeDto,
  PortfolioLevel,
  PortfolioListItem,
  UpdatePortfolioPatch,
} from '@continuum/contracts';
import { Archive, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { currencySymbol, humanize } from '../format';
import { CampaignAdsetPicker } from '../picker/CampaignAdsetPicker';
import {
  useOptimizerAccountSnapshots,
  useOptimizerEnrolledAdsets,
  useOptimizerMutations,
} from '../useOptimizerData';

const MODES: OptimizationModeDto[] = ['efficiency', 'balanced', 'scale'];
const APPLY_MODES: ApplyMode[] = ['recommend', 'autopilot'];

type PortfolioManagePanelProps = {
  brandId: string;
  adAccountId: string;
  portfolio: PortfolioListItem;
  currency?: string | null;
  onDone?: () => void;
};

export function PortfolioManagePanel({
  brandId,
  adAccountId,
  portfolio,
  currency,
  onDone,
}: PortfolioManagePanelProps) {
  // A campaign portfolio edits campaigns, not ad sets: the level drives which
  // snapshot scope + picker mode the manage panel shows. Enroll/unenroll operate
  // on the entity id at either level, so the diff below is unchanged.
  const level = (portfolio.level as PortfolioLevel) ?? 'adset';
  const { update, enroll, unenroll, archive } = useOptimizerMutations(brandId, adAccountId);
  const enrolledRead = useOptimizerEnrolledAdsets(portfolio.id);
  const snapshotsRead = useOptimizerAccountSnapshots(brandId, adAccountId, level);

  const [name, setName] = useState(portfolio.name);
  const [mode, setMode] = useState<OptimizationModeDto>(portfolio.mode as OptimizationModeDto);
  const [applyMode, setApplyMode] = useState<ApplyMode>(portfolio.apply_mode as ApplyMode);
  const [dailyTotal, setDailyTotal] = useState(
    portfolio.daily_total != null ? String(portfolio.daily_total) : '',
  );
  const [cpaTarget, setCpaTarget] = useState('');
  // null until the operator first touches the picker — before that the enrolled
  // roster is the selection (kept reactive as the async read resolves).
  const [selection, setSelection] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrolledIds = useMemo(
    () => enrolledRead.data.map((row) => row.adset_id),
    [enrolledRead.data],
  );
  const selectedAdsetIds = selection ?? enrolledIds;

  const patch = useMemo<UpdatePortfolioPatch>(() => {
    const next: UpdatePortfolioPatch = {};
    if (name.trim() && name.trim() !== portfolio.name) next.name = name.trim();
    if (mode !== portfolio.mode) next.mode = mode;
    if (applyMode !== portfolio.apply_mode) next.apply_mode = applyMode;
    const daily = Number.parseFloat(dailyTotal);
    if (Number.isFinite(daily) && daily >= 0 && daily !== portfolio.daily_total) {
      next.daily_total = daily;
    }
    const cpa = Number.parseFloat(cpaTarget);
    if (Number.isFinite(cpa) && cpa > 0) next.cpa_target = cpa;
    return next;
  }, [name, mode, applyMode, dailyTotal, cpaTarget, portfolio]);

  const { toAdd, toRemove } = useMemo(() => {
    const enrolledSet = new Set(enrolledIds);
    const selectedSet = new Set(selectedAdsetIds);
    return {
      toAdd: selectedAdsetIds.filter((id) => !enrolledSet.has(id)),
      toRemove: enrolledIds.filter((id) => !selectedSet.has(id)),
    };
  }, [enrolledIds, selectedAdsetIds]);

  const hasChanges = Object.keys(patch).length > 0 || toAdd.length > 0 || toRemove.length > 0;

  async function handleSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (Object.keys(patch).length > 0) {
        await update.mutateAsync({ portfolio_id: portfolio.id, patch });
      }
      if (toAdd.length > 0) {
        await enroll.mutateAsync({ portfolio_id: portfolio.id, adset_ids: toAdd });
      }
      await Promise.all(
        toRemove.map((adsetId) =>
          unenroll.mutateAsync({ portfolio_id: portfolio.id, adset_id: adsetId }),
        ),
      );
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  }

  function handleArchive() {
    archive.mutate(portfolio.id, { onSuccess: () => onDone?.() });
  }

  const symbol = currencySymbol(currency);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`manage-name-${portfolio.id}`}>Name</Label>
          <Input
            id={`manage-name-${portfolio.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Objective</Label>
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
            {humanize(portfolio.objective)}
            <span className="ml-2 text-2xs">(fixed after create)</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Mode</Label>
          <Select value={mode} onValueChange={(value) => setMode(value as OptimizationModeDto)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((value) => (
                <SelectItem key={value} value={value}>
                  {humanize(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Apply mode</Label>
          <Select value={applyMode} onValueChange={(value) => setApplyMode(value as ApplyMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPLY_MODES.map((value) => (
                <SelectItem key={value} value={value}>
                  {humanize(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`manage-daily-${portfolio.id}`}>Daily budget ({symbol})</Label>
          <Input
            id={`manage-daily-${portfolio.id}`}
            inputMode="decimal"
            value={dailyTotal}
            onChange={(event) => setDailyTotal(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`manage-cpa-${portfolio.id}`}>CPA target ({symbol})</Label>
          <Input
            id={`manage-cpa-${portfolio.id}`}
            inputMode="decimal"
            value={cpaTarget}
            onChange={(event) => setCpaTarget(event.target.value)}
            placeholder="leave blank to keep"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{level === 'campaign' ? 'Enrolled campaigns' : 'Enrolled ad sets'}</Label>
        <CampaignAdsetPicker
          snapshots={snapshotsRead.data}
          selectedAdsetIds={selectedAdsetIds}
          onChange={setSelection}
          brandId={brandId}
          accountId={adAccountId}
          currency={currency}
          disabled={saving}
          isLoading={snapshotsRead.isLoading || enrolledRead.isLoading}
          isError={snapshotsRead.isError}
          mode={level}
        />
        {toAdd.length > 0 || toRemove.length > 0 ? (
          <p className="text-2xs text-muted-foreground">
            {toAdd.length > 0 ? `+${toAdd.length} to add` : ''}
            {toAdd.length > 0 && toRemove.length > 0 ? ' · ' : ''}
            {toRemove.length > 0 ? `−${toRemove.length} to remove` : ''}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive">
              <Archive className="size-3.5" />
              Archive
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive “{portfolio.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                It stops running cycles and leaves your list, but its history is kept — you can
                restore it later from Archived.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onDone?.()}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!hasChanges || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
