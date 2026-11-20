import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import en from '../../../messages/scale/en.json';
import es from '../../../messages/scale/es.json';
import pt from '../../../messages/scale/pt-BR.json';
import { getSingleParentConstraintMessage } from './hierarchyRelationships';
import { canvasValidationMessage } from './presentation';

describe('Canvas validation presentation preserves stored classification strings', () => {
  it.each([
    'en',
    'pt-BR',
    'es',
  ] as const)('localizes known guidance in %s without changing stored input', (locale) => {
    const t = createTranslator({
      locale,
      namespace: 'scale',
      messages: { scale: { en, 'pt-BR': pt, es }[locale] },
    });
    const stored = [
      getSingleParentConstraintMessage('ad-set', 'audience'),
      'Ad/Creative compatibility: VIDEO creative is not supported by IMAGE ad format.',
      'Not connected: this ad set is not under the campaign, so a save would drop it.',
    ];
    const before = JSON.stringify(stored);
    const rendered = stored.map((message) => canvasValidationMessage(message, t));
    if (locale === 'pt-BR') {
      expect(rendered[0]).toContain('Restrição');
      expect(rendered[1]).toContain('vídeo');
      expect(rendered[2]).toContain('Sem conexão');
    }
    if (locale === 'es') {
      expect(rendered[0]).toContain('Restricción');
      expect(rendered[1]).toContain('video');
      expect(rendered[2]).toContain('Sin conexión');
    }
    expect(rendered.every(Boolean)).toBe(true);
    expect(canvasValidationMessage('opaque provider diagnostic SQL 123', t)).not.toContain('SQL');
    expect(JSON.stringify(stored)).toBe(before);
    expect(stored[0]?.startsWith('Hierarchy constraint:')).toBe(true);
  });
});
