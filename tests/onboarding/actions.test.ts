import { beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('@/lib/onboarding/storage', () => ({
  fetchOnboardingState: mock(() => Promise.resolve({})),
  applyOnboardingPatch: mock(() => Promise.resolve({})),
}));

mock.module('@/lib/onboarding/agentClient', () => ({
  approveOnboardingBrandProfile: mock(() =>
    Promise.resolve({ brand_profile: { id: 'brand-123', brand_name: 'Test Brand' } }),
  ),
}));

mock.module('@/lib/api/integrations/server', () => ({
  applyBrandProfileIntegrationAccountsServer: mock(() => Promise.resolve({})),
}));

mock.module('@/lib/api/strategicAnalyses.server', () => ({
  runStrategicAnalysisServer: mock(() => Promise.resolve({})),
}));

mock.module('server-only', () => ({}));

const bpiaRowsMock = mock(() => Promise.resolve({ data: [], error: null }));

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mock(() =>
    Promise.resolve({
      auth: {
        getUser: mock(() => Promise.resolve({ data: { user: { id: 'user-123' } } })),
        getClaims: mock(() =>
          Promise.resolve({
            data: { claims: { sub: 'user-123', email: 'owner@example.com' } },
            error: null,
          }),
        ),
        getSession: mock(() =>
          Promise.resolve({
            data: { session: { access_token: 'test-access-token' } },
            error: null,
          }),
        ),
      },
      schema: mock(() => ({
        from: mock(() => ({
          select: mock(() => ({
            eq: bpiaRowsMock,
          })),
        })),
      })),
    }),
  ),
}));

mock.module('next/cache', () => ({
  revalidatePath: mock(() => {}),
}));

mock.module('next/server', () => ({
  after: mock((task: () => Promise<void> | void) => {
    void task();
  }),
}));

const posthogCaptureMock = mock(() => {});
const posthogShutdownMock = mock(() => Promise.resolve());
mock.module('@/lib/posthog-server', () => ({
  getPostHogClient: () => ({
    capture: posthogCaptureMock,
    shutdown: posthogShutdownMock,
  }),
}));

const mockStartBrandInsightsServer = mock(() => Promise.resolve());
mock.module('@/lib/api/brandInsights.server', () => ({
  startBrandInsightsServer: mockStartBrandInsightsServer,
}));

import { approveAndLaunchOnboardingAction } from '@/app/onboarding/actions';
import { approveOnboardingBrandProfile } from '@/lib/onboarding/agentClient';
import { fetchOnboardingState } from '@/lib/onboarding/storage';

const mockRunStrategicAnalysisServer = mock(() => Promise.resolve({}));
mock.module('@/lib/api/strategicAnalyses.server', () => ({
  runStrategicAnalysisServer: mockRunStrategicAnalysisServer,
}));

const mockApplyBrandProfileIntegrationAccountsServer = mock(() => Promise.resolve({}));

mock.module('@/lib/api/integrations/server', () => ({
  applyBrandProfileIntegrationAccountsServer: mockApplyBrandProfileIntegrationAccountsServer,
}));

describe('approveAndLaunchOnboardingAction', () => {
  const brandId = 'brand-123';
  const mockState = {
    brand: {
      name: 'Test Brand',
      industry: 'Advertising',
      brandVoice: 'Friendly',
      brandVoiceTags: ['Professional'],
      targetAudience: 'Small businesses',
      website: 'https://example.com',
    },
    connections: {
      googleAds: {
        connected: true,
        accounts: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            selected: true,
            name: 'Acc 1',
          },
          {
            id: '00000000-0000-4000-8000-000000000002',
            selected: false,
            name: 'Acc 2',
          },
        ],
      },
      facebook: {
        connected: true,
        accounts: [
          {
            id: '00000000-0000-4000-8000-000000000003',
            selected: true,
            name: 'Acc 3',
          },
        ],
      },
    },
    documents: [],
  };

  beforeEach(() => {
    (fetchOnboardingState as unknown as ReturnType<typeof mock>).mockClear();
    (approveOnboardingBrandProfile as unknown as ReturnType<typeof mock>).mockClear();
    mockApplyBrandProfileIntegrationAccountsServer.mockClear();
    mockRunStrategicAnalysisServer.mockClear();
    mockStartBrandInsightsServer.mockClear();
    posthogCaptureMock.mockClear();
    bpiaRowsMock.mockReset();
    bpiaRowsMock.mockResolvedValue({ data: [], error: null });

    (
      fetchOnboardingState as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue(mockState);
  });

  it('should call approval with correctly formatted brandProfile and runContext', async () => {
    await approveAndLaunchOnboardingAction(brandId);

    expect(approveOnboardingBrandProfile).toHaveBeenCalled();
    const callArgs = (approveOnboardingBrandProfile as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as {
      payload: { brandProfile: Record<string, unknown>; runContext: Record<string, unknown> };
    };

    expect(callArgs.payload.brandProfile).toEqual(
      expect.objectContaining({
        id: brandId,
        brand_name: 'Test Brand',
        website_url: 'https://example.com',
      }),
    );

    expect(callArgs.payload.runContext.integration_account_ids).toEqual(
      expect.arrayContaining([
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000003',
      ]),
    );
    expect(callArgs.payload.runContext.integrated_platforms).toEqual(
      expect.arrayContaining(['google-ads', 'meta']),
    );
  });

  it('should prefer assigned integration accounts and trigger strategic analysis in background', async () => {
    bpiaRowsMock.mockResolvedValue({
      data: [
        {
          integration_account_id: 'assigned-meta-1',
          integration_accounts_assets: { type: 'meta_page' },
        },
        {
          integration_account_id: 'assigned-google-1',
          integration_accounts_assets: { type: 'google_ads' },
        },
      ],
      error: null,
    });

    await approveAndLaunchOnboardingAction(brandId);

    const callArgs = (approveOnboardingBrandProfile as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as {
      payload: { runContext: Record<string, unknown> };
    };
    expect(callArgs.payload.runContext.integration_account_ids).toEqual([
      'assigned-meta-1',
      'assigned-google-1',
    ]);
    expect(callArgs.payload.runContext.integrated_platforms).toEqual(
      expect.arrayContaining(['meta', 'google-ads']),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRunStrategicAnalysisServer).toHaveBeenCalledWith(
      expect.objectContaining({ brandId }),
    );
    expect(mockStartBrandInsightsServer).toHaveBeenCalledTimes(1);
    expect(mockStartBrandInsightsServer).toHaveBeenCalledWith(brandId);
  });

  it('does not start Trends when brand approval fails', async () => {
    const approvalMock = approveOnboardingBrandProfile as unknown as ReturnType<typeof mock>;
    approvalMock.mockRejectedValueOnce(new Error('approval failed'));

    await expect(approveAndLaunchOnboardingAction(brandId)).rejects.toThrow('approval failed');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockRunStrategicAnalysisServer).not.toHaveBeenCalled();
    expect(mockStartBrandInsightsServer).not.toHaveBeenCalled();
  });
});
