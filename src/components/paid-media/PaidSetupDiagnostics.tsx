"use client";

// Paid setup diagnostics panel (IMP-010 / BUG-003 / BUG-004). Turns a blocked
// paid surface ("No ad account selected") into an actionable checklist:
// connection → permission → assignment → sync, each with the exact CTA to fix
// it. Derivation is the pure `derivePaidSetupSteps`; this component only reads
// the brand integration state + FreshnessMeta and renders. Reused by the Scale
// dashboard blocked state and the Jaina Setup Concierge (FEAT-004).

import Link from "next/link";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  PlugZapIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { useBrandIntegrations } from "@/hooks/useBrandIntegrations";
import type { FreshnessMeta } from "@/lib/freshness/freshnessMeta";
import type { PaidMediaPlatform } from "@/lib/paid-media/performance-types";
import { cn } from "@/lib/utils";
import {
  countPlatformAccounts,
  derivePaidSetupSteps,
  type PaidSetupStep,
  type PaidSetupStepStatus,
} from "./paid-setup-diagnostics";

type PaidSetupDiagnosticsProps = {
  brandId: string;
  platform: PaidMediaPlatform;
  freshness?: FreshnessMeta | null;
  onRetry?: () => void;
  onPlatformChange?: (platform: PaidMediaPlatform) => void;
  heading?: string;
  description?: string;
  className?: string;
};

const STATUS_ICON: Record<PaidSetupStepStatus, ComponentType<{ className?: string }>> = {
  done: CheckCircle2Icon,
  action_required: PlugZapIcon,
  attention: AlertTriangleIcon,
  pending: CircleDashedIcon,
};

const STATUS_ICON_CLASS: Record<PaidSetupStepStatus, string> = {
  done: "text-emerald-500",
  action_required: "text-primary",
  attention: "text-amber-500",
  pending: "text-muted-foreground",
};

const PLATFORM_SWITCH_OPTIONS: { value: PaidMediaPlatform; label: string }[] = [
  { value: "meta", label: "Meta Ads" },
  { value: "google-ads", label: "Google Ads" },
  { value: "linkedin", label: "LinkedIn Ads" },
];

function StepCta({
  step,
  onRetry,
}: {
  step: PaidSetupStep;
  onRetry: () => void;
}) {
  if (!step.cta) return null;

  if (step.cta.kind === "retry") {
    return (
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={onRetry}>
        <RefreshCwIcon aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        {step.cta.label}
      </Button>
    );
  }

  return (
    <Button asChild size="sm" className="h-8">
      <Link href={step.cta.href}>{step.cta.label}</Link>
    </Button>
  );
}

export function PaidSetupDiagnostics({
  brandId,
  platform,
  freshness,
  onRetry,
  onPlatformChange,
  heading,
  description,
  className,
}: PaidSetupDiagnosticsProps) {
  const { integrations, isError, refresh } = useBrandIntegrations(brandId);

  const steps = derivePaidSetupSteps({
    platform,
    availableAccountCount: countPlatformAccounts(integrations, platform),
    freshness,
    loadError: isError,
  });

  const handleRetry = () => {
    void refresh();
    onRetry?.();
  };

  return (
    <section
      aria-label="Paid setup diagnostics"
      className={cn(
        "mx-auto w-full max-w-xl rounded-xl border border-border/70 bg-card/60 p-[var(--card-pad)]",
        className,
      )}
    >
      {heading ? (
        <div className="mb-4 space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-foreground">{heading}</h3>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}

      <ol className="space-y-3">
        {steps.map((step) => {
          const Icon = STATUS_ICON[step.status];
          return (
            <li key={step.id} className="flex items-start gap-3">
              <Icon aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", STATUS_ICON_CLASS[step.status])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              <div className="shrink-0">
                <StepCta step={step} onRetry={handleRetry} />
              </div>
            </li>
          );
        })}
      </ol>

      {onPlatformChange ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="text-xs text-muted-foreground">Looking for a different platform?</span>
          {PLATFORM_SWITCH_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={platform === option.value ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              aria-pressed={platform === option.value}
              onClick={() => onPlatformChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
