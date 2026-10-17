import { describe, expect, it } from 'bun:test';
import {
  createDashboardWelcomeToastOptions,
  shouldShowDashboardWelcomeToast,
  WELCOME_TOAST_MIN_VIEWPORT_PX,
} from './dashboardWelcomeToast';

// PP-L1V-covered-controls-actions-jaina-manage (Home @375): below 26rem the toast viewport spans
// the screen, so the welcome toast's card — and its Dismiss button — sat on top of the
// Performance+ "Open" link for its whole life. A greeting is not worth covering a control.

describe('shouldShowDashboardWelcomeToast', () => {
  it('greets on the dashboard where the toast sits beside the content', () => {
    expect(shouldShowDashboardWelcomeToast('/dashboard', 1280)).toBe(true);
    expect(shouldShowDashboardWelcomeToast('/dashboard', WELCOME_TOAST_MIN_VIEWPORT_PX)).toBe(true);
  });

  it('stays quiet at phone widths, where the full-width toast covers the page controls', () => {
    expect(shouldShowDashboardWelcomeToast('/dashboard', 375)).toBe(false);
    expect(shouldShowDashboardWelcomeToast('/dashboard', WELCOME_TOAST_MIN_VIEWPORT_PX - 1)).toBe(
      false,
    );
  });

  it('never greets off the dashboard', () => {
    expect(shouldShowDashboardWelcomeToast('/scale', 1280)).toBe(false);
    expect(shouldShowDashboardWelcomeToast(null, 1280)).toBe(false);
  });

  it('matches the ToastProvider breakpoint (min-[26rem]) where the viewport becomes a side box', () => {
    expect(WELCOME_TOAST_MIN_VIEWPORT_PX).toBe(26 * 16);
  });
});

describe('createDashboardWelcomeToastOptions', () => {
  it('falls back to "User" for a blank name', () => {
    expect(createDashboardWelcomeToastOptions('  ').title).toBe('Welcome back, User.');
  });
});
