import type { useTranslations } from 'next-intl';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import type { UiLocale } from '@/i18n/config';
import { localizeScaffoldCopy } from './scaffoldPlanView';

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
      ? translate('helper_34dd8b60efe4', { v0: formatCurrency(minorUnits / 100, currency, locale) })
      : `${formatCurrency(minorUnits / 100, currency, locale)}/day`
    : translate
      ? localizeScaffoldCopy('Placeholder budget', translate)
      : 'Placeholder budget';
