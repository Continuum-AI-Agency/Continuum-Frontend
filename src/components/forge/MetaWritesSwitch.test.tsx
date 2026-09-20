/**
 * MetaWritesSwitch — the brand's arming control on the Forge. Covers the three
 * things that matter: a non-admin cannot arm, a toggle calls the action with
 * the brand and the new value, and a refused write surfaces rather than
 * silently leaving the switch looking flipped.
 */

import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const BRAND = '33333333-3333-4333-8333-333333333333';

const updateBrandMetaWritesAllowedAction = mock(async (_brandId: string, _allowed: boolean) => {});
const refresh = mock(() => {});
const show = mock((_options: unknown) => {});

// Spread the real modules: a PARTIAL mock.module deletes a module's other
// exports for every file that loads afterwards, in this whole process.
const actions = await import('@/app/(post-auth)/settings/actions');
mock.module('@/app/(post-auth)/settings/actions', () => ({
  ...actions,
  updateBrandMetaWritesAllowedAction,
}));
const nav = await import('next/navigation');
mock.module('next/navigation', () => ({ ...nav, useRouter: () => ({ refresh }) }));
const toast = await import('@/components/ui/ToastProvider');
mock.module('@/components/ui/ToastProvider', () => ({ ...toast, useToast: () => ({ show }) }));

const { MetaWritesSwitch } = await import('@/components/forge/MetaWritesSwitch');

afterEach(() => {
  cleanup();
  updateBrandMetaWritesAllowedAction.mockClear();
  refresh.mockClear();
  show.mockClear();
});

const control = () => screen.getByRole('switch', { name: /allow real meta writes/i });

test('a member who is not an owner or admin cannot arm the brand', () => {
  render(<MetaWritesSwitch brandId={BRAND} allowed={false} canEdit={false} />);
  // Base UI renders a span with aria-disabled, not a native disabled button.
  expect(control().getAttribute('aria-disabled')).toBe('true');

  fireEvent.click(control());
  expect(updateBrandMetaWritesAllowedAction).toHaveBeenCalledTimes(0);
});

test('arming calls the action with the brand and the new value', async () => {
  render(<MetaWritesSwitch brandId={BRAND} allowed={false} canEdit />);
  fireEvent.click(control());

  await waitFor(() => expect(updateBrandMetaWritesAllowedAction).toHaveBeenCalledTimes(1));
  expect(updateBrandMetaWritesAllowedAction.mock.calls[0]).toEqual([BRAND, true]);
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

test('disarming sends false, not another true', async () => {
  render(<MetaWritesSwitch brandId={BRAND} allowed canEdit />);
  fireEvent.click(control());

  await waitFor(() => expect(updateBrandMetaWritesAllowedAction).toHaveBeenCalledTimes(1));
  expect(updateBrandMetaWritesAllowedAction.mock.calls[0]).toEqual([BRAND, false]);
});

test('a refused write is shown, never swallowed', async () => {
  updateBrandMetaWritesAllowedAction.mockImplementationOnce(async () => {
    throw new Error('new row violates row-level security policy');
  });
  render(<MetaWritesSwitch brandId={BRAND} allowed={false} canEdit />);
  fireEvent.click(control());

  await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
  const options = show.mock.calls[0]?.[0] as { variant?: string; description?: string };
  expect(options.variant).toBe('error');
  expect(options.description).toContain('row-level security');
  expect(refresh).toHaveBeenCalledTimes(0);
});

test('the copy says what the current state actually does', () => {
  const { rerender } = render(<MetaWritesSwitch brandId={BRAND} allowed={false} canEdit />);
  expect(screen.getByText(/previewed only/i)).toBeTruthy();

  rerender(<MetaWritesSwitch brandId={BRAND} allowed canEdit />);
  expect(screen.getByText(/publish to this brand/i)).toBeTruthy();
});
