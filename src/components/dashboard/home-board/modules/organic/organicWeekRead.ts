import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';

type OrganicCopy = ReturnType<typeof useTranslations<'organic'>>;

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
export function topPostLine(
  data: Pick<HomeOrganicWeekData, 'topPost'>,
  t?: OrganicCopy,
  locale: UiLocale = 'en',
): string | null {
  const { topPost } = data;
  if (!topPost) return null;
  if (t)
    return t('homeTopPost', {
      reach: formatCount(topPost.reach, locale),
      lift:
        topPost.reachLift === null
          ? ''
          : t('homeUsualLift', {
              ratio: formatDecimal(topPost.reachLift, 1, locale),
            }),
    });
  const reach = `Top post: ${formatCount(topPost.reach, locale)} reach`;
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

function noteOf(
  post: HomeOrganicPublishedPost,
  t?: OrganicCopy,
  locale: UiLocale = 'en',
): string | null {
  const parts = [
    post.isTrial ? (t ? t('homeTrial') : 'Trial reel') : null,
    post.reachCapturedOn
      ? t
        ? t('homeReadDate', {
            date: goalDayLabel(post.reachCapturedOn, locale),
          })
        : `read ${goalDayLabel(post.reachCapturedOn, locale)}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Every post the read returned, highest reach first, the ones not measured yet last. */
export function reachRowsOf(
  data: Pick<HomeOrganicWeekData, 'days'>,
  t?: OrganicCopy,
  locale: UiLocale = 'en',
): OrganicReachRow[] {
  return data.days
    .flatMap((day) => day.published)
    .sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1))
    .map((post) => ({
      post,
      reach:
        post.reach === null
          ? t
            ? t('homeNotMeasured')
            : 'Not measured yet'
          : t
            ? t('homeReach', { reach: formatCount(post.reach, locale) })
            : `${formatCount(post.reach, locale)} reach`,
      lift:
        post.reachLift === null
          ? null
          : t
            ? t('homeUsual', {
                ratio: formatDecimal(post.reachLift, 1, locale),
              })
            : `${lift(post.reachLift)} usual`,
      note: noteOf(post, t, locale),
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
