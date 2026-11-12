import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { formatScheduleWithZone } from '@/lib/organic/scheduleLabel';
import { plainBatchReason } from '@/lib/organic-agent/headlessBatch';
import { organicPostSchema } from '@/lib/schemas/organicMetrics';
import en from '../../../messages/organic/en.json';
import es from '../../../messages/organic/es.json';
import pt from '../../../messages/organic/pt-BR.json';
import { getCardMetricSet } from './cards/cardMetricSet';
import { formatMediaReadyToast } from './hooks/mediaToastCopy';
import { formatWatchTime } from './organic-metrics-utils';
import {
  formatWallClockLabel,
  localizeCalendarDay,
  makeCalendarDay,
} from './primitives/calendar-utils';
import { createRuleFormSchema, emptyRuleForm } from './rules/ruleFormSchema';

const catalogs = { en, 'pt-BR': pt, es };
const locales: UiLocale[] = ['en', 'pt-BR', 'es'];
const post = organicPostSchema.parse({
  id: 'user-post',
  title: 'Minha criação / Mi creación',
  mediaType: 'VIDEO',
  metrics: { views: 12500, reach: 1200, hookRate: 75.25, reelsAvgWatchTime: 1250 },
});

for (const locale of locales) {
  describe(`Organic presentation (${locale})`, () => {
    const translate = createTranslator({
      locale,
      namespace: 'organic',
      messages: { organic: catalogs[locale] },
    });

    it('localizes metrics without changing identity, values, or source content', () => {
      const original = getCardMetricSet(post);
      const localized = getCardMetricSet(post, translate);
      expect(localized.map(({ label: _label, tooltip: _tooltip, ...metric }) => metric)).toEqual(
        original.map(({ label: _label, tooltip: _tooltip, ...metric }) => metric),
      );
      expect(localized[0]?.label).toBe(
        locale === 'en' ? 'Views' : locale === 'pt-BR' ? 'Visualizações' : 'Visualizaciones',
      );
      expect(post.title).toBe('Minha criação / Mi creación');
    });

    it('localizes validation while preserving authored replies and schedule values', () => {
      const values = {
        ...emptyRuleForm(),
        replyMessage: 'Texto del usuario',
        activeFrom: '2026-11-12T10:00',
        activeUntil: '2026-11-11T10:00',
      };
      const parsed = createRuleFormSchema(translate).safeParse(values);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(
          parsed.error.issues.some(
            (issue) =>
              issue.path[0] === 'activeWindow' && issue.message === translate('ruleDateOrder'),
          ),
        ).toBe(true);
        expect(
          parsed.error.issues.some(
            (issue) =>
              issue.path[0] === 'keywords' && issue.message === translate('ruleKeywordRequired'),
          ),
        ).toBe(true);
      }
      expect(values.replyMessage).toBe('Texto del usuario');
      expect(values.activeFrom).toBe('2026-11-12T10:00');
    });

    it('uses count agreement and hides internal failure details', () => {
      const toast = formatMediaReadyToast(1, 1, translate);
      expect(toast.description).toContain(
        locale === 'en'
          ? '1 draft has'
          : locale === 'pt-BR'
            ? '1 rascunho está'
            : '1 borrador tiene',
      );
      expect(toast.description).toContain(
        locale === 'en' ? '1 failed.' : locale === 'pt-BR' ? '1 falhou.' : '1 falló.',
      );
      expect(plainBatchReason('failed', 'run_failed:provider_private_diagnostic', translate)).toBe(
        translate('batchReasonRunFailed'),
      );
      expect(plainBatchReason('failed', 'unknown_internal_error', translate)).toBe(
        translate('batchReasonFailed'),
      );
    });

    it('keeps date IDs, wall clocks, and scheduling timezones stable', () => {
      const original = makeCalendarDay('2026-11-11');
      const localized = localizeCalendarDay(original, locale, 'unscheduled');
      expect(localized.id).toBe('2026-11-11');
      expect(localized.slots).toBe(original.slots);
      expect(localized.suggestedTimes).toBe(original.suggestedTimes);
      expect(formatWallClockLabel('1:05 PM', locale)).toBe(locale === 'en' ? '1:05 PM' : '13:05');
      const scheduled = formatScheduleWithZone(
        '2026-11-10',
        '9:00 AM',
        'America/Los_Angeles',
        locale,
      );
      expect(scheduled).toContain(locale === 'en' ? '9:00 AM PST' : '9:00');
      expect(original.label).toBe('Wed');
      expect(formatWatchTime(1250, locale)).toContain(locale === 'en' ? '1.3' : '1,3');
    });
  });
}
