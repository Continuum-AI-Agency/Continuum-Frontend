import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";

import type { BrandBookResponse } from "@continuum/contracts";

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

mock.module("@/components/providers/ActiveBrandProvider", () => ({
  useActiveBrandContext: () => ({ activeBrandId: "brand-1" }),
}));

import { HomeBaseDashboard } from "./HomeBaseDashboard";
import { deriveDashboardSetup } from "./first-run/setupState";

function readyBook(): BrandBookResponse {
  return {
    brand_id: "brand-1",
    status: "ready",
    present: true,
    refreshed_at: "2026-07-01T00:00:00.000Z",
    assembled: { report: { readiness: { overall_score: 80, findings: [] } } },
  } as unknown as BrandBookResponse;
}

const incompleteNoData = deriveDashboardSetup({
  hasConnectedProviders: false,
  hasAssignedAccounts: false,
  brandBook: null,
});

const incompleteWithData = deriveDashboardSetup({
  hasConnectedProviders: true,
  hasAssignedAccounts: true,
  brandBook: null,
});

const completeSetup = deriveDashboardSetup({
  hasConnectedProviders: true,
  hasAssignedAccounts: true,
  brandBook: readyBook(),
});

afterEach(() => cleanup());

describe("HomeBaseDashboard", () => {
  it("renders the organic view with its title and active slot", () => {
    const { container } = render(
      <Theme>
        <HomeBaseDashboard activeView="organic" activeViewSlot={<div>Organic slot</div>} />
      </Theme>,
    );

    expect(container.textContent).toContain("Social metrics & Trend signals");
    const panel = container.querySelector('[data-dashboard-panel="organic"]');
    expect(panel?.textContent).toContain("Organic slot");
  });

  it("renders the paid view with its title and active slot", () => {
    const { container } = render(
      <Theme>
        <HomeBaseDashboard activeView="paid" activeViewSlot={<div>Paid slot</div>} />
      </Theme>,
    );

    expect(container.textContent).toContain("Performance & DCO actions");
    const panel = container.querySelector('[data-dashboard-panel="paid"]');
    expect(panel?.textContent).toContain("Paid slot");
  });

  it("shows mode microcopy near the toggle for the active view", () => {
    const { container } = render(
      <Theme>
        <HomeBaseDashboard activeView="organic" activeViewSlot={<div>Organic slot</div>} />
      </Theme>,
    );

    expect(container.textContent).toContain("Social performance, audience insights, and trend signals.");
  });

  it("replaces empty modules with the first-run setup when no account is connected", () => {
    const { container } = render(
      <Theme>
        <HomeBaseDashboard
          activeView="organic"
          activeViewSlot={<div>Organic slot</div>}
          setup={incompleteNoData}
        />
      </Theme>,
    );

    expect(container.querySelector('[data-testid="dashboard-first-run"]')).not.toBeNull();
    expect(container.textContent).toContain("Set up your workspace");
    expect(container.textContent).toContain("Get started");
    // No live data + no mode toggle when there is nothing to show.
    expect(container.querySelector('[data-dashboard-panel="organic"]')).toBeNull();
    expect(container.querySelector('nav[aria-label="Dashboard workspace"]')).toBeNull();
  });

  it("leads the live data with first-run guidance when setup is partial", () => {
    const { container } = render(
      <Theme>
        <HomeBaseDashboard
          activeView="organic"
          activeViewSlot={<div>Organic slot</div>}
          setup={incompleteWithData}
        />
      </Theme>,
    );

    expect(container.querySelector('[data-testid="dashboard-first-run"]')).not.toBeNull();
    expect(container.textContent).toContain("Your live data");
    const panel = container.querySelector('[data-dashboard-panel="organic"]');
    expect(panel?.textContent).toContain("Organic slot");
    // The mode toggle is present because there is data to switch between.
    expect(container.querySelector('nav[aria-label="Dashboard workspace"]')).not.toBeNull();
  });

  it("drops the first-run surface once setup is complete", () => {
    const { container } = render(
      <Theme>
        <HomeBaseDashboard
          activeView="organic"
          activeViewSlot={<div>Organic slot</div>}
          setup={completeSetup}
        />
      </Theme>,
    );

    expect(container.querySelector('[data-testid="dashboard-first-run"]')).toBeNull();
    const panel = container.querySelector('[data-dashboard-panel="organic"]');
    expect(panel?.textContent).toContain("Organic slot");
  });
});
