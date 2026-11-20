import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import es from '../../../messages/forge/es.json';
import pt from '../../../messages/forge/pt-BR.json';
import { templateCheckPresentation, templateStateLabel } from './templateCheckPresentation';
import { type TemplateChecksInput, templateChecks } from './templateChecks';

const input: TemplateChecksInput = {
  parseState: 'parsed',
  parseError: null,
  variableCount: 2,
  formatCount: 1,
  fontReadiness: null,
  fontCheckFailed: false,
  run: null,
  forgeState: 'draft_ready',
  templateKey: null,
};
for (const [locale, forge] of [
  ['pt-BR', pt],
  ['es', es],
] as const) {
  describe(locale, () => {
    const translate = createTranslator({ locale, messages: { forge }, namespace: 'forge' });
    it('localizes summaries while preserving the canonical check facts', () => {
      const checks = templateCheckPresentation(input, translate, locale);
      expect(checks.map((c) => c.state)).toEqual(templateChecks(input).map((c) => c.state));
      expect(checks.map((c) => c.id)).toEqual([
        'parse',
        'fonts',
        'build',
        'mapping',
        'test',
        'publish',
      ]);
      expect(checks[0]?.result).toBe(
        translate('templateVariablesFound', { variables: 2, formats: 1 }),
      );
      expect(checks[0]?.name).not.toBe('Read your file');
      expect(templateStateLabel('future_state', translate)).toBe(forge.templateStateUnknown);
    });
    it('keeps unstructured provider diagnostics out of translated failure summaries', () => {
      const checks = templateCheckPresentation(
        {
          ...input,
          parseState: 'failed',
          parseError: 'private provider detail',
          forgeState: 'failed',
        },
        translate,
        locale,
      );
      expect(checks[0]?.result).toBe(forge.templateParseFailed);
      expect(checks[2]?.result).toBe(forge.templateSetupStopped);
      expect(JSON.stringify(checks)).not.toContain('private provider detail');
    });
  });
}
