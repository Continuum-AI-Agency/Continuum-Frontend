import type { useTranslations } from 'next-intl';
import type { ToastOptions } from '@/components/ui/ToastProvider';

export const DASHBOARD_WELCOME_TOAST_DURATION_MS = 5_000;

/** ToastProvider's `min-[26rem]` breakpoint (media-query rem is the 16px initial size): below it
 *  the toast viewport spans the screen and its card sits on the page's controls. */
export const WELCOME_TOAST_MIN_VIEWPORT_PX = 26 * 16;

export function shouldShowDashboardWelcomeToast(
  pathname: string | null,
  viewportWidth: number,
): boolean {
  return pathname === '/dashboard' && viewportWidth >= WELCOME_TOAST_MIN_VIEWPORT_PX;
}

export function createDashboardWelcomeToastOptions(
  displayName: string,
  t: ReturnType<typeof useTranslations<'common'>>,
): ToastOptions {
  const safeDisplayName = displayName.trim().length > 0 ? displayName.trim() : t('unnamedUser');
  return {
    title: t('dashboardWelcome', { name: safeDisplayName }),
    description: t('dashboardWelcomeDescription'),
    variant: 'info',
    durationMs: DASHBOARD_WELCOME_TOAST_DURATION_MS,
  };
}
