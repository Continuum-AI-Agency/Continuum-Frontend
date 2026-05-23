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

const applyBrandIntegrationAssignmentsActionMock = mock(
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
}));

mock.module("@/app/(post-auth)/settings/integrations/actions", () => ({
  applyBrandIntegrationAssignmentsAction: applyBrandIntegrationAssignmentsActionMock,
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: mock(() => undefined),
    push: mock(() => undefined),
    replace: mock(() => undefined),
  }),
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
    applyBrandIntegrationAssignmentsActionMock.mockClear();
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
    expect(applyBrandIntegrationAssignmentsActionMock).toHaveBeenCalledWith("brand-1", [
      "ig-account-1",
    ]);
  });

  it("shows an IG-only user's standalone account even when a teammate has tagged a Meta asset", async () => {
    // Alice connected only an Instagram account (no Meta ad account, no FB Page).
    // Bob tagged his Facebook page into the same brand. Pre-fix, Alice's IG
    // disappeared from the dialog because the meta provider merge skipped the
    // flat-list fallback. Post-fix, both rows appear in the Standalone Meta
    // accounts section.
    userAssets = [
      {
        id: "alice-ig-only",
        integration_id: "meta-integration-alice",
        type: "meta_instagram_account",
        name: "Alice IG",
        status: "active",
        external_account_id: "17841400000000111",
        ad_account_id: null,
      },
    ];

    const teammateSummary = {
      facebook: {
        accounts: [
          {
            assignmentId: "assign-bob-page",
            integrationAccountId: "bob-page",
            alias: null,
            name: "Bob's Page",
            externalAccountId: "1000000000000",
            status: "active",
            linkedAt: null,
            providerIntegrationId: "meta-integration-bob",
            type: "meta_page",
            settings: null,
            ownerUserId: "user-bob",
          },
        ],
      },
    } as unknown as import("@/lib/integrations/brandProfile").BrandIntegrationSummary;

    render(
      <AssignmentsDialog
        open
        onOpenChange={mock(() => undefined)}
        brandProfileId="brand-1"
        summary={teammateSummary}
        assignedIds={["bob-page"]}
        members={[
          { id: "user-bob", email: "bob@example.com", role: "admin" },
          { id: "user-alice", email: "alice@example.com", role: "owner" },
        ]}
        currentUserId="user-alice"
      />
    );

    fireEvent.click(screen.getByText("Meta Portfolio"));
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    // Both rows must be present in the standalone section.
    expect(screen.getByText("Alice IG")).toBeTruthy();
    expect(screen.getByText("Bob's Page")).toBeTruthy();
  });

  it("renders teammate-owned rows with a 'Tagged by' caption and a disabled checkbox", async () => {
    // Alice's own assets are unchanged from the default beforeEach. Bob has
    // tagged his Instagram account into the same brand — Alice should see
    // it but be unable to edit it.
    const teammateSummary = {
      instagram: {
        accounts: [
          {
            assignmentId: "assign-bob",
            integrationAccountId: "bob-ig-account",
            alias: null,
            name: "Bob's IG",
            externalAccountId: "17841400000000999",
            status: "active",
            linkedAt: null,
            providerIntegrationId: "meta-integration-bob",
            type: "meta_instagram_account",
            settings: null,
            ownerUserId: "user-bob",
          },
        ],
      },
    } as unknown as import("@/lib/integrations/brandProfile").BrandIntegrationSummary;

    render(
      <AssignmentsDialog
        open
        onOpenChange={mock(() => undefined)}
        brandProfileId="brand-1"
        summary={teammateSummary}
        assignedIds={["bob-ig-account"]}
        members={[
          { id: "user-bob", email: "bob@example.com", role: "admin" },
          { id: "user-alice", email: "alice@example.com", role: "owner" },
        ]}
        currentUserId="user-alice"
      />
    );

    fireEvent.click(screen.getByText("Meta Portfolio"));
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByText("Bob's IG")).toBeTruthy();
    expect(screen.getByText(/Tagged by bob/)).toBeTruthy();

    // Bob's row checkbox is in the standalone Meta accounts table — find it
    // by walking up from the asset name to its row.
    const bobRow = screen.getByText("Bob's IG").closest("tr");
    expect(bobRow).toBeTruthy();
    const bobCheckbox = bobRow!.querySelector("[role=checkbox]");
    expect(bobCheckbox).toBeTruthy();
    expect(bobCheckbox!.getAttribute("aria-disabled") === "true" ||
      bobCheckbox!.hasAttribute("disabled") ||
      bobCheckbox!.getAttribute("data-disabled") !== null).toBe(true);
    expect(bobCheckbox!.getAttribute("aria-checked")).toBe("true");
  });
});
