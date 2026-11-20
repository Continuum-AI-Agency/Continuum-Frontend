import { afterEach, describe, expect, mock, test } from 'bun:test';

const uploadBrandFont = mock(async () => ({ family: 'Heading Now', format: 'otf', bytes: 4 }));
mock.module('@/lib/library/templateSources', () => ({ uploadBrandFont }));

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import commonEs from '../../../messages/common/es.json';
import commonPt from '../../../messages/common/pt-BR.json';
import libraryEs from '../../../messages/library/es.json';
import libraryPt from '../../../messages/library/pt-BR.json';
import { FontUploadReviewDialog } from './FontUploadReviewDialog';

afterEach(() => {
  cleanup();
  uploadBrandFont.mockClear();
});

describe('font review UI language', () => {
  for (const entry of [
    {
      locale: 'pt-BR' as const,
      messages: { common: commonPt, library: libraryPt },
      heading: 'Revisar metadados da fonte',
      family: 'Família da fonte',
      weight: 'Peso (opcional)',
      style: 'Estilo',
      submit: 'Adicionar ao mecanismo',
      weightError: 'Use um número inteiro de 1 a 1000',
      success: /adicionada ao mecanismo/i,
    },
    {
      locale: 'es' as const,
      messages: { common: commonEs, library: libraryEs },
      heading: 'Revisar metadatos de la fuente',
      family: 'Familia de la fuente',
      weight: 'Grosor (opcional)',
      style: 'Estilo',
      submit: 'Agregar al motor',
      weightError: 'Usa un número entero de 1 a 1000',
      success: /agregada al motor/i,
    },
  ]) {
    test(`${entry.locale}: translates labels while preserving font identity and values`, async () => {
      const file = new File([new Uint8Array([79, 84, 84, 79])], 'HeadingNow-Bold.otf', {
        type: 'font/otf',
      });
      render(
        <NextIntlClientProvider locale={entry.locale} timeZone="UTC" messages={entry.messages}>
          <FontUploadReviewDialog
            brandId="22222222-2222-4222-8222-222222222222"
            files={[file]}
            onClose={() => undefined}
            onUploaded={() => undefined}
          />
        </NextIntlClientProvider>,
      );

      expect(screen.getByText(entry.heading)).toBeTruthy();
      fireEvent.change(screen.getByLabelText(entry.family), { target: { value: 'Heading Now' } });
      fireEvent.change(screen.getByLabelText(entry.weight), { target: { value: '1001' } });
      fireEvent.click(screen.getByRole('button', { name: entry.submit }));
      expect((await screen.findByRole('alert')).textContent).toBe(entry.weightError);
      expect(uploadBrandFont).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText(entry.weight), { target: { value: '700' } });
      fireEvent.change(screen.getByLabelText(entry.style), { target: { value: 'italic' } });
      fireEvent.click(screen.getByRole('button', { name: entry.submit }));

      expect(await screen.findByText(entry.success)).toBeTruthy();
      expect(uploadBrandFont).toHaveBeenCalledWith({
        brandId: '22222222-2222-4222-8222-222222222222',
        family: 'Heading Now',
        file,
        weight: 700,
        style: 'italic',
      });
    });
  }
});
