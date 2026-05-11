import * as React from "react";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

let activeBrandId = "brand-1";
let integrations: BrandIntegrationSummary | undefined;
const refreshMock = mock<() => Promise<void>>(() => Promise.resolve());

mock.module("@/components/providers/ActiveBrandProvider", () => ({
  useActiveBrandContext: () => ({ activeBrandId }),
}));

mock.module("@/hooks/useBrandIntegrations", () => ({
  useBrandIntegrations: () => ({
    integrations,
    isLoading: false,
    refresh: refreshMock,
  }),
}));

mock.module("@/components/integrations/AssignmentsDialog", () => ({
  AssignmentsDialog: ({
    open,
    brandProfileId,
    assignedIds,
  }: {
    open: boolean;
    brandProfileId: string;
    assignedIds: string[];
  }) =>
    open ? (
      <div
        role="dialog"
        data-brand-id={brandProfileId}
        data-assigned-ids={assignedIds.join(",")}
      >
        Assignment dialog
      </div>
    ) : null,
}));

mock.module("@/components/shadcn-studio/card/integration-switcher", () => ({
  IntegrationSwitcher: ({
    tabBarTrailing,
    data,
  }: {
    tabBarTrailing?: React.ReactNode;
    data: Record<string, Array<{ title: string }>>;
  }) => (
    <section aria-label="assigned brand integrations">
      {tabBarTrailing}
      <div>{data.facebook?.[0]?.title}</div>
    </section>
  ),
}));

import { BrandIntegrationsSwitcher } from "./BrandIntegrationsSwitcher";

function createSummary(): BrandIntegrationSummary {
  return {
    facebook: {
      accounts: [
        {
          assignmentId: "assignment-1",
          integrationAccountId: "asset-1",
          name: "Meta Ads",
          alias: null,
          externalAccountId: "act_1",
          status: "active",
          linkedAt: null,
          providerIntegrationId: "integration-1",
          type: "meta_ad_account",
          settings: null,
        },
      ],
    },
  } as BrandIntegrationSummary;
}

describe("BrandIntegrationsSwitcher", () => {
  beforeEach(() => {
    cleanup();
    activeBrandId = "brand-1";
    integrations = createSummary();
    refreshMock.mockClear();
  });

  it("opens the assignment dialog directly from the assigned integrations view", () => {
    render(<BrandIntegrationsSwitcher initialSummary={integrations} />);

    fireEvent.click(screen.getByRole("button", { name: "Assign accounts" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-brand-id")).toBe("brand-1");
    expect(dialog.getAttribute("data-assigned-ids")).toBe("asset-1");
    expect(screen.queryByText("Manage brand integrations")).toBeNull();
  });
});
