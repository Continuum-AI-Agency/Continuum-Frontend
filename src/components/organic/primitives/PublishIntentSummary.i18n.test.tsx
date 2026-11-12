import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, screen } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { render } from '@/i18n/__tests__/render';
import en from '../../../../messages/organic/en.json';
import es from '../../../../messages/organic/es.json';
import pt from '../../../../messages/organic/pt-BR.json';
import { PublishIntentSummary } from './PublishIntentSummary';

afterEach(cleanup);

describe('publish confirmation localization', () => {
  it.each([
    ['en', en, 'Song 30 · Original video 100', 'Track start 1.5s · End 8s'],
    ['pt-BR', pt, 'Música 30 · Vídeo original 100', 'Início da faixa 1,5s · Fim 8s'],
    ['es', es, 'Música 30 · Video original 100', 'Inicio de la pista 1,5s · Fin 8s'],
  ] as const)('localizes %s chrome and leaves approved creative text intact', (locale, messages, mix, segment) => {
    render(
      <NextIntlClientProvider locale={locale} timeZone="UTC" messages={{ organic: messages }}>
        <PublishIntentSummary
          intent={{
            platform: 'tiktok',
            format: 'REEL',
            blockers: [],
            account: {
              id: 'account',
              handle: 'source_handle',
              displayName: 'Source name',
            },
            caption: { length: 23, preview: 'Source-owned caption' },
            media: { count: 1, required: 1 },
            audio: {
              provider: 'tiktok_cml',
              catalogId: 'catalog',
              audioId: 'track',
              accountId: 'account',
              title: 'Source-owned title',
              artist: null,
              coverUrl: null,
              previewUrl: null,
              durationMs: null,
              songVolume: 30,
              videoVolume: 100,
              songStartMs: 1500,
              songEndMs: 8000,
              unavailablePolicy: 'block',
            },
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(mix)).toBeTruthy();
    expect(screen.getByText(segment)).toBeTruthy();
    expect(screen.getByText('@source_handle')).toBeTruthy();
    expect(screen.getByText('Source-owned caption')).toBeTruthy();
    expect(screen.getByText('Source-owned title')).toBeTruthy();
  });

  it('uses full plural messages rather than English sentence fragments', () => {
    const translate = createTranslator({ locale: 'pt-BR', messages: pt });
    expect(
      translate('publishMediaSummary', {
        format: 'Carrossel',
        count: 1,
        required: 1,
      }),
    ).toBe('Carrossel · 1 de 1 arquivo de mídia');
    expect(
      translate('publishMediaSummary', {
        format: 'Carrossel',
        count: 2,
        required: 10,
      }),
    ).toBe('Carrossel · 2 de 10 arquivos de mídia');
  });
});
