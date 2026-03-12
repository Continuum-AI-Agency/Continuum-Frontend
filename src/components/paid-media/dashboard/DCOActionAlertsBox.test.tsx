import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";

import type { ActionLog } from "@/lib/types/dco";
import { DCOActionAlertsBox } from "./DCOActionAlertsBox";

const mockRefresh = mock();
const mockSetFilters = mock();
const mockSetSort = mock();
const mockGoToPage = mock();

const logs: ActionLog[] = [
  {
    id: "log_1",
    brandId: "brand_1",
    metaAccountId: "act_1",
    metaCampaignId: "cmp_1",
    metaAdsetId: "adset_1",
    metaAdId: "ad_1",
    actionType: "ADJUST_BUDGET",
    status: "SUCCESS",
    scopeType: "CAMPAIGN",
    scopeId: "cmp_1",
    occurredAt: "2026-03-01T10:00:00.000Z",
    actionPayload: {},
    paramsChanged: {},
    result: {},
    decisionNote: null,
    error: null,
  },
];

mock.module("@/hooks/useDCOActionLogs", () => ({
  useDCOActionLogs: () => ({
    logs,
    isLoading: false,
    error: null,
    pagination: {
      page: 1,
      pageSize: 80,
      totalCount: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
    filters: {},
    sort: { sortBy: "occurred_at", sortOrder: "desc" },
    campaigns: [],
    adAccounts: [],
    isLoadingCampaigns: false,
    isLoadingAdAccounts: false,
    setFilters: mockSetFilters,
    setSort: mockSetSort,
    goToPage: mockGoToPage,
    refresh: mockRefresh,
  }),
}));

mock.module("@/components/ui/command", () => ({
  Command: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => <input placeholder={placeholder} />,
  CommandItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
}));

mock.module("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

describe("DCOActionAlertsBox", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockSetFilters.mockClear();
    mockSetSort.mockClear();
    mockGoToPage.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("refreshes alerts and notifies parent refresh listeners", () => {
    const onRefresh = mock();

    const { container } = render(
      <DCOActionAlertsBox
        brandId="brand_1"
        metaAccountId="act_1"
        campaignId="cmp_1"
        onRefresh={onRefresh}
      />
    );

    const refreshButton = Array.from(container.getElementsByTagName("button")).find(
      (button) => button.getAttribute("aria-label") === "Refresh alerts"
    );
    expect(refreshButton).toBeTruthy();
    fireEvent.click(refreshButton as HTMLButtonElement);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
