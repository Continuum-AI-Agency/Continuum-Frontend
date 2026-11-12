import type { useTranslations } from 'next-intl';
import type { Formatters, Labels, Modifiers } from 'react-day-picker';
/** Native Intl uses the calendar's original timezone and does not import locale dictionaries. */
export function createCalendarLocale(
  locale: string,
  t: ReturnType<typeof useTranslations<'common'>>,
  timeZone?: string,
): { formatters: Partial<Formatters>; labels: Partial<Labels> } {
  const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
  const caption = (date: Date) => format(date, { month: 'long', year: 'numeric' });
  const dayLabel = (date: Date, modifiers?: Modifiers) =>
    t('m_580adbde5b', {
      date: format(date, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      today: modifiers?.today ? 'yes' : 'no',
      selected: modifiers?.selected ? 'yes' : 'no',
    });
  return {
    formatters: {
      formatCaption: caption,
      formatMonthCaption: caption,
      formatDay: (date) => format(date, { day: 'numeric' }),
      formatMonthDropdown: (date) => format(date, { month: 'long' }),
      formatWeekdayName: (date) => format(date, { weekday: 'short' }),
      formatWeekNumber: (number) => new Intl.NumberFormat(locale).format(number),
      formatWeekNumberHeader: () => t('m_904d9d11da'),
      formatYearDropdown: (date) => format(date, { year: 'numeric' }),
      formatYearCaption: (date) => format(date, { year: 'numeric' }),
    },
    labels: {
      labelNav: () => t('m_7ba43cd2fa'),
      labelGrid: caption,
      labelGridcell: dayLabel,
      labelDayButton: dayLabel,
      labelDay: dayLabel,
      labelNext: () => t('m_786ac3c435'),
      labelPrevious: () => t('m_bc60afeffc'),
      labelMonthDropdown: () => t('m_28f56ff0dd'),
      labelYearDropdown: () => t('m_28e84a8797'),
      labelWeekday: (date) => format(date, { weekday: 'long' }),
      labelWeekNumber: (number) => t('m_8fe5cb67c3', { number }),
      labelWeekNumberHeader: () => t('m_904d9d11da'),
    },
  };
}
