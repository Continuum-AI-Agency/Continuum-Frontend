import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import en from '../../../messages/common/en.json';
import es from '../../../messages/common/es.json';
import pt from '../../../messages/common/pt-BR.json';
import { createCalendarLocale } from './calendar-locale';

for (const [locale, messages, next, day] of [
  ['en', en, 'Go to the next month', 'Today, Sunday, March 15, 2026, selected'],
  ['pt-BR', pt, 'Ir para o próximo mês', 'Hoje, domingo, 15 de março de 2026, selecionado'],
  ['es', es, 'Ir al mes siguiente', 'Hoy, domingo, 15 de marzo de 2026, seleccionado'],
] as const) {
  describe(`calendar in ${locale}`, () => {
    const t = createTranslator({
      locale,
      messages: { common: messages },
      namespace: 'common',
    });
    const options = createCalendarLocale(locale, t, 'UTC');
    it('announces localized navigation, dates and selection together', () => {
      expect(options.labels.labelNext?.()).toBe(next);
      expect(
        options.labels.labelDayButton?.(new Date('2026-03-15T12:00:00Z'), {
          today: true,
          selected: true,
        }),
      ).toBe(day);
    });
    it('keeps the explicit scheduling timezone at a day boundary', () => {
      const instant = new Date('2026-03-01T00:30:00Z');
      const calendar = createCalendarLocale(locale, t, 'Pacific/Honolulu');
      expect(calendar.formatters.formatDay?.(instant)).toBe('28');
      expect(options.formatters.formatDay?.(instant)).toBe('1');
      expect(instant.toISOString()).toBe('2026-03-01T00:30:00.000Z');
    });
  });
}
