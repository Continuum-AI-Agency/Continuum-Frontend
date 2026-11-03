// Pink Elephant's organic week as prod held it on Tuesday 2026-11-03: two posts out on
// Instagram and LinkedIn that day, a calendar of drafts across the week, some approved and not
// yet scheduled. Rows are shaped like GET /api/organic/calendar/drafts and the published posts
// like POST /api/organic/calendar-posts; titles are shortened.
import type { OrganicCalendarPostedContent } from '@/components/organic/primitives/types';
import type { PersistedOrganicDraftRow } from '@/lib/organic/calendar-draft-persistence';

/** Tuesday 2026-11-03, 6 PM in whatever zone the test runs in; its week is Nov 2 to Nov 8. */
export const NOW = new Date(2026, 10, 3, 18, 0);

const post = (
  id: string,
  platform: OrganicCalendarPostedContent['platform'],
  dayId: string,
  title: string,
): OrganicCalendarPostedContent => ({
  id,
  source: 'published_posts',
  platform,
  timestamp: `${dayId}T19:46:17.556Z`,
  dayId,
  timeLabel: '1:46 PM',
  title,
});

export const POSTS: OrganicCalendarPostedContent[] = [
  post('p-ig', 'instagram', '2026-11-03', 'Pink Certification | Fundamentos de Ciberseguridad'),
  post('p-li', 'linkedin', '2026-11-03', 'Pink Certification | Fundamentos de Ciberseguridad'),
];

const row = (
  id: string,
  status: string,
  platform: string,
  slot: Record<string, unknown>,
  extra: Partial<PersistedOrganicDraftRow> = {},
): PersistedOrganicDraftRow => ({
  id,
  status,
  platform,
  scheduled_date: null,
  platform_account_id: 'acct',
  slot_data: { title: `Post ${id}`, ...slot },
  ...extra,
});

export const DRAFT_ROWS: PersistedOrganicDraftRow[] = [
  // One post on two platforms, waiting for approval: one card.
  row('d1', 'draft', 'instagram', { dayId: '2026-11-04' }, { group_id: 'g1' }),
  row('d2', 'draft', 'facebook', { dayId: '2026-11-04' }, { group_id: 'g1' }),
  // Approved, never scheduled: still waits, and says so.
  row('d3', 'approved', 'facebook', { dayId: '2026-11-03' }),
  // Scheduled: one single post and one post on two platforms.
  row('d4', 'scheduled', 'instagram', { dayId: '2026-11-05' }),
  row('d5', 'scheduled', 'linkedin', { dayId: '2026-11-05' }, { group_id: 'g2' }),
  row('d6', 'scheduled', 'instagram', { dayId: '2026-11-05' }, { group_id: 'g2' }),
  // Already out: counted from the published posts, never twice.
  row('d7', 'published', 'linkedin', { dayId: '2026-11-03' }),
  // Last week, and no day at all: not this week.
  row('d8', 'draft', 'instagram', { dayId: '2026-10-27' }),
  row('d9', 'draft', 'instagram', {}),
  // A placeholder is not a post.
  row('d10', 'placeholder', 'instagram', { dayId: '2026-11-06' }),
  // Stored as an instant in the brand's zone: Sunday night in Mexico City is this week…
  row(
    'd11',
    'scheduled',
    'instagram',
    { timeZone: 'America/Mexico_City' },
    { scheduled_date: '2026-11-09T04:30:00+00:00' },
  ),
  // …and Monday night there is next week, whatever zone the browser is in.
  row(
    'd12',
    'scheduled',
    'instagram',
    { timeZone: 'America/Mexico_City' },
    { scheduled_date: '2026-11-10T03:00:00+00:00' },
  ),
];
