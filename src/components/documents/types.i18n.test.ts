import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import en from '../../../messages/common/en.json';
import es from '../../../messages/common/es.json';
import pt from '../../../messages/common/pt-BR.json';
import {
  categoryLabel,
  type DocumentView,
  describeStep,
  formatRetentionCountdown,
  kindLabel,
} from './types';

const now = Date.parse('2026-11-11T12:00:00Z');
const document: DocumentView = {
  id: 'test-doc',
  name: 'Relatório del cliente.pdf',
  source: 'upload',
  createdAt: '2026-11-10T12:00:00Z',
  status: 'error',
  errorCode: 'EMPTY_TEXT',
  errorMessage: 'RAW PROVIDER DIAGNOSTIC',
  kind: 'image',
};
for (const [locale, messages, expected] of [
  ['en', en, ['No text found', 'Image', 'Brand guidelines', '2 days left']],
  ['pt-BR', pt, ['Nenhum texto encontrado', 'Imagem', 'Diretrizes da marca', 'Faltam 2 dias']],
  ['es', es, ['No se encontró texto', 'Imagen', 'Lineamientos de marca', 'Quedan 2 días']],
] as const) {
  describe(`document display in ${locale}`, () => {
    const t = createTranslator({
      locale,
      messages: { common: messages },
      namespace: 'common',
    });
    it('uses stable error codes while preserving document content and state', () => {
      expect(describeStep(document, t, locale).text).toBe(expected[0]);
      expect(kindLabel(document, t)).toBe(expected[1]);
      expect(categoryLabel('brand_guidelines', t)).toBe(expected[2]);
      expect(document.name).toBe('Relatório del cliente.pdf');
      expect(document.errorMessage).toBe('RAW PROVIDER DIAGNOSTIC');
      expect(document.status).toBe('error');
    });
    it('localizes plural expiry counts without changing the expiry instant', () => {
      const expiresAt = new Date(now + 2 * 86400000).toISOString();
      expect(formatRetentionCountdown(expiresAt, now, t, locale)).toBe(expected[3]);
      expect(expiresAt).toBe('2026-11-13T12:00:00.000Z');
    });
  });
}
