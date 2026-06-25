"use client";

import { useState, useTransition } from "react";
import { CreditCard, Loader2, Sparkles } from "lucide-react";
import { type Entitlements, findUsageBucket } from "@continuum/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CreditSummary } from "@/lib/billing/summary.server";
import {
  openBillingPortalAction,
  setAutoRefillAction,
  startStripeCheckoutAction,
} from "@/app/(post-auth)/settings/billing-actions";

type BrandBillingPanelProps = {
  brandId: string;
  entitlements: Entitlements | null;
  credit: CreditSummary | null;
};

const TOPUP_PRESETS = [25, 50, 100];
const usd = (n: number) => `$${n.toFixed(2)}`;

function UsageBar({ label, includedUsd, consumedUsd }: { label: string; includedUsd: number; consumedUsd: number }) {
  const pct = includedUsd > 0 ? Math.min(100, (consumedUsd / includedUsd) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <span className="font-mono text-xs text-muted-foreground">
          {usd(consumedUsd)} / {usd(includedUsd)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary/50" style={{ width: `${pct}%` }} aria-hidden />
      </div>
    </div>
  );
}

export function BrandBillingPanel({ brandId, entitlements, credit }: BrandBillingPanelProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refillMode, setRefillMode] = useState<CreditSummary["autoRefillMode"]>(credit?.autoRefillMode ?? "notify");
  const [threshold, setThreshold] = useState<string>(credit?.autoRefillThresholdUsd?.toString() ?? "");
  const [refillAmount, setRefillAmount] = useState<string>(credit?.autoRefillAmountUsd?.toString() ?? "");

  const products = entitlements?.products ?? [];
  const planCode = entitlements?.planCode ?? "free";
  const status = entitlements?.status ?? "inactive";
  const hasActivePlan = status === "active" || status === "trialing";
  const studioBucket = entitlements ? findUsageBucket(entitlements, "studio") : null;
  const agentBucket = entitlements ? findUsageBucket(entitlements, "agent") : null;

  const redirectTo = (run: () => Promise<{ url: string }>) => {
    setError(null);
    startTransition(async () => {
      try {
        const { url } = await run();
        window.location.href = url;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  const buyCredits = (amountUsd: number) =>
    redirectTo(() => startStripeCheckoutAction({ brandId, mode: "topup", amountUsd }));
  const manageSubscription = () => redirectTo(() => openBillingPortalAction(brandId));

  const saveAutoRefill = () => {
    setError(null);
    startTransition(async () => {
      try {
        await setAutoRefillAction({
          brandId,
          mode: refillMode,
          thresholdUsd: threshold ? Number(threshold) : null,
          amountUsd: refillAmount ? Number(refillAmount) : null,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save auto-refill");
      }
    });
  };

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-card/30 px-4 py-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current plan</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">{planCode}</Badge>
            <Badge variant={hasActivePlan ? "default" : "outline"} className="text-xs">{status}</Badge>
            {products.map((p) => (
              <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
            ))}
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={manageSubscription} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
          Manage subscription
        </Button>
      </div>

      <div className="space-y-4 rounded-lg border border-border/60 bg-card/30 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Prepaid credits</p>
          <span className="font-mono text-sm text-foreground">{usd(credit?.balanceUsd ?? 0)}</span>
        </div>
        {credit && credit.lastMonthRolloverUsd > 0 ? (
          <p className="text-xs text-muted-foreground">
            Includes {usd(credit.lastMonthRolloverUsd)} rolled over from last month (consumed first).
          </p>
        ) : null}

        {studioBucket ? (
          <UsageBar label="Studio (included)" includedUsd={studioBucket.includedUsd} consumedUsd={studioBucket.consumedUsd} />
        ) : null}
        {agentBucket ? (
          <UsageBar label="Agents (included)" includedUsd={agentBucket.includedUsd} consumedUsd={agentBucket.consumedUsd} />
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">Buy credits:</span>
          {TOPUP_PRESETS.map((amt) => (
            <Button key={amt} size="sm" variant="secondary" onClick={() => buyCredits(amt)} disabled={pending}>
              {usd(amt)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 bg-card/30 p-4">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-semibold text-foreground">Auto-refill</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Mode
            <select
              className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground"
              value={refillMode}
              onChange={(e) => setRefillMode(e.target.value as CreditSummary["autoRefillMode"])}
            >
              <option value="off">Off</option>
              <option value="notify">Notify me</option>
              <option value="auto_topup">Auto top-up</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Below ($)
            <input
              type="number"
              inputMode="decimal"
              className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="10"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Top-up ($)
            <input
              type="number"
              inputMode="decimal"
              className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground"
              value={refillAmount}
              onChange={(e) => setRefillAmount(e.target.value)}
              placeholder="50"
              disabled={refillMode !== "auto_topup"}
            />
          </label>
        </div>
        <Button size="sm" variant="outline" onClick={saveAutoRefill} disabled={pending}>
          {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Save auto-refill
        </Button>
      </div>
    </div>
  );
}
