// End-to-end bench for FEA-05 (in-app "What's New"). Drives the REAL render
// path with NO mocks: DB-shaped rows → real changelogSchema.parse (the same
// boundary the server reader enforces) → real sort/unread math
// (sortChangelogDesc / computeUnreadCount) → the rendered <WhatsNewBell/> and
// its persisted dashboardPrefs read-state. The write->read hop (recorder ->
// whats_new table -> anon RLS read) is covered separately by
// `bun run whats-new:bench`.
//
// One un-exercised hop, by design: the per-row markdown body renders through
// SafeMarkdownLazy, which is `next/dynamic(..., { ssr: false })`. That does not
// hydrate under happy-dom, so the body text is NOT asserted here — the
// deterministic surface (unread badge, title, timestamp, tag, per-row "new" dot, and
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

import { computeUnreadCount, getLatestEntryId, sortChangelogDesc } from '@/lib/changelog/changelog';
import { changelogSchema } from '@/lib/changelog/schema';
import { useDashboardPrefsStore } from '@/stores/dashboardPrefs';
import { WhatsNewBell } from './WhatsNewBell';

const TAG_LABEL: Record<string, string> = { new: 'New', improved: 'Improved', fixed: 'Fixed' };

// Rows shaped exactly as the header reader's public.whats_new select returns,
// validated through the same boundary schema, then sorted newest-first.
const realEntries = sortChangelogDesc(
  changelogSchema.parse([
    {
      id: '2026-07-20-planner-bulk-actions',
      date: '2026-07-20',
      createdAt: '2026-07-20T15:30:00.000Z',
      title: 'Bulk actions & drag-to-reschedule in the Planner',
      body: 'Select multiple posts to **duplicate, delete, or move** them in one go.',
      tag: 'new',
    },
    {
      id: '2026-07-19-video-thumbnail-frame',
      date: '2026-07-19',
      createdAt: '2026-07-19T15:30:00.000Z',
      title: 'Choose a thumbnail frame for your videos',
      body: 'Scrub any generated video and pick the exact cover frame.',
      tag: 'improved',
    },
    {
      id: '2026-07-18-scheduled-continuum-reports',
      date: '2026-07-18',
      createdAt: '2026-07-18T15:30:00.000Z',
      title: 'Scheduled Continuum Report emails',
      body: 'Set your brand report to arrive automatically on the cadence you choose.',
      tag: 'new',
    },
  ]),
);

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

    render(<WhatsNewBell entries={realEntries} />);

    // unreadCount is gated behind the hook's mounted flag; wait for the effect.
    await waitFor(() => {
      expect(screen.getByText(String(expectedUnread))).toBeTruthy();
    });
  });

  it('renders the newest entry title, timestamp and tag once the popover opens', async () => {
    render(<WhatsNewBell entries={realEntries} />);
    const trigger = await screen.findByRole('button');
    fireEvent.click(trigger);

    const newest = realEntries[0];
    await waitFor(() => {
      expect(screen.getByText(newest.title)).toBeTruthy();
    });
    expect(
      screen.getByText((_content, element) => element?.dateTime === newest.createdAt),
    ).toBeTruthy();
    if (newest.tag) {
      expect(screen.getAllByText(TAG_LABEL[newest.tag]).length).toBeGreaterThan(0);
    }
  });

  it('persists last-seen and clears the header badge after opening', async () => {
    const expectedUnread = computeUnreadCount(realEntries, null);
    render(<WhatsNewBell entries={realEntries} />);
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
