"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnboardingState } from "@/lib/onboarding/state";
import {
  PLAN_BUNDLES,
  type TrendsChoice,
  deriveInterestArea,
  derivePrimaryPlanCode,
  productsForSelection,
} from "@/lib/billing/planSelection";
import { selectPlanAction } from "@/app/onboarding/actions";

type PlanSelection = OnboardingState["plan"];

const TRENDS_OPTIONS: Array<{ value: TrendsChoice; label: string; blurb: string }> = [
  { value: "off", label: "No Trends", blurb: "Skip social listening for now." },
  { value: "base", label: "Trends — $10/mo", blurb: "Native web grounding." },
  { value: "pro", label: "Trends Pro — $20/mo", blurb: "All intelligence providers (Exa, SerpAPI, APIFY)." },
];

export function PlanSelectionScreen({
  brandId,
  initialPlan,
  onContinue,
}: {
  brandId: string;
  initialPlan: PlanSelection;
  onContinue?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const bundle of PLAN_BUNDLES) {
      if (bundle.products.every((p) => initialPlan.products.includes(p))) set.add(bundle.key);
    }
    return set;
  });
  const [trends, setTrends] = useState<TrendsChoice>(
    initialPlan.products.includes("trends") ? (initialPlan.trendsTier ?? "base") : "off",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const products = useMemo(() => productsForSelection(selected, trends), [selected, trends]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const canContinue = products.length > 0;

  const handleContinue = () => {
    setError(null);
    startTransition(async () => {
      try {
        await selectPlanAction(brandId, {
          interestArea: deriveInterestArea(products),
          products,
          addons: [],
          trendsTier: trends === "off" ? null : trends,
          planCode: derivePrimaryPlanCode(products),
        });
        onContinue?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save your selection");
      }
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 py-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold text-foreground">Choose your products</h2>
        <p className="text-sm text-muted-foreground">
          Pick what you want to start with. You can change this anytime in Settings → Billing.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {PLAN_BUNDLES.map((bundle) => {
          const isOn = selected.has(bundle.key);
          return (
            <button
              type="button"
              key={bundle.key}
              onClick={() => toggle(bundle.key)}
              aria-pressed={isOn}
              className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-4 text-left transition-colors ${
                isOn ? "border-primary bg-primary/5" : "border-border/60 bg-card/30 hover:border-border"
              }`}
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{bundle.name}</p>
                <p className="text-xs text-muted-foreground">{bundle.blurb}</p>
                <p className="font-mono text-xs text-muted-foreground">{bundle.price}</p>
              </div>
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  isOn ? "border-primary bg-primary text-primary-foreground" : "border-border/60"
                }`}
                aria-hidden
              >
                {isOn ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Trends add-on</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TRENDS_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => setTrends(opt.value)}
              aria-pressed={trends === opt.value}
              className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                trends === opt.value ? "border-primary bg-primary/5" : "border-border/60 bg-card/30 hover:border-border"
              }`}
            >
              <p className="text-xs font-semibold text-foreground">{opt.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{opt.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-end gap-3 pt-2">
        <Button onClick={handleContinue} disabled={!canContinue || pending} className="gap-1.5">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Continue
        </Button>
      </div>
    </div>
  );
}
