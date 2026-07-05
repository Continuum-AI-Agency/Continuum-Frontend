// Paid setup diagnostics (IMP-010 / BUG-003 / BUG-004). Derives the connect →
// permission → assign → sync journey from the honest signals a blocked paid
// surface actually has: how many ad accounts are selectable for the platform,
// the shared FreshnessMeta view-model, and whether the account load failed or
// timed out. Each blocker carries the exact CTA to fix it. Pure and
// data-agnostic so the presentational panel and the Jaina concierge share one
// source of truth and it stays unit-testable.

import type { FreshnessMeta } from "@continuum/contracts";

import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import type { PaidMediaPlatform } from "@/lib/paid-media/performance-types";

export type PaidSetupStepStatus = "done" | "action_required" | "attention" | "pending";
export type PaidSetupStepId = "connection" | "permission" | "assignment" | "sync";

export type PaidSetupCta =
  | { kind: "link"; label: string; href: string }
  | { kind: "retry"; label: string };

export interface PaidSetupStep {
  id: PaidSetupStepId;
  label: string;
  description: string;
  status: PaidSetupStepStatus;
  cta?: PaidSetupCta;
}

export interface PaidSetupInput {
  platform: PaidMediaPlatform;
  // Ad accounts selectable for this platform. In a blocked state this is
  // typically 0 — a positive count means the selector would have auto-picked.
  availableAccountCount: number;
  freshness?: FreshnessMeta | null;
  // The account load failed or timed out (integration query error / selector
  // timeout). Surfaced as a permission/session blocker with a retry.
  loadError?: boolean;
}

// Connections and brand assignment both live on the same Settings surface.
export const PAID_SETUP_CONNECT_HREF = "/settings?section=integrations";

function providerLabel(platform: PaidMediaPlatform): string {
  if (platform === "google-ads") return "Google Ads";
  if (platform === "dv360") return "DV360";
  return "Meta Ads";
}

function platformSummaryKey(platform: PaidMediaPlatform): keyof BrandIntegrationSummary {
  if (platform === "google-ads") return "googleAds";
  if (platform === "dv360") return "dv360";
  return "facebook";
}

// How many ad accounts are assigned to this brand for the given platform.
export function countPlatformAccounts(
  summary: BrandIntegrationSummary | undefined,
  platform: PaidMediaPlatform,
): number {
  if (!summary) return 0;
  return summary[platformSummaryKey(platform)]?.accounts?.length ?? 0;
}

function deriveSyncStep(input: PaidSetupInput, hasAccounts: boolean): PaidSetupStep {
  const freshness = input.freshness ?? null;

  if (freshness) {
    switch (freshness.status) {
      case "error":
        return {
          id: "sync",
          label: "Last sync failed",
          description:
            freshness.error ?? "The last data sync failed. Retry to pull the latest campaigns.",
          status: "attention",
          cta: { kind: "retry", label: "Retry sync" },
        };
      case "stale":
        return {
          id: "sync",
          label: "Data is stale",
          description: "Campaign data is older than expected. Retry to refresh it.",
          status: "attention",
          cta: { kind: "retry", label: "Retry sync" },
        };
      case "syncing":
        return {
          id: "sync",
          label: "Syncing campaign data",
          description: "We're pulling the latest campaigns and spend now.",
          status: "pending",
        };
      case "never":
        return {
          id: "sync",
          label: "Sync campaign data",
          description: "No sync has run yet. It starts automatically once an ad account is assigned.",
          status: "pending",
        };
      case "fresh":
        return {
          id: "sync",
          label: "Data is up to date",
          description: "Campaign data is fresh.",
          status: "done",
        };
    }
  }

  return hasAccounts
    ? {
        id: "sync",
        label: "Data is up to date",
        description: "Campaign data is ready.",
        status: "done",
      }
    : {
        id: "sync",
        label: "Sync campaign data",
        description: "Sync starts automatically once an ad account is assigned.",
        status: "pending",
      };
}

export function derivePaidSetupSteps(input: PaidSetupInput): PaidSetupStep[] {
  const provider = providerLabel(input.platform);
  const hasAccounts = input.availableAccountCount > 0;
  const loadError = input.loadError === true;

  const connection: PaidSetupStep = hasAccounts
    ? {
        id: "connection",
        label: `${provider} connected`,
        description: `A ${provider} account is linked to Continuum.`,
        status: "done",
      }
    : {
        id: "connection",
        label: `Connect ${provider}`,
        description: `Link your ${provider} account so Continuum can read campaigns and spend.`,
        status: "action_required",
        cta: { kind: "link", label: `Connect ${provider}`, href: PAID_SETUP_CONNECT_HREF },
      };

  const permission: PaidSetupStep = loadError
    ? {
        id: "permission",
        label: "Confirm ad account access",
        description:
          "We couldn't confirm ad account access — this is usually a permissions or session issue. Reconnect, then retry.",
        status: "attention",
        cta: { kind: "retry", label: "Retry" },
      }
    : hasAccounts
      ? {
          id: "permission",
          label: "Ad account access granted",
          description: "Continuum has permission to read this ad account.",
          status: "done",
        }
      : {
          id: "permission",
          label: "Grant ad account access",
          description: `Approve ads read and manage permissions when connecting ${provider}.`,
          status: "pending",
        };

  const assignment: PaidSetupStep = hasAccounts
    ? {
        id: "assignment",
        label: "Ad account assigned to brand",
        description: "This ad account is assigned to the active brand.",
        status: "done",
      }
    : {
        id: "assignment",
        label: "Assign an ad account to this brand",
        description:
          "After connecting, assign the ad account to this brand so it appears in the selector.",
        status: "pending",
        cta: { kind: "link", label: "Assign account", href: PAID_SETUP_CONNECT_HREF },
      };

  return [connection, permission, assignment, deriveSyncStep(input, hasAccounts)];
}

// True when any step still needs the user. The selector auto-picks an account
// whenever one is available, so a blocked surface is exactly `some !== "done"`.
export function isPaidSetupBlocked(steps: PaidSetupStep[]): boolean {
  return steps.some((step) => step.status !== "done");
}
