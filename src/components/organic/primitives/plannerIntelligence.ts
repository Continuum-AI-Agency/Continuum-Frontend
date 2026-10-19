import { formatDayId, startOfWeek, UNSCHEDULED_DAY_ID } from './calendar-utils';
import type { PlannerPlatform } from './planner-platforms';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCalendarPostedContent,
} from './types';

// The workflow rail's sentence and the attention dock under the grid read ONE classification
// of ONE set of drafts, so the rail cannot say "2 overdue" while the dock lists three.

export type PlannerAttentionGroupKey =
  | 'overdue'
  | 'failed'
  | 'needs-media'
  | 'needs-approval'
  | 'unscheduled';

export type PlannerAttentionItem = { draft: OrganicCalendarDraft; dayId: string };

export type PlannerAttentionGroup = {
  key: PlannerAttentionGroupKey;
  label: string;
  items: PlannerAttentionItem[];
};

const GROUP_ORDER: ReadonlyArray<{ key: PlannerAttentionGroupKey; label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'failed', label: 'Failed' },
  { key: 'needs-media', label: 'Needs media' },
  { key: 'needs-approval', label: 'Needs approval' },
  { key: 'unscheduled', label: 'Unscheduled' },
];

// Formats that cannot go out without a picture or a video. A text Post can, on some platforms.
const MEDIA_FORMATS = new Set(['reel', 'video', 'carousel', 'story']);
// Where a Post with no media is a complete text post; the preview frame draws it as one.
const TEXT_POST_PLATFORMS = new Set(['facebook', 'linkedin']);

export function needsMedia(draft: OrganicCalendarDraft): boolean {
  const format = draft.format.toLowerCase();
  if (
    format === 'post' &&
    draft.platforms.length > 0 &&
    draft.platforms.every((platform) => TEXT_POST_PLATFORMS.has(platform))
  ) {
    return false;
  }
  if (draft.mediaStage) {
    return draft.mediaStage === 'text_only' || draft.mediaStage === 'storyboard_ready';
  }
  return draft.mediaCount === 0 && MEDIA_FORMATS.has(format);
}

// One group per draft, first match wins. A draft with no date cannot be approved and
// scheduled, so an undated draft lands in Unscheduled rather than Needs approval.
function classifyDraft(
  draft: OrganicCalendarDraft,
  dayId: string,
  todayId: string,
): PlannerAttentionGroupKey | null {
  const dated = dayId !== UNSCHEDULED_DAY_ID;
  const waiting = draft.status === 'draft' || draft.status === 'placeholder';
  // Its day has gone and it never went out: the fix is a new date, whatever else is wrong.
  if (dated && dayId < todayId && (waiting || draft.status === 'failed')) return 'overdue';
  if (draft.status === 'failed') return 'failed';
  // Scheduled, published and generating drafts need nothing from the user right now.
  if (!waiting) return null;
  if (needsMedia(draft)) return 'needs-media';
  if (!dated) return 'unscheduled';
  return draft.status === 'draft' ? 'needs-approval' : null;
}

/** Non-empty groups only, in the order the user should work them. */
export function derivePlannerAttention(
  days: readonly OrganicCalendarDay[],
  todayId: string,
): PlannerAttentionGroup[] {
  const byKey = new Map<PlannerAttentionGroupKey, PlannerAttentionItem[]>();
  for (const day of days) {
    for (const draft of day.slots) {
      const key = classifyDraft(draft, day.id, todayId);
      if (!key) continue;
      const items = byKey.get(key) ?? [];
      items.push({ draft, dayId: day.id });
      byKey.set(key, items);
    }
  }
  return GROUP_ORDER.flatMap(({ key, label }) => {
    const items = byKey.get(key);
    return items ? [{ key, label, items }] : [];
  });
}

const GROUP_PHRASE: Record<PlannerAttentionGroupKey, readonly [string, string]> = {
  overdue: ['overdue', 'overdue'],
  failed: ['failed', 'failed'],
  'needs-media': ['needs media', 'need media'],
  'needs-approval': ['needs approval', 'need approval'],
  unscheduled: ['unscheduled', 'unscheduled'],
};

function groupPhrases(groups: readonly PlannerAttentionGroup[]): string[] {
  return groups.map(({ key, items }) => {
    const [one, many] = GROUP_PHRASE[key];
    return `${items.length} ${items.length === 1 ? one : many}`;
  });
}

/** "Needs attention · 2 overdue · 1 needs approval": the dock section's heading. */
export function attentionHeading(groups: readonly PlannerAttentionGroup[]): string {
  return ['Needs attention', ...groupPhrases(groups)].join(' · ');
}

const pluralDays = (count: number) => `${count} open ${count === 1 ? 'day' : 'days'}`;

export function lookaheadHeading(openDays: number): string {
  return `Next 4 weeks · ${pluralDays(openDays)}`;
}

export const PLANNER_HORIZON_DAYS = 28;

/** `count` consecutive day ids starting at (and including) `startDayId`. */
export function plannerHorizon(startDayId: string, count = PLANNER_HORIZON_DAYS): string[] {
  const start = new Date(`${startDayId}T12:00:00`);
  return Array.from({ length: count }, (_, offset) => {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    return formatDayId(day);
  });
}

export type PlannerLookaheadDay = {
  dayId: string;
  /** Drafts and published posts that day, as the week cell shows them. */
  planned: number;
  /** Creatable platforms nothing occupies that day. */
  open: PlannerPlatform[];
  past: boolean;
};

export type PlannerDock = {
  /** The attention groups across every loaded draft. */
  attention: PlannerAttentionGroup[];
  /** Four Monday-first weeks from the current one, 28 days, as the week grid lays them out. */
  lookahead: PlannerLookaheadDay[];
  /** Days from today on with nothing planned at all. */
  openDays: number;
  /** The workflow rail's sentence, built from `attention` and `openDays`. */
  insight: string;
};

function railSentence(
  groups: readonly PlannerAttentionGroup[],
  openDays: number,
  hasDrafts: boolean,
): string {
  if (groups.length > 0) return groupPhrases(groups).join(' · ');
  if (!hasDrafts) return 'Start with 3–5 posts across at least two days to shape a useful week.';
  return openDays > 0
    ? `Nothing needs attention · ${pluralDays(openDays)} in the next 4 weeks`
    : 'All set for the next 4 weeks';
}

/**
 * What the dock under the grid offers, and what the rail above it says: the drafts that need
 * the user, and a four-week lookahead of what is planned and which platforms each day still
 * has open.
 *
 * Attention reads the lensed `attentionDays` the grid shows; the lookahead reads every
 * loaded draft, because a draft hidden by a lens still occupies its day.
 */
export function derivePlannerDock({
  todayId,
  attentionDays,
  allDays,
  postedContent,
  platforms,
}: {
  /** The brand's today. */
  todayId: string;
  attentionDays: readonly OrganicCalendarDay[];
  allDays: readonly OrganicCalendarDay[];
  postedContent: readonly OrganicCalendarPostedContent[];
  /** The rows a cell "+" creates on: only these are ever offered as open. */
  platforms: readonly PlannerPlatform[];
}): PlannerDock {
  const attention = derivePlannerAttention(attentionDays, todayId);

  const planned = new Map<string, number>();
  const taken = new Map<string, Set<string>>();
  const take = (dayId: string, platform: string) => {
    planned.set(dayId, (planned.get(dayId) ?? 0) + 1);
    const platformsTaken = taken.get(dayId) ?? new Set<string>();
    platformsTaken.add(platform);
    taken.set(dayId, platformsTaken);
  };
  let hasDrafts = false;
  for (const day of allDays) {
    for (const draft of day.slots) {
      hasDrafts = true;
      // The week grid files a platformless draft under Instagram, so it fills that slot.
      const [first = 'instagram', ...rest] = draft.platforms;
      take(day.id, first);
      for (const platform of rest) taken.get(day.id)?.add(platform);
    }
  }
  for (const post of postedContent) take(post.dayId, post.platform);

  const creatable = platforms.filter((platform) => platform.canCreate && !platform.comingSoon);
  const weekStartId = formatDayId(startOfWeek(new Date(`${todayId}T12:00:00`)));
  const lookahead = plannerHorizon(weekStartId).map((dayId) => ({
    dayId,
    planned: planned.get(dayId) ?? 0,
    open: creatable.filter((platform) => !taken.get(dayId)?.has(platform.key)),
    past: dayId < todayId,
  }));
  const openDays = lookahead.filter((day) => !day.past && day.planned === 0).length;

  return {
    attention,
    lookahead,
    openDays,
    insight: railSentence(attention, openDays, hasDrafts),
  };
}
