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
    ['en', en, 'Reel · 1 of 1 media item'],
    ['pt-BR', pt, 'Reel · 1 de 1 arquivo de mídia'],
    ['es', es, 'Reel · 1 de 1 archivo multimedia'],
  ] as const)('localizes %s chrome and leaves approved creative text intact', (locale, messages, media) => {
    render(
      <NextIntlClientProvider locale={locale} timeZone="UTC" messages={{ organic: messages }}>
        <PublishIntentSummary
          intent={{
            platform: 'tiktok',
            format: 'REEL',
            blockers: [],
            account: { id: 'account', handle: 'source_handle', displayName: 'Source name' },
            caption: { length: 23, preview: 'Source-owned caption' },
            media: { count: 1, required: 1 },
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(media)).toBeTruthy();
    expect(screen.getByText('@source_handle')).toBeTruthy();
    expect(screen.getByText('Source-owned caption')).toBeTruthy();
  });

  it('uses full plural messages rather than English sentence fragments', () => {
    const translate = createTranslator({ locale: 'pt-BR', messages: pt });
    expect(translate('publishMediaSummary', { format: 'Carrossel', count: 1, required: 1 })).toBe(
      'Carrossel · 1 de 1 arquivo de mídia',
    );
    expect(translate('publishMediaSummary', { format: 'Carrossel', count: 2, required: 10 })).toBe(
      'Carrossel · 2 de 10 arquivos de mídia',
    );
  });
});
