import { describe, expect, it } from "bun:test";
import type { FreshnessMeta } from "@continuum/contracts";

import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import {
  countPlatformAccounts,
  derivePaidSetupSteps,
  isPaidSetupBlocked,
  PAID_SETUP_CONNECT_HREF,
  type PaidSetupStep,
} from "./paid-setup-diagnostics";

function stepById(steps: PaidSetupStep[], id: PaidSetupStep["id"]): PaidSetupStep {
  const found = steps.find((step) => step.id === id);
  if (!found) throw new Error(`missing step ${id}`);
  return found;
}

function freshness(overrides: Partial<FreshnessMeta>): FreshnessMeta {
  return {
    status: "fresh",
    source: null,
    last_synced_at: null,
    next_sync_at: null,
    cache_age_seconds: null,
    stale: false,
    error: null,
    ...overrides,
  };
}

describe("derivePaidSetupSteps", () => {
  it("blocks on connection and assignment with CTAs when no ad account is available", () => {
    const steps = derivePaidSetupSteps({ platform: "meta", availableAccountCount: 0 });

    expect(isPaidSetupBlocked(steps)).toBe(true);

    const connection = stepById(steps, "connection");
    expect(connection.status).toBe("action_required");
    expect(connection.cta).toEqual({
      kind: "link",
      label: "Connect Meta Ads",
      href: PAID_SETUP_CONNECT_HREF,
    });

    const assignment = stepById(steps, "assignment");
    expect(assignment.status).toBe("pending");
    expect(assignment.cta).toEqual({
      kind: "link",
      label: "Assign account",
      href: PAID_SETUP_CONNECT_HREF,
    });
  });

  it("uses the Google Ads provider label for google-ads", () => {
    const steps = derivePaidSetupSteps({ platform: "google-ads", availableAccountCount: 0 });
    const connection = stepById(steps, "connection");
    expect(connection.cta).toEqual({
      kind: "link",
      label: "Connect Google Ads",
      href: PAID_SETUP_CONNECT_HREF,
    });
  });

  it("marks a load failure as a permission blocker with a retry CTA", () => {
    const steps = derivePaidSetupSteps({
      platform: "meta",
      availableAccountCount: 0,
      loadError: true,
    });
    const permission = stepById(steps, "permission");
    expect(permission.status).toBe("attention");
    expect(permission.cta).toEqual({ kind: "retry", label: "Retry" });
  });

  it("is fully done when an account is available and data is fresh", () => {
    const steps = derivePaidSetupSteps({
      platform: "meta",
      availableAccountCount: 1,
      freshness: freshness({ status: "fresh" }),
    });
    expect(isPaidSetupBlocked(steps)).toBe(false);
    expect(steps.every((step) => step.status === "done")).toBe(true);
  });

  it("surfaces a retry sync CTA when the last sync errored", () => {
    const steps = derivePaidSetupSteps({
      platform: "meta",
      availableAccountCount: 1,
      freshness: freshness({ status: "error", error: "Meta timed out" }),
    });
    const sync = stepById(steps, "sync");
    expect(sync.status).toBe("attention");
    expect(sync.description).toBe("Meta timed out");
    expect(sync.cta).toEqual({ kind: "retry", label: "Retry sync" });
    expect(isPaidSetupBlocked(steps)).toBe(true);
  });

  it("treats a stale sync as attention with a retry", () => {
    const steps = derivePaidSetupSteps({
      platform: "meta",
      availableAccountCount: 2,
      freshness: freshness({ status: "stale", stale: true }),
    });
    expect(stepById(steps, "sync").status).toBe("attention");
  });
});

describe("countPlatformAccounts", () => {
  const summary = {
    facebook: { accounts: [{ id: "act_1" }, { id: "act_2" }] },
    googleAds: { accounts: [{ id: "123-456" }] },
    dv360: { accounts: [] },
  } as unknown as BrandIntegrationSummary;

  it("counts the assigned accounts for the platform", () => {
    expect(countPlatformAccounts(summary, "meta")).toBe(2);
    expect(countPlatformAccounts(summary, "google-ads")).toBe(1);
    expect(countPlatformAccounts(summary, "dv360")).toBe(0);
  });

  it("returns 0 for an undefined summary", () => {
    expect(countPlatformAccounts(undefined, "meta")).toBe(0);
  });
});
