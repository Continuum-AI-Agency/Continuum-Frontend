'use client';

// Onboarding / empty state — shown when the brand has no optimizer portfolios
// yet (or the optimizer backend is not reachable; its edge functions deploy
// later, so reads degrade here rather than erroring). Guides the operator
// through the three-step path from the reference-ui-preview spec: discover the
// account → create a portfolio → enroll ad sets. Portfolio creation is wired to
// the authenticated optimizer_create_portfolio RPC; ad-set enrollment follows
// once ingest surfaces the account's ad sets.

import type { ApplyMode, OptimizationModeDto, OptimizationObjective } from '@continuum/contracts';
import { GaugeCircleIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { humanize } from '../format';
import { useOptimizerMutations } from '../useOptimizerData';

type OptimizerOnboardingProps = {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  onCreated: () => void;
};

const OBJECTIVES: OptimizationObjective[] = [
  'purchase',
  'app_install',
  'signup',
  'lead',
  'traffic',
  'awareness',
];
const MODES: OptimizationModeDto[] = ['efficiency', 'balanced', 'scale'];
const APPLY_MODES: ApplyMode[] = ['recommend', 'autopilot'];

export function OptimizerOnboarding({ brandId, adAccountId, onCreated }: OptimizerOnboardingProps) {
  const { create } = useOptimizerMutations(brandId, adAccountId);

  const [name, setName] = React.useState('');
  const [objective, setObjective] = React.useState<OptimizationObjective>('purchase');
  const [mode, setMode] = React.useState<OptimizationModeDto>('balanced');
  const [applyMode, setApplyMode] = React.useState<ApplyMode>('recommend');
  const [dailyTotal, setDailyTotal] = React.useState('');
  const [cpaTarget, setCpaTarget] = React.useState('');

  const dailyValue = Number.parseFloat(dailyTotal);
  const canSubmit = name.trim().length > 0 && Number.isFinite(dailyValue) && dailyValue > 0;

  const handleCreate = () => {
    if (!canSubmit) return;
    const cpaValue = Number.parseFloat(cpaTarget);
    create.mutate(
      {
        brand_id: brandId,
        ad_account_id: adAccountId,
        config: {
          name: name.trim(),
          objective,
          mode,
          apply_mode: applyMode,
          daily_total: dailyValue,
          ...(Number.isFinite(cpaValue) && cpaValue > 0 ? { cpa_target: cpaValue } : {}),
        },
      },
      {
        onSuccess: () => {
          setName('');
          setDailyTotal('');
          setCpaTarget('');
          onCreated();
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-6 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground">
          <GaugeCircleIcon className="size-5" />
        </div>
        <h2 className="mt-3 text-base font-semibold tracking-tight">Set up the Optimizer</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Group your ad sets into a portfolio and the optimizer scores per-$ efficiency across
          trailing 3/7/14-day windows, then proposes reallocation and pause/renewal recommendations.
        </p>
      </div>

      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {['Discover account', 'Create a portfolio', 'Enroll ad sets'].map((step, index) => (
          <li
            key={step}
            className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2"
          >
            <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>

      <Card className="gap-0 rounded-xl py-0 shadow-none">
        <CardHeader className="border-b border-border/70 p-4">
          <CardTitle className="text-sm">Create a portfolio</CardTitle>
          <p className="text-xs text-muted-foreground">Account {adAccountId}</p>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="optimizer-portfolio-name">Name</Label>
            <Input
              id="optimizer-portfolio-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Prospecting · Purchases"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Objective</Label>
              <Select
                value={objective}
                onValueChange={(value) => setObjective(value as OptimizationObjective)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanize(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
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
              <Label htmlFor="optimizer-daily-total">Daily budget</Label>
              <Input
                id="optimizer-daily-total"
                inputMode="decimal"
                value={dailyTotal}
                onChange={(event) => setDailyTotal(event.target.value)}
                placeholder="4200"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="optimizer-cpa-target">CPA target (optional)</Label>
              <Input
                id="optimizer-cpa-target"
                inputMode="decimal"
                value={cpaTarget}
                onChange={(event) => setCpaTarget(event.target.value)}
                placeholder="40"
              />
            </div>
          </div>

          {create.isError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Could not create the portfolio. The optimizer backend may not be reachable yet.
            </p>
          ) : null}

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              className="gap-1.5"
              disabled={!canSubmit || create.isPending}
              onClick={handleCreate}
            >
              <PlusIcon className="size-4" />
              {create.isPending ? 'Creating…' : 'Create portfolio'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
