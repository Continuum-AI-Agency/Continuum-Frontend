import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';

type ContextPair = {
  brandId: string;
  adAccountId: string | null;
};

const renderedContextPairs: ContextPair[] = [];
const prefetchedContextPairs: ContextPair[] = [];
let latestOptimizerPrefetch: (() => void) | null = null;
let latestPlatformChange: ((platform: 'linkedin') => void) | null = null;
let latestAccountSelect: ((accountId: string) => void) | null = null;
let latestSelectorPlatform: string | null = null;
let latestAssignedAccountIds: string[] | null | undefined;
let optimizerAdAccounts: { data: Array<{ account_id: string }>; isSuccess: boolean } = {
  data: [],
  isSuccess: false,
};
let dynamicComponentIndex = 0;

mock.module('next/dynamic', () => ({
  default: () => {
    const componentIndex = dynamicComponentIndex;
    dynamicComponentIndex += 1;

    return function DynamicPaidMediaSurface(props: Record<string, unknown>) {
      const brandId =
        typeof props.brandId === 'string'
          ? props.brandId
          : typeof props.brandProfileId === 'string'
            ? props.brandProfileId
            : null;

      if (brandId && Object.hasOwn(props, 'adAccountId')) {
        renderedContextPairs.push({
          brandId,
          adAccountId: typeof props.adAccountId === 'string' ? props.adAccountId : null,
        });
      }

      if (typeof props.onPlatformChange === 'function') {
        latestPlatformChange = props.onPlatformChange as (platform: 'linkedin') => void;
      }

      return <div data-testid={`dynamic-paid-media-surface-${componentIndex}`} />;
    };
  },
}));

mock.module('next/navigation', () => ({
  useRouter: () => ({ replace: mock(() => {}) }),
  useSearchParams: () => new URLSearchParams('tab=jaina'),
}));

mock.module('@/hooks/useSession', () => ({
  useSession: () => ({ user: { id: 'user-1' } }),
}));

mock.module('@/components/paid-media/optimizer/useOptimizerData', () => ({
  usePrefetchOptimizerOverview: (brandId: string, adAccountId: string | null) => {
    latestOptimizerPrefetch = () => {
      prefetchedContextPairs.push({ brandId, adAccountId });
    };
    return latestOptimizerPrefetch;
  },
  useOptimizerAdAccounts: () => optimizerAdAccounts,
}));

mock.module('@/lib/prefetch/paid-media-cache', () => ({
  prefetchPaidMediaDashboard: (pair: ContextPair) => {
    prefetchedContextPairs.push(pair);
  },
}));

mock.module('@/components/paid-media/AdAccountSelector', () => ({
  AdAccountSelector: (props: {
    onSelect: (accountId: string) => void;
    platform: string;
    assignedAccountIds?: string[] | null;
  }) => {
    latestAccountSelect = props.onSelect;
    latestSelectorPlatform = props.platform;
    latestAssignedAccountIds = props.assignedAccountIds;
    return <div data-testid="ad-account-selector" />;
  },
}));

mock.module('@/components/paid-media/PaidSetupDiagnostics', () => ({
  PaidSetupDiagnostics: () => <div data-testid="paid-setup-diagnostics" />,
}));

mock.module('@/components/shared/PageHeader', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}));

mock.module('@/components/ui/skeleton', () => ({
  Skeleton: (props: ComponentProps<'div'>) => <div {...props} />,
}));

mock.module('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

mock.module('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

mock.module('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    aside: ({ children, ...props }: ComponentProps<'aside'>) => (
      <aside {...props}>{children}</aside>
    ),
    div: ({ children, ...props }: ComponentProps<'div'>) => <div {...props}>{children}</div>,
  },
}));

const { default: PaidMediaClientPage } = await import('./PaidMediaClient');

describe('PaidMediaClientPage brand context', () => {
  beforeEach(() => {
    renderedContextPairs.length = 0;
    prefetchedContextPairs.length = 0;
    latestOptimizerPrefetch = null;
    latestPlatformChange = null;
    latestAccountSelect = null;
    latestSelectorPlatform = null;
    latestAssignedAccountIds = undefined;
    optimizerAdAccounts = { data: [], isSuccess: false };

    globalThis.requestIdleCallback = ((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 50 });
      return 1;
    }) as typeof requestIdleCallback;
    globalThis.cancelIdleCallback = mock(() => {});
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(globalThis, 'requestIdleCallback');
    Reflect.deleteProperty(globalThis, 'cancelIdleCallback');
  });

  it('never renders or prefetches a previous account with the next brand', async () => {
    const { rerender } = render(
      <PaidMediaClientPage
        brandProfileId="brand-a"
        brandName="Brand A"
        initialAccounts={[{ id: 'account-a', name: 'Account A' }]}
        initialAdAccountId="account-a"
      />,
    );

    await waitFor(() => {
      expect(renderedContextPairs).toContainEqual({
        brandId: 'brand-a',
        adAccountId: 'account-a',
      });
    });

    renderedContextPairs.length = 0;
    prefetchedContextPairs.length = 0;

    rerender(
      <PaidMediaClientPage
        brandProfileId="brand-b"
        brandName="Brand B"
        initialAccounts={[{ id: 'account-b', name: 'Account B' }]}
        initialAdAccountId="account-b"
      />,
    );

    await waitFor(() => {
      expect(renderedContextPairs).toContainEqual({
        brandId: 'brand-b',
        adAccountId: 'account-b',
      });
    });

    const mixedPair = { brandId: 'brand-b', adAccountId: 'account-a' };
    expect(renderedContextPairs).not.toContainEqual(mixedPair);
    expect(prefetchedContextPairs).not.toContainEqual(mixedPair);

    act(() => latestOptimizerPrefetch?.());
    expect(prefetchedContextPairs).toContainEqual({
      brandId: 'brand-b',
      adAccountId: 'account-b',
    });

    renderedContextPairs.length = 0;
    act(() => latestPlatformChange?.('linkedin'));

    await waitFor(() => {
      expect(latestSelectorPlatform).toBe('linkedin');
    });
    expect(renderedContextPairs).not.toContainEqual({
      brandId: 'brand-b',
      adAccountId: 'account-b',
    });

    act(() => latestAccountSelect?.('linkedin-account-b'));
    await waitFor(() => {
      expect(renderedContextPairs).toContainEqual({
        brandId: 'brand-b',
        adAccountId: 'linkedin-account-b',
      });
    });
  });

  it('scopes the selector to brand-ASSIGNED accounts for meta, and unfilters for linkedin', async () => {
    optimizerAdAccounts = {
      data: [{ account_id: 'act_assigned_1' }, { account_id: 'act_assigned_2' }],
      isSuccess: true,
    };

    render(
      <PaidMediaClientPage
        brandProfileId="brand-a"
        brandName="Brand A"
        initialAccounts={[{ id: 'act_assigned_1', name: 'Assigned One' }]}
        initialAdAccountId="act_assigned_1"
      />,
    );

    // Meta (default): the selector receives exactly the optimizer's assigned set,
    // so it can only ever offer an account the optimizer will admit.
    await waitFor(() => {
      expect(latestAssignedAccountIds).toEqual(['act_assigned_1', 'act_assigned_2']);
    });

    // LinkedIn is not covered by list_brand_ad_accounts — the set must be undefined
    // (unfiltered) so the picker isn't emptied of every legitimately-connected row.
    act(() => latestPlatformChange?.('linkedin'));
    await waitFor(() => {
      expect(latestSelectorPlatform).toBe('linkedin');
      expect(latestAssignedAccountIds).toBeUndefined();
    });
  });

  it('leaves the selector unfiltered while the assigned lookup is unresolved (no dead-end on outage)', async () => {
    optimizerAdAccounts = { data: [], isSuccess: false };

    render(
      <PaidMediaClientPage
        brandProfileId="brand-a"
        brandName="Brand A"
        initialAccounts={[{ id: 'act_reachable', name: 'Reachable' }]}
        initialAdAccountId="act_reachable"
      />,
    );

    await waitFor(() => {
      expect(latestSelectorPlatform).toBe('meta');
    });
    expect(latestAssignedAccountIds).toBeUndefined();
  });
});
