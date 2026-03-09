import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Theme } from "@radix-ui/themes";

import { HomeBaseDashboard } from "./HomeBaseDashboard";

function renderDashboard() {
  render(
    <Theme>
      <HomeBaseDashboard
        paidViewSlot={<div>Paid slot</div>}
        organicViewSlot={<div>Organic slot</div>}
      />
    </Theme>
  );
}

describe("HomeBaseDashboard", () => {
  it("defaults to organic tab and content", () => {
    renderDashboard();

    expect(screen.getByText("Social metrics & Trend signals")).toBeTruthy();

    const paidContainer = screen.getByText("Paid slot").parentElement as HTMLDivElement;
    const organicContainer = screen.getByText("Organic slot").parentElement as HTMLDivElement;

    expect(paidContainer.style.display).toBe("none");
    expect(organicContainer.style.display).toBe("block");
  });

});
