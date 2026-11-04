// What the Organic week read (R4) adds to H11: each published post's measured reach, and the top
// post against its account's usual. The tile's counts stay the calendar's. A post the read has not
// measured says so, and a read of any other week is not used.

import type { HomeOrganicPublishedPost, HomeOrganicWeekData } from '@continuum/contracts';
import { formatDayId } from '@/components/organic/primitives/calendar-utils';
import { formatCount } from '@/lib/home/format';
import { goalDayLabel } from '../goals/goalModel';
import { organicWeekStart } from './organicWeekModel';

const lift = (value: number) => `${value.toFixed(1)}×`;

/** "Top post: 12.3K reach · 2.1× its account's usual"; null with no measured post. */
export function topPostLine(data: Pick<HomeOrganicWeekData, 'topPost'>): string | null {
  const { topPost } = data;
  if (!topPost) return null;
  const reach = `Top post: ${formatCount(topPost.reach)} reach`;
  return topPost.reachLift === null
    ? reach
    : `${reach} · ${lift(topPost.reachLift)} its account’s usual`;
}

export type OrganicReachRow = {
  post: HomeOrganicPublishedPost;
  reach: string;
  lift: string | null;
  note: string | null;
};

function noteOf(post: HomeOrganicPublishedPost): string | null {
  const parts = [
    post.isTrial ? 'Trial reel' : null,
    post.reachCapturedOn ? `read ${goalDayLabel(post.reachCapturedOn)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Every post the read returned, highest reach first, the ones not measured yet last. */
export function reachRowsOf(data: Pick<HomeOrganicWeekData, 'days'>): OrganicReachRow[] {
  return data.days
    .flatMap((day) => day.published)
    .sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1))
    .map((post) => ({
      post,
      reach: post.reach === null ? 'Not measured yet' : `${formatCount(post.reach)} reach`,
      lift: post.reachLift === null ? null : `${lift(post.reachLift)} usual`,
      note: noteOf(post),
    }));
}

/** The read answers with the week it actually read, so it is only used for the one asked for. */
export function organicWeekReadFor(
  data: HomeOrganicWeekData | null,
  weekStart: string,
): HomeOrganicWeekData | null {
  return data?.week.since === weekStart ? data : null;
}

export function organicWeekQuery(
  now: Date,
  timeZone: string,
): { weekStart: string; timeZone: string } {
  return { weekStart: formatDayId(organicWeekStart(now)), timeZone };
}
