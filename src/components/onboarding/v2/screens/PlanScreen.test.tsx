// "Choose your plan" finishes onboarding once the brand holds a product. These drive the real
// screen over a scripted billing overview: a grant picked up by "Check again" completes it, and a
// completion that failed is retried from the screen rather than leaving the brand stuck.

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import {
  type BillingOverview,
  billingOverviewSchema,
  type ProductCode,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

const show = mock();
const noop = () => undefined;
// mock.module is process-wide: the router and the billing API stay whole for later files.
mock.module('next/navigation', () => ({
  useRouter: () => ({ refresh: noop, push: noop, replace: noop, prefetch: noop, back: noop }),
  usePathname: () => '/onboarding',
  useSearchParams: () => new URLSearchParams(),
}));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show }) }));

let products: ProductCode[] = [];
const fetchBillingOverview = mock(async (_brandId: string) => overview(products));
const billingApi = await import('@/lib/billing/billingApi');
mock.module('@/lib/billing/billingApi', () => ({ ...billingApi, fetchBillingOverview }));

const { PlanScreen } = await import('./PlanScreen');

function overview(granted: ProductCode[]): BillingOverview {
  return billingOverviewSchema.parse({
    brandId: BRAND_ID,
    entitlements: {
      brandId: BRAND_ID,
      planCode: granted.length > 0 ? 'contract' : 'free',
      status: granted.length > 0 ? 'active' : 'inactive',
      billingModel: granted.length > 0 ? 'contract' : 'none',
      plans: [],
      products: granted,
      addons: [],
      trendsTier: null,
      buckets: [],
      creditBalance: { totalCredits: 0, purchasedCredits: 0, rolloverCredits: 0 },
    },
    hasPaymentMethod: false,
    overageEnabled: false,
    overageCapUsd: null,
    subscription: null,
    invoices: [],
    canvas: { studioBucket: null, rolloverUsd: 0, purchasedBalanceUsd: 0, overageUsd: 0 },
    catalog: {
      plans: [
        {
          planCode: 'organic_studio',
          displayName: 'Organic Plus',
          monthlyPriceUsd: 30,
          products: ['studio', 'organic_agent'],
          includedCanvasCredits: 1000,
        },
      ],
      creditPack: { credits: 1000, priceUsd: 10, maxPacks: 50 },
    },
    livemode: false,
  });
}

function renderPlanScreen(props: { onComplete: () => void; completing?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = (completing: boolean) => (
    <QueryClientProvider client={client}>
      <PlanScreen
        brandId={BRAND_ID}
        onBack={noop}
        onComplete={props.onComplete}
        completing={completing}
      />
    </QueryClientProvider>
  );
  const view = render(element(props.completing ?? false));
  return { setCompleting: (completing: boolean) => view.rerender(element(completing)) };
}

beforeEach(() => {
  products = [];
  fetchBillingOverview.mockClear();
  show.mockClear();
});
afterEach(cleanup);

test('Check again picks up a grant made after the screen loaded and completes onboarding', async () => {
  const onComplete = mock();
  renderPlanScreen({ onComplete });
  const checkAgain = await screen.findByRole('button', { name: 'Check again' });
  expect(onComplete).not.toHaveBeenCalled();

  products = ['studio', 'organic_agent', 'mcp', 'trends'];
  fireEvent.click(checkAgain);

  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId('plan-active')).toBeTruthy();
});

test('Check again with still no product completes nothing and says the brand is not enabled', async () => {
  const onComplete = mock();
  renderPlanScreen({ onComplete });
  fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));

  await screen.findByTestId('plan-not-enabled');
  expect(onComplete).not.toHaveBeenCalled();
});

test('a brand that already holds a product completes on arrival, once', async () => {
  products = ['studio'];
  const onComplete = mock();
  renderPlanScreen({ onComplete });

  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('a completion that failed is retried from the screen', async () => {
  products = ['mcp', 'trends'];
  const onComplete = mock();
  const { setCompleting } = renderPlanScreen({ onComplete });
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

  // The completion ran and failed: the parent clears `completing` and stays on this screen.
  setCompleting(true);
  setCompleting(false);
  const retry = screen.getByRole('button', { name: 'Go to dashboard' }) as HTMLButtonElement;
  expect(retry.disabled).toBe(false);
  fireEvent.click(retry);

  expect(onComplete).toHaveBeenCalledTimes(2);
});
