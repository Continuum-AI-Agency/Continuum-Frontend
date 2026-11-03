// The organic week the Home shows: seven day columns of what went out, what is scheduled and
// what waits for approval, built from the two reads the Organic calendar already makes.
//
// The week is Monday to Sunday of the BROWSER's local today — the same week the Organic calendar
// opens on (calendar-utils startOfWeek). Each item lands on the day the calendar itself gives
// it: a published post on its day in the brand's time zone (the calendar-posts route resolves
// it), a draft on its stored day (slot_data / content_json dayId, else scheduled_date read in
// the draft's own stored zone). So the Home and the calendar never disagree about a day.
//
// Counting: a published post is one per platform (organic_published_posts is per platform), a
// scheduled row is one per platform too, so "posts this week" is publications. A draft waiting
// for approval counts once per CARD — one post on three platforms is one approval.

import {
  buildWeekDays,
  formatDayId,
  startOfWeek,
} from '@/components/organic/primitives/calendar-utils';
import type {
  OrganicCalendarDraft,
  OrganicCalendarPostedContent,
} from '@/components/organic/primitives/types';
import type { ModuleFrameState } from '@/components/paid-media/optimizer/sections/board/ModuleFrame';
import {
  collapseDraftGroups,
  mapPersistedRowToCalendarEntry,
  type PersistedOrganicDraftRow,
} from '@/lib/organic/calendar-draft-persistence';

export type WaitingDraft = {
  card: OrganicCalendarDraft;
  /** Approved on the server but never scheduled: approving it again schedules it. */
  approvedNotScheduled: boolean;
};

export type OrganicWeekDay = {
  dayId: string;
  /** "Mon" */
  label: string;
  /** "Nov 3" */
  dateLabel: string;
  isToday: boolean;
  published: OrganicCalendarPostedContent[];
  scheduled: OrganicCalendarDraft[];
  waiting: WaitingDraft[];
};

export type OrganicWeek = {
  days: OrganicWeekDay[];
  /** Published posts this week, one per platform. */
  published: number;
  /** Scheduled rows this week, one per platform. */
  scheduled: number;
  /** Cards waiting for approval this week. */
  waiting: number;
  /** The headline: published + scheduled. */
  postsThisWeek: number;
  isEmpty: boolean;
};

export function organicWeekStart(now: Date): Date {
  return startOfWeek(now);
}

const WAITING_STATUSES = new Set(['draft', 'approved']);

function rawStatusOf(row: PersistedOrganicDraftRow): string {
  return typeof row.status === 'string' ? row.status : 'draft';
}

export function buildOrganicWeek(input: {
  now: Date;
  posts: OrganicCalendarPostedContent[];
  drafts: PersistedOrganicDraftRow[];
}): OrganicWeek {
  const todayId = formatDayId(input.now);
  // The calendar's own scaffold: a row whose day is not one of these seven maps to null.
  const scaffold = buildWeekDays(organicWeekStart(input.now));
  const days: OrganicWeekDay[] = scaffold.map((day) => ({
    dayId: day.id,
    label: day.label,
    dateLabel: day.dateLabel,
    isToday: day.id === todayId,
    published: [],
    scheduled: [],
    waiting: [],
  }));
  const dayById = new Map(days.map((day) => [day.dayId, day]));

  for (const post of input.posts) dayById.get(post.dayId)?.published.push(post);

  const rawStatusById = new Map(input.drafts.map((row) => [row.id, rawStatusOf(row)]));
  const entries = input.drafts.flatMap((row) => {
    const entry = mapPersistedRowToCalendarEntry(row, scaffold);
    return entry ? [entry] : [];
  });

  let scheduled = 0;
  let waiting = 0;
  for (const { dayId, draft } of collapseDraftGroups(entries)) {
    const day = dayById.get(dayId);
    if (!day) continue;
    const statuses = (draft.groupMembers ?? []).map(
      (member) => rawStatusById.get(member.backendDraftId ?? '') ?? 'draft',
    );
    const scheduledRows = statuses.filter((status) => status === 'scheduled').length;
    if (scheduledRows > 0) {
      day.scheduled.push(draft);
      scheduled += scheduledRows;
    } else if (statuses.some((status) => WAITING_STATUSES.has(status))) {
      day.waiting.push({ card: draft, approvedNotScheduled: !statuses.includes('draft') });
      waiting += 1;
    }
  }

  const published = days.reduce((sum, day) => sum + day.published.length, 0);
  return {
    days,
    published,
    scheduled,
    waiting,
    postsThisWeek: published + scheduled,
    isEmpty: published + scheduled + waiting === 0,
  };
}

export const ORGANIC_NO_ACCOUNT =
  'No organic account is connected — connect Instagram or Facebook in Integrations.';
export const ORGANIC_EMPTY_WEEK =
  'Nothing published, scheduled or drafted this week — plan posts in the Organic calendar.';

export type OrganicTileView = { state: ModuleFrameState; missing: string | null };

export function organicTileView(input: {
  hasAccounts: boolean;
  loading: boolean;
  failed: boolean;
  week: OrganicWeek | null;
}): OrganicTileView {
  if (!input.hasAccounts) return { state: 'missing', missing: ORGANIC_NO_ACCOUNT };
  if (input.failed) return { state: 'error', missing: null };
  if (input.loading || !input.week) return { state: 'loading', missing: null };
  if (input.week.isEmpty) return { state: 'missing', missing: ORGANIC_EMPTY_WEEK };
  return { state: 'ready', missing: null };
}
