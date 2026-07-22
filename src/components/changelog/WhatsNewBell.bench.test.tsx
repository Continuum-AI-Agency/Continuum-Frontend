// End-to-end bench for FEA-05 (in-app "What's New"). Drives the REAL path with
// NO mocks of the changelog: real CHANGELOG_RAW → real changelogSchema.parse →
// real sort/unread math (getSortedChangelog / computeUnreadCount) → the rendered
// <WhatsNewBell/> and its persisted dashboardPrefs read-state.
//
// One un-exercised hop, by design: the per-row markdown body renders through
// SafeMarkdownLazy, which is `next/dynamic(..., { ssr: false })`. That does not
// hydrate under happy-dom, so the body text is NOT asserted here — the
// deterministic surface (unread badge, title, date, tag, per-row "new" dot, and
// the persisted last-seen id) IS. Verify the markdown body render manually via a
// /run through the real app.

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Radix Popover positions its content with floating-ui, which observes resize.
// happy-dom has no ResizeObserver; floating-ui guards for it, but provide a no-op
// so opening the popover stays deterministic across environments.
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver !== 'function') {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import {
  computeUnreadCount,
  getLatestEntryId,
  getSortedChangelog,
} from '@/lib/changelog/changelog';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { useDashboardPrefsStore } from '@/stores/dashboardPrefs';
import { WhatsNewBell } from './WhatsNewBell';

const realEntries = getSortedChangelog();

beforeEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    // localStorage may be unavailable; the store reset below is the real gate.
  }
  useDashboardPrefsStore.setState({ lastSeenChangelogId: null });
});

afterEach(cleanup);

describe('WhatsNewBell end-to-end', () => {
  it('shows the real unread count as the badge when nothing has been seen', async () => {
    const expectedUnread = computeUnreadCount(realEntries, null);
    expect(expectedUnread).toBe(realEntries.length);

    render(<WhatsNewBell />);

    // unreadCount is gated behind the hook's mounted flag; wait for the effect.
    await waitFor(() => {
      expect(screen.getByText(String(expectedUnread))).toBeTruthy();
    });
  });

  it('renders the newest entry title, date and tag once the popover opens', async () => {
    render(<WhatsNewBell />);
    const trigger = await screen.findByRole('button');
    fireEvent.click(trigger);

    const newest = realEntries[0];
    const expectedDate = formatRelativeTime(`${newest.date}T00:00:00Z`);

    await waitFor(() => {
      expect(screen.getByText(newest.title)).toBeTruthy();
    });
    expect(screen.getAllByText(expectedDate).length).toBeGreaterThan(0);
    // Seeded newest entry carries the 'new' tag → rendered as the "New" pill.
    expect(newest.tag).toBe('new');
    expect(screen.getAllByText('New').length).toBeGreaterThan(0);
  });

  it('persists last-seen and clears the header badge after opening', async () => {
    const expectedUnread = computeUnreadCount(realEntries, null);
    render(<WhatsNewBell />);
    const trigger = await screen.findByRole('button');

    // Badge present before opening.
    await waitFor(() => {
      expect(screen.getByText(String(expectedUnread))).toBeTruthy();
    });

    fireEvent.click(trigger);

    const latestId = getLatestEntryId(realEntries);
    await waitFor(() => {
      expect(useDashboardPrefsStore.getState().lastSeenChangelogId).toBe(latestId);
    });
    // Header badge is gone: 0 unread against the latest id.
    expect(computeUnreadCount(realEntries, latestId)).toBe(0);
    expect(screen.queryByText(String(expectedUnread))).toBeNull();
  });
});
