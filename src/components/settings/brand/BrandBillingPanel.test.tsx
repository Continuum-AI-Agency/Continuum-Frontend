import { mock } from 'bun:test';

// Same mocks as ActiveBrandProvider.test.tsx (the provider reads the session and the toast
// context). Full-module mocks only: a partial one would strip exports for later files.
mock.module('@/hooks/useSession', () => ({
  useSession: () => ({ session: null, user: null, isLoading: false }),
}));

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { ActiveBrandProvider } from '@/components/providers/ActiveBrandProvider';
import { BrandBillingPanel } from './BrandBillingPanel';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

function renderPanel(role: 'owner' | 'admin') {
  return render(
    <ActiveBrandProvider
      activeBrandId={BRAND_ID}
      brandSummaries={[{ id: BRAND_ID, name: 'Bench Brand', completed: true }]}
      permissions={[{ brand_profile_id: BRAND_ID, role }]}
      user={null}
    >
      <BrandBillingPanel billingLive={false} />
    </ActiveBrandProvider>,
  );
}

describe('BrandBillingPanel — billing not live (PGRST106)', () => {
  let fetchSpy: ReturnType<typeof spyOn>;
  beforeEach(() => {
    fetchSpy = spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    cleanup();
  });

  test('the owner sees the calm not-available state and billing-api is never called', () => {
    renderPanel('owner');
    expect(screen.getByTestId('billing-not-live').textContent).toContain(
      "Billing isn't available yet",
    );
    expect(screen.queryByTestId('billing-locked')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a non-owner sees the same state — nothing to lock before billing exists', () => {
    renderPanel('admin');
    expect(screen.getByTestId('billing-not-live')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
