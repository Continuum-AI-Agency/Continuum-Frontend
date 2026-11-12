import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type StatusCopy = ReturnType<typeof useTranslations<'scale'>>;

// What the Google tab says FIRST when Google shows no ad in the whole account: suspended or not
// delivering, since when, and where it is fixed (Ramiro's small-defaults decision, 2026-10-31).
//
// The fact is the engine's: G12's account card fires only when every campaign that should serve
// has shown nothing for days, and quotes Google's own reasons. Before this, that card was the
// only place the fact lived, and it rendered as a "Low" card near the bottom of the tab, under
// a headline still reading the last delivering week (PP-DT-B-suspended-account-buried-as-low-
// card). A single dark campaign is that campaign's card, never the account's status.

import type { AccountCandidate, PlatformCard } from '@continuum/contracts';
import { formatCurrency } from '../../format';
import {
  googleDeliveryHref,
  googleReasonInWords,
  platformCardOf,
} from '../platformCards/platformCardModel';
import { windowRangeLabel } from './googleAdsOverviewModel';

type DeliveryCard = Extract<PlatformCard, { variant: 'google_delivery_issue' }>;

export type GoogleDeliveryStatus = {
  /** suspended: Google itself suspended serving (billing, policy, verification). */
  tone: 'suspended' | 'not_delivering';
  title: string;
  detail: string;
  /** Where a person fixes it: the policy manager when ads were refused, else the campaigns. */
  href: string;
};

const SUSPENDED = 'SERVING_STATUS_SUSPENDED';

/** The account-wide delivery card among the tab's cards, if Google shows no ad anywhere. */
export function accountDeliveryCardOf(cards: readonly AccountCandidate[]): DeliveryCard | null {
  for (const candidate of cards) {
    const card = platformCardOf(candidate);
    if (card?.variant === 'google_delivery_issue' && card.account_wide) return card;
  }
  return null;
}

function daysLabel(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** "Oct 26" — the day as the tab names every other day. */
function dayLabel(day: string): string {
  return windowRangeLabel(day, day).split(' – ')[0] ?? day;
}

export function googleDeliveryStatusOf(
  cards: readonly AccountCandidate[],
  t?: StatusCopy,
  locale: UiLocale = 'en',
): GoogleDeliveryStatus | null {
  const card = accountDeliveryCardOf(cards);
  if (!card) return null;
  const suspended = card.reasons.includes(SUSPENDED);
  if (t) {
    const when = card.dark_since
      ? t('googleStatusSince', {
          date: windowRangeLabel(card.dark_since, card.dark_since, locale),
          count: card.dark_days,
        })
      : t('googleStatusDays', { count: card.dark_days });
    const budget =
      card.budget_per_day != null
        ? t('googleStatusBudget', {
            amount: formatCurrency(card.budget_per_day, card.currency, locale),
          })
        : '';
    const codes = suspended ? card.reasons.filter((code) => code !== SUSPENDED) : card.reasons;
    const said = codes.length
      ? t(suspended ? 'googleStatusOther' : 'googleStatusReasons', {
          reasons: codes.map((code) => googleReasonInWords(code, t)).join('; '),
        })
      : '';
    return {
      tone: suspended ? 'suspended' : 'not_delivering',
      title: t(suspended ? 'googleStatusSuspended' : 'googleStatusNotServing'),
      detail:
        when + budget + '.' + said + t(suspended ? 'googleStatusSuspendedFix' : 'googleStatusFix'),
      href: googleDeliveryHref(card.disapproved_ads),
    };
  }
  const when = card.dark_since
    ? `No ad shown since ${dayLabel(card.dark_since)} (${daysLabel(card.dark_days)})`
    : `No ad shown for ${daysLabel(card.dark_days)}`;
  const budget =
    card.budget_per_day != null
      ? `, with ${formatCurrency(card.budget_per_day, card.currency)}/day of budget waiting`
      : '';
  const otherReasons = card.reasons.filter((reason) => reason !== SUSPENDED);
  const said = suspended
    ? otherReasons.length > 0
      ? ` Google also reports: ${otherReasons.map((code) => googleReasonInWords(code)).join('; ')}.`
      : ''
    : ` Google says: ${card.reasons.map((code) => googleReasonInWords(code)).join('; ')}.`;
  const fix = suspended
    ? ' Nothing here can change it: check billing and the account status in Google Ads.'
    : ' Fix it in Google Ads; no budget move here changes it.';
  return {
    tone: suspended ? 'suspended' : 'not_delivering',
    title: suspended
      ? 'Google suspended this account’s campaigns'
      : 'Google is not showing this account’s ads',
    detail: `${when}${budget}.${said}${fix}`,
    href: googleDeliveryHref(card.disapproved_ads),
  };
}
