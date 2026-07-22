// Authored, user-facing changelog for the in-app "What's New" popover. Newest
// first. Validation (Zod) happens in src/lib/changelog/changelog.ts — this file
// stays a plain data array so writing an entry is just editing markdown. Give
// every entry a stable slug id ("YYYY-MM-DD-topic"): read-state is keyed on it,
// so ids must never be reused for different content.

export const CHANGELOG_RAW = [
  {
    id: '2026-07-20-planner-bulk-actions',
    date: '2026-07-20',
    title: 'Bulk actions & drag-to-reschedule in the Planner',
    body: 'Select multiple posts to **duplicate, delete, or move** them in one go, and drag any card to a new day to reschedule it. Same-day posts now stack in a scrollable list with quick time presets.',
    tag: 'new',
  },
  {
    id: '2026-07-20-content-agent-retry',
    date: '2026-07-20',
    title: 'One-click retry & view-draft on the content agent',
    body: 'When a generation step stumbles, hit **Retry** to re-run just that step — no restarting the whole session. A **View draft** shortcut jumps you straight to the result.',
    tag: 'improved',
  },
  {
    id: '2026-07-19-video-thumbnail-frame',
    date: '2026-07-19',
    title: 'Choose a thumbnail frame for your videos',
    body: 'Scrub any generated video and pick the exact frame you want as its cover image before publishing.',
    tag: 'new',
  },
  {
    id: '2026-07-18-scheduled-continuum-reports',
    date: '2026-07-18',
    title: 'Scheduled Continuum Report emails',
    body: 'Set your brand report to arrive automatically on the cadence you choose — daily, weekly, or monthly — delivered straight to your inbox.',
    tag: 'new',
  },
];
