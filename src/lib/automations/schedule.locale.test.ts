import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import en from '../../../messages/automations/en.json';
import es from '../../../messages/automations/es.json';
import pt from '../../../messages/automations/pt-BR.json';
import {
  describeSchedule,
  formatInTimezone,
  nextRunTimes,
  scheduleToCronExpression,
} from './schedule';

describe('localized scheduling display', () => {
  it('changes weekday and sentence language while preserving clock, timezone and cron', () => {
    const schedule = {
      kind: 'weekly' as const,
      dayOfWeek: 1,
      time: '09:30',
      timezone: 'America/Sao_Paulo',
    };
    const original = JSON.stringify(schedule);
    for (const [locale, messages, weekday] of [
      ['en', en, 'Monday'],
      ['pt-BR', pt, 'segunda-feira'],
      ['es', es, 'lunes'],
    ] as const) {
      const t = createTranslator({
        locale,
        messages: { automations: messages },
        namespace: 'automations',
      });
      const description = describeSchedule(schedule, locale, t);
      expect(description).toContain(weekday);
      expect(description).toContain(schedule.timezone);
      expect(scheduleToCronExpression(schedule)).toBe('30 9 * * 1');
    }
    expect(JSON.stringify(schedule)).toBe(original);
  });
  it('formats an instant in the scheduling timezone independently of display language', () => {
    const instant = new Date('2026-11-11T12:30:00Z');
    for (const locale of ['en', 'pt-BR', 'es']) {
      const expected = new Intl.DateTimeFormat(locale, {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(instant);
      expect(formatInTimezone(instant, 'America/Sao_Paulo', locale)).toBe(expected);
    }
    expect(
      nextRunTimes({ kind: 'daily', time: '09:30', timezone: 'America/Sao_Paulo' }, 1),
    ).toHaveLength(1);
  });
});
