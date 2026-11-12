import type { useTranslations } from 'next-intl';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import type { UiLocale } from '@/i18n/config';
import type { CampaignBudgetShare } from '@/lib/paid-media/scaffoldTree';

/**
 * One ad set's opening budget as the card, the outline, the table and the graph node all
 * say it. Null is not zero: it means Jaina had no measured CPA and build will use the
 * Backend placeholder — a figure nobody derived, so it is named rather than priced.
 */
export const formatDailyBudget = (
  minorUnits: number | null | undefined,
  currency: string | null,
  translate?: ReturnType<typeof useTranslations<'scale'>>,
  locale: UiLocale = 'en',
): string =>
  typeof minorUnits === 'number'
    ? translate
      ? translate('helper_34dd8b60efe4', {
          v0: formatCurrency(minorUnits / 100, currency, locale),
        })
      : `${formatCurrency(minorUnits / 100, currency, locale)}/day`
    : translate
      ? translate('scaffoldDetail_47769b2c83')
      : 'Placeholder budget';

/**
 * A CBO ad set's figure: the fraction first, so it never reads as the ad set's own budget, then
 * the estimated amount — "≈ 1/3 of the campaign budget (CBO) · ≈ $100 USD/day". A lone ad set
 * spends all of it, which is not an estimate, so it drops the "≈".
 */
export const formatCampaignBudgetShare = (
  share: CampaignBudgetShare,
  currency: string | null,
): string => {
  const whole = share.adSetCount <= 1;
  const fraction = whole
    ? 'All of the campaign budget (CBO)'
    : `≈ 1/${share.adSetCount} of the campaign budget (CBO)`;
  if (typeof share.campaignDailyBudgetMinorUnits !== 'number') return fraction;
  const amount = formatDailyBudget(
    share.campaignDailyBudgetMinorUnits / Math.max(share.adSetCount, 1),
    currency,
  );
  return `${fraction} · ${whole ? '' : '≈ '}${amount}`;
};
