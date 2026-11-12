import { describe, expect, test } from 'bun:test';
import { createTranslator } from 'next-intl';
import { describeSlackFailure, ROLE_LABEL } from '@/components/forge/slackRoomCopy';
import { errorMessage, successMessage } from '@/lib/integrations/callbackMessages';
import en from '../../../../messages/settings/en.json';
import es from '../../../../messages/settings/es.json';
import pt from '../../../../messages/settings/pt-BR.json';
import { integrationCallbackCopy } from '../account/callbackCopy';
import { settingsSlackCopy } from './settingsSlackCopy';

for (const [locale, messages] of [
  ['en', en],
  ['pt-BR', pt],
  ['es', es],
] as const) {
  describe(`Settings integration copy ${locale}`, () => {
    const t = createTranslator({
      locale,
      namespace: 'settings',
      messages: { settings: messages },
    });
    test('translates known Slack role and failure guidance, keeping IDs and unknown diagnostics independent', () => {
      const error = new Error('chat_destination_not_found private diagnostic');
      const copy = describeSlackFailure(error, (source) =>
        settingsSlackCopy(source, t, 'Safe fallback'),
      );
      expect(copy).toBe(
        locale === 'en'
          ? 'That room is already gone. Refresh the list.'
          : locale === 'pt-BR'
            ? 'Essa sala não existe mais. Atualize a lista.'
            : 'Esa sala ya no existe. Actualiza la lista.',
      );
      expect(settingsSlackCopy(ROLE_LABEL.ops, t, 'Fallback')).toBe(
        locale === 'en' ? 'Ops' : locale === 'pt-BR' ? 'Operações' : 'Operaciones',
      );
      expect(settingsSlackCopy('provider private detail', t, 'Safe fallback')).toBe(
        'Safe fallback',
      );
      expect(error.message).toBe('chat_destination_not_found private diagnostic');
      expect(ROLE_LABEL.ops).toBe('Ops');
    });
    test('translates callback guidance chosen by stable reason and keeps unknown failures safe', () => {
      const present = (source: string) => integrationCallbackCopy(source, t);
      const failure = errorMessage('private_provider_message', present);
      expect(failure).toBe(
        locale === 'en'
          ? 'Connection failed.'
          : locale === 'pt-BR'
            ? 'A conexão falhou.'
            : 'La conexión falló.',
      );
      expect(successMessage('no_youtube_channels', present)).toContain('YouTube');
      expect(successMessage(null, present)).toBe(
        locale === 'en'
          ? 'Integration connected.'
          : locale === 'pt-BR'
            ? 'Integração conectada.'
            : 'Integración conectada.',
      );
    });
  });
}
