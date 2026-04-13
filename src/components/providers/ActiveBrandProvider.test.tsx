import { mock } from "bun:test";

// ─── Module mocks (hoisted by bun before imports) ────────────────────────────
//
// We mock switchActiveBrandAction (server action) and the navigation/session
// hooks. We do NOT mock @/lib/brands/switch-brand — the real implementation is
// pure logic that works correctly with the mocked server action, and mocking it
// would contaminate that module's own test file when bun runs both together.

let mockSwitchActionThrows = false;
let mockSessionUser: { user_metadata?: Record<string, unknown> } | null = null;

mock.module("@/app/(post-auth)/settings/actions", () => ({
  switchActiveBrandAction: async (_brandId: string) => {
    if (mockSwitchActionThrows) throw new Error("Switch failed");
  },
}));

mock.module("@/hooks/useSession", () => ({
  useSession: () => ({ session: null, user: mockSessionUser, isLoading: false }),
}));

mock.module("@/components/ui/ToastProvider", () => ({
  useToastContext: () => null,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import React from "react";
import { render, act } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "bun:test";
import { ActiveBrandProvider, useActiveBrandContext } from "./ActiveBrandProvider";

// Inline to avoid importing DashboardLayoutShell, which has a circular import
// back to ActiveBrandProvider and Next.js dynamic imports that fail in tests.
type BrandSummary = {
  id: string;
  name: string;
  completed: boolean;
  logoPath?: string | null;
  logoUrl?: string | null;
  isPending?: boolean;
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const brandA: BrandSummary = { id: "brand-a", name: "Brand A", completed: true };
const brandB: BrandSummary = { id: "brand-b", name: "Brand B", completed: true };
const summaries: BrandSummary[] = [brandA, brandB];

// ─── Consumer component ───────────────────────────────────────────────────────
//
// Renders the active brand ID as text. Tests read it via getElementsByTagName
// (tag-based, not querySelectorAll) to avoid a happy-dom bug where
// window.SyntaxError is undefined in the attribute-selector error path.

function TestConsumer({
  onSelectBrand,
}: {
  onSelectBrand?: (fn: (id: string) => Promise<void>) => void;
} = {}) {
  const { activeBrandId, selectBrand } = useActiveBrandContext();

  React.useEffect(() => {
    onSelectBrand?.(selectBrand);
  }, [onSelectBrand, selectBrand]);

  return <span>{`active:${activeBrandId}`}</span>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ProviderProps = { activeBrandId?: string; brandSummaries?: BrandSummary[] };

function renderProvider(props: ProviderProps = {}) {
  let selectBrandFn: (id: string) => Promise<void>;

  const utils = render(
    <ActiveBrandProvider
      activeBrandId={props.activeBrandId ?? "brand-a"}
      brandSummaries={props.brandSummaries ?? summaries}
      user={null}
    >
      <TestConsumer onSelectBrand={(fn) => { selectBrandFn = fn; }} />
    </ActiveBrandProvider>
  );

  const selectBrand = async (id: string) => {
    await act(async () => {
      await selectBrandFn!(id);
    });
  };

  return { ...utils, selectBrand };
}

function readActiveBrand(container: HTMLElement): string {
  const text = container.getElementsByTagName("span")[0]?.textContent ?? "";
  return text.replace("active:", "");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ActiveBrandProvider", () => {
  beforeEach(() => {
    mockSwitchActionThrows = false;
    mockSessionUser = null;
  });

  it("exposes the initial activeBrandId", () => {
    const { container } = renderProvider({ activeBrandId: "brand-a" });
    expect(readActiveBrand(container)).toBe("brand-a");
  });

  it("optimistically updates activeBrandId when selectBrand is called", async () => {
    const { container, selectBrand } = renderProvider({ activeBrandId: "brand-a" });
    await selectBrand("brand-b");
    expect(readActiveBrand(container)).toBe("brand-b");
  });

  it("reverts activeBrandId when the server action throws", async () => {
    mockSwitchActionThrows = true;
    const { container, selectBrand } = renderProvider({ activeBrandId: "brand-a" });
    await selectBrand("brand-b");
    expect(readActiveBrand(container)).toBe("brand-a");
  });

  it("leaves activeBrandId unchanged when the target brand is already active", async () => {
    // switchBrand returns false (no-op) when target === activeBrandId, which
    // triggers the revert path back to the previous selectedBrandId.
    const { container, selectBrand } = renderProvider({ activeBrandId: "brand-a" });
    await selectBrand("brand-a");
    expect(readActiveBrand(container)).toBe("brand-a");
  });

  it("syncs activeBrandId when the activeBrandId prop changes", async () => {
    const { container, rerender } = renderProvider({ activeBrandId: "brand-a" });

    await act(async () => {
      rerender(
        <ActiveBrandProvider activeBrandId="brand-b" brandSummaries={summaries} user={null}>
          <TestConsumer />
        </ActiveBrandProvider>
      );
    });

    expect(readActiveBrand(container)).toBe("brand-b");
  });

  // ─── Regression ─────────────────────────────────────────────────────────────
  //
  // Cross-tab sync effect used metadataId !== selectedBrandId as its only guard.
  // After a local switch: switchingToBrandId → null fires the effect with stale
  // metadata (after() hasn't updated it yet). metadataId("brand-a") !==
  // selectedBrandId("brand-b") → reverts optimistic update back to brand-a.
  //
  // Fix: also guard on metadataId !== activeBrandId. Metadata that matches the
  // server-confirmed brand is a stale echo, not a real cross-tab change.
  it("does not revert optimistic activeBrandId when session metadata is stale (after() not yet fired)", async () => {
    // Simulate: user metadata still has the old brand (after() hasn't fired yet)
    mockSessionUser = {
      user_metadata: { onboarding: { activeBrandId: "brand-a" } },
    };

    const { container, selectBrand } = renderProvider({ activeBrandId: "brand-a" });

    // Switch optimistically to brand-b. The action succeeds but metadata stays brand-a.
    await selectBrand("brand-b");

    // Stale metadata must not win — optimistic brand-b must survive.
    expect(readActiveBrand(container)).toBe("brand-b");
  });

  // router.refresh() delivers a new RSC payload with a fresh brandSummaries
  // array reference (even when content is identical). The previous combined
  // useEffect fired setSelectedBrandId(activeBrandId) on every brandSummaries
  // reference change, wiping the optimistic icon update when the server returned
  // stale cached data.
  //
  // Fix: split into two effects so setSelectedBrandId fires only when the
  // activeBrandId prop actually changes.
  it("preserves optimistic activeBrandId when brandSummaries reference changes but activeBrandId prop stays the same", async () => {
    const { container, rerender, selectBrand } = renderProvider({ activeBrandId: "brand-a" });

    await selectBrand("brand-b");
    expect(readActiveBrand(container)).toBe("brand-b");

    // Simulate router.refresh() — new brandSummaries reference, activeBrandId
    // prop still "brand-a" (server cache hasn't propagated the switch yet).
    await act(async () => {
      rerender(
        <ActiveBrandProvider
          activeBrandId="brand-a"
          brandSummaries={[...summaries]}
          user={null}
        >
          <TestConsumer />
        </ActiveBrandProvider>
      );
    });

    // Optimistic "brand-b" must survive — the icon must not revert to brand-a.
    expect(readActiveBrand(container)).toBe("brand-b");
  });
});
