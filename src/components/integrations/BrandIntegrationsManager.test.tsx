import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BrandIntegrationSummary } from '@/lib/integrations/brandProfile';

const startMetaSync = mock(async (_input: unknown) => ({ url: 'https://example.test/oauth' }));
const unusedSync = () => ({ mutateAsync: mock(async () => ({ url: '' })) });

mock.module('@/lib/api/integrations', () => ({
  fetchUserLinkedInAccountIds: mock(async () => []),
  fetchUserTikTokAccountIds: mock(async () => []),
  fetchUserXAccountIds: mock(async () => []),
  useStartMetaSync: () => ({ mutateAsync: startMetaSync }),
  useStartGoogleSync: unusedSync,
  useStartLinkedInSync: unusedSync,
  useStartTikTokSync: unusedSync,
  useStartXSync: unusedSync,
  useUserIntegrationAssets: () => ({ data: [], isLoading: false, refetch: mock(async () => ({})) }),
  useResyncMeta: () => ({ mutateAsync: mock(async () => ({ updated: [], failed: [] })) }),
}));

mock.module('@/hooks/useBrandIntegrations', () => ({
  useBrandIntegrations: () => ({ integrations: null, isLoading: false, refresh: mock(() => {}) }),
}));

// A blocked popup ends the flow right after the sync call, which is all this test reads.
mock.module('@/lib/popup', () => ({
  openCenteredPopup: mock(() => null),
  waitForPopupClosed: mock(async () => {}),
}));

mock.module('@/app/(post-auth)/settings/integrations/actions', () => ({
  applyBrandIntegrationAssignmentsAction: mock(async () => ({ linked: 0 })),
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: mock(() => {}) }),
}));

const { BrandIntegrationsManager } = await import('./BrandIntegrationsManager');

afterEach(() => {
  cleanup();
  startMetaSync.mockClear();
});

const renderCard = () =>
  render(
    <BrandIntegrationsManager brandProfileId="brand-1" summary={{} as BrandIntegrationSummary} />,
  );

describe('BrandIntegrationsManager Meta row', () => {
  it('starts Business Login for Instagram from "Instagram only"', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Instagram only' }));
    await waitFor(() => expect(startMetaSync).toHaveBeenCalledTimes(1));
    expect(startMetaSync.mock.calls[0]?.[0]).toMatchObject({ mode: 'instagram' });
  });

  it('keeps Sync on the Facebook login', async () => {
    renderCard();
    fireEvent.click(screen.getAllByRole('button', { name: 'Sync' })[0] as HTMLElement);
    await waitFor(() => expect(startMetaSync).toHaveBeenCalledTimes(1));
    expect(startMetaSync.mock.calls[0]?.[0]).toMatchObject({ mode: undefined });
  });
});
