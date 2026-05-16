import * as React from "react";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import type { UserIntegrationAssetRow } from "@/lib/api/integrations";

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});
global.getComputedStyle = global.window.getComputedStyle.bind(global.window);
global.requestAnimationFrame = (callback: FrameRequestCallback) =>
  window.setTimeout(() => callback(Date.now()), 0);
global.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
global.MutationObserver = window.MutationObserver;
global.NodeFilter = window.NodeFilter;

const applyBrandAssignmentsDirectMock = mock(
  async (_brandProfileId: string, desiredAccountIds: string[]) => ({
    linked: desiredAccountIds.length,
  })
);

let userAssets: UserIntegrationAssetRow[] = [];

mock.module("@/lib/api/integrations", () => ({
  useUserIntegrationAssets: () => ({
    data: userAssets,
    isLoading: false,
  }),
  applyBrandAssignmentsDirect: applyBrandAssignmentsDirectMock,
}));

mock.module("@/components/ui/ToastProvider", () => ({
  useToast: () => ({
    show: mock(() => undefined),
  }),
}));

import { AssignmentsDialog } from "./AssignmentsDialog";

const emptySummary = {} as BrandIntegrationSummary;

describe("AssignmentsDialog", () => {
  beforeEach(() => {
    cleanup();
    applyBrandAssignmentsDirectMock.mockClear();
    userAssets = [
      {
        id: "ig-account-1",
        integration_id: "meta-integration-1",
        type: "meta_instagram_account",
        name: "Continuum Instagram",
        status: "active",
        external_account_id: "17841400000000000",
        ad_account_id: null,
      },
    ];
  });

  it("renders standalone Meta Instagram accounts as assignable brand assets", async () => {
    render(
      <AssignmentsDialog
        open
        onOpenChange={mock(() => undefined)}
        brandProfileId="brand-1"
        summary={emptySummary}
        assignedIds={[]}
      />
    );

    fireEvent.click(screen.getByText("Meta Portfolio"));
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Assignments" }));
    });

    expect(screen.getByText("Continuum Instagram")).toBeTruthy();
    expect(screen.getByText("Accounts not attached to a Meta ad account")).toBeTruthy();
    expect(applyBrandAssignmentsDirectMock).toHaveBeenCalledWith("brand-1", [
      "ig-account-1",
    ]);
  });
});
