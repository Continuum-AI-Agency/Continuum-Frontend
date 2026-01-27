import { describe, it, expect, mock, beforeEach } from "bun:test";

mock.module("@/lib/onboarding/storage", () => ({
  fetchOnboardingState: mock(() => Promise.resolve({})),
  applyOnboardingPatch: mock(() => Promise.resolve({})),
}));

mock.module("@/lib/onboarding/agentClient", () => ({
  approveOnboardingBrandProfile: mock(() => Promise.resolve({ brand_profile: { id: "brand-123" } })),
}));

mock.module("@/lib/api/integrations/server", () => ({
  applyBrandProfileIntegrationAccountsServer: mock(() => Promise.resolve({})),
}));

mock.module("@/lib/api/strategicAnalyses.server", () => ({
  runStrategicAnalysisServer: mock(() => Promise.resolve({})),
}));

mock.module("server-only", () => ({}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mock(() => Promise.resolve({
    auth: {
      getUser: mock(() => Promise.resolve({ data: { user: { id: "user-123" } } })),
    },
  })),
}));

mock.module("next/cache", () => ({
  revalidatePath: mock(() => {}),
}));

import { approveAndLaunchOnboardingAction } from "@/app/onboarding/actions";
import { fetchOnboardingState } from "@/lib/onboarding/storage";
import { approveOnboardingBrandProfile } from "@/lib/onboarding/agentClient";

const mockRunStrategicAnalysisServer = mock(() => Promise.resolve({}));
mock.module("@/lib/api/strategicAnalyses.server", () => ({
  runStrategicAnalysisServer: mockRunStrategicAnalysisServer,
}));

const mockApplyBrandProfileIntegrationAccountsServer = mock(() => Promise.resolve({}));

mock.module("@/lib/api/integrations/server", () => ({
  applyBrandProfileIntegrationAccountsServer: mockApplyBrandProfileIntegrationAccountsServer,
}));

describe("approveAndLaunchOnboardingAction", () => {
  const brandId = "brand-123";
  const mockState = {
    brand: {
      name: "Test Brand",
      industry: "Advertising",
      brandVoice: "Friendly",
      brandVoiceTags: ["Professional"],
      targetAudience: "Small businesses",
      website: "https://example.com",
    },
    connections: {
      googleAds: {
        connected: true,
        accounts: [
          { id: "acc-1", selected: true, name: "Acc 1" },
          { id: "acc-2", selected: false, name: "Acc 2" },
        ],
      },
      facebook: {
        connected: true,
        accounts: [{ id: "acc-3", selected: true, name: "Acc 3" }],
      },
    },
    documents: [],
  };

  beforeEach(() => {
    (fetchOnboardingState as any).mockClear();
    (approveOnboardingBrandProfile as any).mockClear();
    mockApplyBrandProfileIntegrationAccountsServer.mockClear();
    mockRunStrategicAnalysisServer.mockClear();
    
    (fetchOnboardingState as any).mockResolvedValue(mockState);
  });

  it("should call approval with correctly formatted brandProfile and runContext", async () => {
    await approveAndLaunchOnboardingAction(brandId);

    expect(approveOnboardingBrandProfile).toHaveBeenCalled();
    const callArgs = (approveOnboardingBrandProfile as any).mock.calls[0][0];
    
    expect(callArgs.payload.brandProfile).toEqual(expect.objectContaining({
      id: brandId,
      brand_name: "Test Brand",
      website_url: "https://example.com",
    }));

    expect(callArgs.payload.runContext.integration_account_ids).toEqual(
      expect.arrayContaining(["acc-1", "acc-3"])
    );
    expect(callArgs.payload.runContext.integrated_platforms).toEqual(
      expect.arrayContaining(["google-ads", "meta"])
    );
  });

  it("should call integration association and trigger strategic analysis in background", async () => {
    await approveAndLaunchOnboardingAction(brandId);

    expect(mockApplyBrandProfileIntegrationAccountsServer).toHaveBeenCalledWith(expect.objectContaining({
      brandId,
      integrationAccountIds: expect.arrayContaining(["acc-1", "acc-3"]),
    }));

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mockRunStrategicAnalysisServer).toHaveBeenCalledWith(brandId);
  });
});
