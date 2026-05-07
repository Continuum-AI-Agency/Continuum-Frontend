import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { Theme } from "@radix-ui/themes";

import { HomeBaseDashboard } from "./HomeBaseDashboard";

function renderDashboard() {
  return render(
    <Theme>
      <HomeBaseDashboard
        paidViewSlot={<div>Paid slot</div>}
        organicViewSlot={<div>Organic slot</div>}
      />
    </Theme>
  );
}

function getDashboardPanel(container: HTMLElement, panel: "paid" | "organic") {
  return Array.from(container.getElementsByTagName("div")).find(
    (element) => element.getAttribute("data-dashboard-panel") === panel,
  ) as HTMLDivElement;
}

describe("HomeBaseDashboard", () => {
  it("defaults to organic tab and content", () => {
    const { container } = renderDashboard();

    expect(container.textContent).toContain("Social metrics & Trend signals");

    const paidContainer = getDashboardPanel(container, "paid");
    const organicContainer = getDashboardPanel(container, "organic");

    expect(paidContainer.style.display).toBe("none");
    expect(organicContainer.style.display).toBe("block");
  });

});
