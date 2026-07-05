import { describe, expect, it } from "bun:test";

import type { BrandBookResponse } from "@continuum/contracts";

import {
  deriveDashboardSetup,
  hasAnyAccount,
  SETTINGS_BRAND_BOOK_HREF,
  SETTINGS_INTEGRATIONS_HREF,
  type DashboardSetupStepId,
} from "./setupState";

function readyBook(overallScore: number): BrandBookResponse {
  return {
    brand_id: "brand-1",
    status: "ready",
    present: true,
    refreshed_at: "2026-07-01T00:00:00.000Z",
    assembled: {
      report: {
        readiness: { overall_score: overallScore, findings: [] },
      },
    },
  } as unknown as BrandBookResponse;
}

function stepById(
  setup: ReturnType<typeof deriveDashboardSetup>,
  id: DashboardSetupStepId,
) {
  const step = setup.steps.find((s) => s.id === id);
  if (!step) throw new Error(`missing step ${id}`);
  return step;
}

describe("deriveDashboardSetup", () => {
  it("returns an all-todo first-run state for a brand with no signals", () => {
    const setup = deriveDashboardSetup({
      hasConnectedProviders: false,
      hasAssignedAccounts: false,
      brandBook: null,
    });

    expect(setup.steps).toHaveLength(5);
    expect(setup.trackedCount).toBe(3);
    expect(setup.completedCount).toBe(0);
    expect(setup.isComplete).toBe(false);
    expect(setup.hasConnectedData).toBe(false);
    expect(setup.brandBookReady).toBe(false);
    expect(setup.brandBookStatus).toBeNull();
    expect(setup.readiness.score).toBe(0);
    expect(stepById(setup, "connect").status).toBe("todo");
    expect(stepById(setup, "connect").href).toBe(SETTINGS_INTEGRATIONS_HREF);
  });

  it("marks connect done but assign todo when only a provider is connected", () => {
    const setup = deriveDashboardSetup({
      hasConnectedProviders: true,
      hasAssignedAccounts: false,
      brandBook: null,
    });

    expect(stepById(setup, "connect").status).toBe("done");
    expect(stepById(setup, "assign").status).toBe("todo");
    expect(setup.completedCount).toBe(1);
    expect(setup.hasConnectedData).toBe(false);
    expect(setup.isComplete).toBe(false);
  });

  it("is complete only when connect, assign, and the Brand Book are all satisfied", () => {
    const setup = deriveDashboardSetup({
      hasConnectedProviders: true,
      hasAssignedAccounts: true,
      brandBook: readyBook(82),
    });

    expect(setup.completedCount).toBe(3);
    expect(setup.trackedCount).toBe(3);
    expect(setup.isComplete).toBe(true);
    expect(setup.hasConnectedData).toBe(true);
    expect(setup.brandBookReady).toBe(true);
    expect(setup.brandBookStatus).toBe("ready");
    expect(setup.readiness.score).toBe(82);
    expect(stepById(setup, "brand_book").cta).toBe("View Brand Book");
    expect(stepById(setup, "brand_book").href).toBe(SETTINGS_BRAND_BOOK_HREF);
  });

  it("keeps guidance-only steps untracked so they never gate completion", () => {
    const setup = deriveDashboardSetup({
      hasConnectedProviders: true,
      hasAssignedAccounts: true,
      brandBook: readyBook(90),
    });

    expect(stepById(setup, "competitors").tracked).toBe(false);
    expect(stepById(setup, "first_plan").tracked).toBe(false);
    expect(stepById(setup, "competitors").status).toBe("todo");
    expect(setup.isComplete).toBe(true);
  });

  it("surfaces an assembling Brand Book without marking it ready", () => {
    const setup = deriveDashboardSetup({
      hasConnectedProviders: true,
      hasAssignedAccounts: true,
      brandBook: { status: "assembling", present: false } as unknown as BrandBookResponse,
    });

    expect(setup.brandBookStatus).toBe("assembling");
    expect(setup.brandBookReady).toBe(false);
    expect(stepById(setup, "brand_book").status).toBe("todo");
    expect(stepById(setup, "brand_book").cta).toBe("Generate Brand Book");
    expect(setup.isComplete).toBe(false);
  });
});

describe("hasAnyAccount", () => {
  it("is false for null, empty, and all-empty-platform summaries", () => {
    expect(hasAnyAccount(null)).toBe(false);
    expect(hasAnyAccount(undefined)).toBe(false);
    expect(hasAnyAccount({})).toBe(false);
    expect(hasAnyAccount({ instagram: { accounts: [] }, youtube: { accounts: [] } })).toBe(false);
  });

  it("is true when any platform has at least one account", () => {
    expect(
      hasAnyAccount({ instagram: { accounts: [{ id: "a" }] }, youtube: { accounts: [] } }),
    ).toBe(true);
  });
});
