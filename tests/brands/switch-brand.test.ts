import { beforeEach, expect, mock, test } from 'bun:test';

// `switchBrand` used to take the switch as a `switchAction` callback. `feat(brand-switch):
// centralize scoped store teardown` (f5268038) made it call the server action directly, so
// every caller tears the scoped stores down the same way instead of each passing its own
// action. The seam is the module boundary now, so the test mocks the action module — the
// old `switchAction` option no longer exists and passing one proved nothing.
const switchActiveBrandAction = mock((_brandId: string) => Promise.resolve());

mock.module('@/app/(post-auth)/settings/actions', () => ({ switchActiveBrandAction }));

const { switchBrand } = await import('../../src/lib/brands/switch-brand');

beforeEach(() => {
  switchActiveBrandAction.mockClear();
});

test('switchBrand skips when target brand is missing or unchanged', async () => {
  let refreshCalls = 0;

  const switchedEmpty = await switchBrand({
    targetBrandId: '',
    activeBrandId: 'brand-1',
    refresh: () => {
      refreshCalls += 1;
    },
  });

  const switchedSame = await switchBrand({
    targetBrandId: 'brand-1',
    activeBrandId: 'brand-1',
    refresh: () => {
      refreshCalls += 1;
    },
  });

  expect(switchedEmpty).toBe(false);
  expect(switchedSame).toBe(false);
  expect(switchActiveBrandAction).not.toHaveBeenCalled();
  expect(refreshCalls).toBe(0);
});

test('switchBrand triggers switch action and refresh when brand changes', async () => {
  let refreshed = false;

  const didSwitch = await switchBrand({
    targetBrandId: 'brand-2',
    activeBrandId: 'brand-1',
    refresh: () => {
      refreshed = true;
    },
  });

  expect(didSwitch).toBe(true);
  expect(switchActiveBrandAction).toHaveBeenCalledWith('brand-2');
  expect(refreshed).toBe(true);
});
