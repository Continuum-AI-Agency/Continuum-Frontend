import { expect, test } from 'bun:test';
import { createTranslator } from 'next-intl';
import { TOAST_VARIANTS } from '@/components/ui/ToastProvider';
import { englishMessages } from '@/i18n/__tests__/render';
import {
  createDashboardWelcomeToastOptions,
  DASHBOARD_WELCOME_TOAST_DURATION_MS,
  shouldShowDashboardWelcomeToast,
} from '@/lib/ui/dashboardWelcomeToast';

const t = createTranslator({ locale: 'en', messages: englishMessages, namespace: 'common' });

test('ToastProvider supports the info variant', () => {
  expect(TOAST_VARIANTS).toContain('info');
});

test('Dashboard welcome toast options use info styling + configured duration', () => {
  const toast = createDashboardWelcomeToastOptions(' Duane Scott ', t);

  expect(toast.variant).toBe('info');
  expect(DASHBOARD_WELCOME_TOAST_DURATION_MS).toBe(5_000);
  expect(toast.durationMs).toBe(DASHBOARD_WELCOME_TOAST_DURATION_MS);
  expect(toast.title).toBe('Welcome back, Duane Scott.');
  expect(toast.description).toContain('top bar');
  expect(toast.description).not.toContain('right');
});

test('Dashboard welcome toast options fall back to User', () => {
  const toast = createDashboardWelcomeToastOptions('   ', t);
  expect(toast.title).toBe('Welcome back, User.');
});

test('Dashboard welcome toast only shows on /dashboard', () => {
  expect(shouldShowDashboardWelcomeToast('/dashboard')).toBe(true);
  expect(shouldShowDashboardWelcomeToast('/dashboard/brands')).toBe(false);
  expect(shouldShowDashboardWelcomeToast(null)).toBe(false);
});
