import { describe, expect, test } from 'bun:test';
import type { AutomationCapabilitiesResponse, AutomationRun } from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import { createBuilderFormSchema } from '@/components/automations/AutomationBuilder/builderFormSchema';
import {
  automationEndpointCreationError,
  errorMessage,
} from '@/components/automations/workspace/AutomationWorkspacePanels';
import { automationControlLabel } from '@/components/automations/workspace/automationControlLabels';
import {
  describeAutomationRun,
  formatAutomationRunDuration,
  formatAutomationRunTime,
} from '@/components/automations/workspace/runs/runPresentation';
import { workflowConnectionMessage } from '@/components/automations/workspace/workflowCanvasModel';
import { localizeAutomationsCopy } from '@/i18n/automationsCopy';
import type { UiLocale } from '@/i18n/config';
import { LocalizedUiError } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';
import en from '../../../messages/automations/en.json';
import es from '../../../messages/automations/es.json';
import pt from '../../../messages/automations/pt-BR.json';
import { buildAutomationSourceOptions } from './source-options';
import { automationTemplateDisplay } from './template-display';
import { formatAutomationWallClock } from './wall-clock';

const run: AutomationRun = {
  runId: 'run-1',
  automationId: 'automation-1',
  brandId: 'brand-1',
  trigger: 'schedule',
  status: 'completed',
  executionMode: 'production',
  workflowVersionId: null,
  scheduledFor: '2026-07-28T09:00:00.000Z',
  attempts: 1,
  emailStatus: 'sent',
  enqueuedAt: '2026-07-28T09:00:00.000Z',
  startedAt: '2026-07-28T09:00:00.000Z',
  completedAt: '2026-07-28T09:02:05.000Z',
};
const locales: [UiLocale, typeof en][] = [
  ['en', en],
  ['pt-BR', pt],
  ['es', es],
];
for (const [locale, messages] of locales) {
  const t = createTranslator({
    locale,
    namespace: 'automations',
    messages: { automations: messages },
  });
  describe(`Automations presentation ${locale}`, () => {
    test('localizes source capability chrome while preserving server codes, availability and diagnostics', () => {
      const capabilities: AutomationCapabilitiesResponse = {
        generatedAt: '2026-07-29T00:00:00.000Z',
        mcpReadTools: [],
        sources: [
          {
            source: 'brand_knowledge',
            lifecycle: 'production',
            availability: 'unavailable',
            reason: 'private provider diagnostic',
          },
          {
            source: 'unknown_server_code',
            lifecycle: 'production',
            availability: 'ready',
            reason: null,
          },
        ],
      };
      const before = structuredClone(capabilities);
      const options = buildAutomationSourceOptions({
        capabilities,
        selected: 'stored_old_code',
        translate: t,
      });
      expect(options.map((option) => option.value)).toEqual([
        'brand_knowledge',
        'unknown_server_code',
        'stored_old_code',
      ]);
      expect(options[0]?.label).toBe(localizeAutomationsCopy('Brand knowledge', t));
      expect(options[0]?.reason).not.toContain('private provider diagnostic');
      expect(options[1]?.label).toBe('unknown_server_code');
      expect(options[2]?.label).toContain('stored_old_code');
      expect(options[2]?.disabled).toBe(false);
      expect(automationControlLabel('campaign', t)).not.toBe(locale === 'en' ? '' : 'Campaign');
      expect(automationControlLabel('future_tool.id', t)).toBe('future_tool.id');
      expect(capabilities).toEqual(before);
    });
    test('translates canonical template descriptors without translating saved/custom names or prompts', () => {
      const template = {
        id: 'performance-pulse',
        name: 'Paid + organic performance pulse',
        description: 'Parallel paid and organic analysis synthesized into one stakeholder report.',
      };
      const result = automationTemplateDisplay(template, t);
      expect(result.name).toBe(
        locale === 'en'
          ? template.name
          : locale === 'pt-BR'
            ? 'Panorama de desempenho pago e orgânico'
            : 'Panorama del rendimiento de pago y orgánico',
      );
      expect(template.name).toBe('Paid + organic performance pulse');
      const custom = {
        ...template,
        name: 'Customer name',
        description: 'Generated report language',
      };
      expect(automationTemplateDisplay(custom, t)).toEqual({
        name: custom.name,
        description: custom.description,
      });
      expect(automationTemplateDisplay({ ...template, id: 'custom' }, t)).toEqual({
        name: template.name,
        description: template.description,
      });
    });
    test('uses locale-native ambient time and duration with stable timestamps and trigger IDs', () => {
      const before = structuredClone(run);
      expect(formatAutomationRunTime(run.enqueuedAt, locale, t)).toBe(
        new Date(run.enqueuedAt).toLocaleString(locale),
      );
      expect(describeAutomationRun(run, locale, t)).toContain(
        localizeAutomationsCopy('Scheduled', t),
      );
      if (locale !== 'en') {
        const unit = (value: number, name: 'minute' | 'second') =>
          new Intl.NumberFormat(locale, {
            style: 'unit',
            unit: name,
            unitDisplay: 'narrow',
            maximumFractionDigits: 0,
          }).format(value);
        expect(formatAutomationRunDuration(run, locale)).toBe(
          `${unit(2, 'minute')} ${unit(5, 'second')}`,
        );
      }
      const scheduled = { time: '21:07', timezone: 'America/Sao_Paulo' };
      expect(formatAutomationWallClock(scheduled.time, locale)).toBe(
        new Intl.DateTimeFormat(locale, {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'UTC',
        }).format(new Date('2024-01-01T21:07:00Z')),
      );
      expect(scheduled).toEqual({ time: '21:07', timezone: 'America/Sao_Paulo' });
      expect(t('m_9ef63f2b4d', { completed: 1, total: 1, trigger: 'none', name: '' })).toContain(
        locale === 'en' ? '1/1 node.' : locale === 'pt-BR' ? '1/1 nó.' : '1/1 nodo.',
      );
      expect(
        t('m_9ef63f2b4d', {
          completed: 2,
          total: 2,
          trigger: 'selected',
          name: 'Customer trigger',
        }),
      ).toContain('Customer trigger');
      expect(run).toEqual(before);
    });
    test('keeps unknown provider failures safe and translates stable endpoint and connection guidance', () => {
      const error = new ApiError('private provider diagnostic', 404, 'draft_not_found');
      expect(automationEndpointCreationError(error, t)).toBe(
        localizeAutomationsCopy(
          'The draft moved on before this request landed. Wait for “Draft saved”, then create the endpoint again.',
          t,
        ),
      );
      expect(automationEndpointCreationError(new Error('private provider diagnostic'), t)).toBe(
        localizeAutomationsCopy('Could not create this endpoint.', t),
      );
      expect(error.message).toBe('private provider diagnostic');
      expect(errorMessage(new LocalizedUiError('Already translated'), 'Fallback')).toBe(
        'Already translated',
      );
      expect(
        workflowConnectionMessage(
          {
            valid: false,
            code: 'cycle',
            reason: 'This connection would create a cycle. Use repeatUntil for bounded repetition.',
          },
          t,
        ),
      ).toContain('repeatUntil');
      const schema = createBuilderFormSchema((source) => localizeAutomationsCopy(source, t));
      const result = schema.safeParse({
        name: 'Stored name',
        prompt: 'Stored prompt',
        scheduleKind: 'daily',
        time: '99:99',
        dayOfWeek: 1,
        dayOfMonth: 1,
        timezone: 'America/Sao_Paulo',
        cronExpr: '',
        memberUserIds: ['user-1'],
        externalEmails: [],
        enabled: true,
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues.find((issue) => issue.path[0] === 'time')?.message).toBe(
          localizeAutomationsCopy('Enter a time in HH:MM format (24-hour clock).', t),
        );
    });
  });
}
