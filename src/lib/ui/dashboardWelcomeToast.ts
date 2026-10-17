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

export function createDashboardWelcomeToastOptions(displayName: string): ToastOptions {
  const safeDisplayName = displayName.trim().length > 0 ? displayName.trim() : 'User';
  return {
    title: `Welcome back, ${safeDisplayName}.`,
    description:
      'Your dashboard shows live brand insights and quick actions. Switch brands or add one from the top bar.',
    variant: 'info',
    durationMs: DASHBOARD_WELCOME_TOAST_DURATION_MS,
  };
}
