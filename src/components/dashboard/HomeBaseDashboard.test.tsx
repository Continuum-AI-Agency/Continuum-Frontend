import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

mock.module("@/components/providers/ActiveBrandProvider", () => ({
  useActiveBrandContext: () => ({ activeBrandId: "brand-1" }),
}));

mock.module("@/components/onboarding/v2/tour/SurfaceTourTrigger", () => ({
  SurfaceTourTrigger: () => null,
  useReadyAfterPaint: () => false,
}));

import { HomeBaseDashboard } from "./HomeBaseDashboard";

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
});
