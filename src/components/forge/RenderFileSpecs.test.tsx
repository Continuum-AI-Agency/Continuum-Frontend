import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { apiRenderFileSpecsSchema, apiRenderOutputSchema } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import es from '../../../messages/forge/es.json';
import pt from '../../../messages/forge/pt-BR.json';
import { RenderFileSpecs } from './RenderFileSpecs';

afterEach(cleanup);
const specs = apiRenderFileSpecsSchema.parse({
  outputId: 'file-1',
  status: 'measured',
  video: {
    codec: 'h264',
    profile: null,
    frameRate: 29.97,
    frameRateRational: '30000/1001',
    bitDepth: 8,
    fieldOrder: 'progressive',
  },
  audioStreams: [{ index: 0, codec: 'aac', channels: 2, sampleRate: 44100, bitDepth: 16 }],
  probedAt: null,
});
const output = apiRenderOutputSchema.parse({
  id: 'file-1',
  kind: 'video',
  fileName: 'Authored creative.mp4',
  mimeType: 'video/mp4',
  url: 'https://example.test/creative.mp4',
  width: 1920,
  height: 1080,
});
for (const [locale, forge] of [
  ['pt-BR', pt],
  ['es', es],
] as const) {
  describe(locale, () => {
    it('localizes measured rates without parsing localized decimals back into stored numbers', async () => {
      const read = spyOn(apiRendersApi, 'getFileSpecs').mockResolvedValue(specs);
      try {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const view = render(
          <NextIntlClientProvider locale={locale} messages={{ forge }}>
            <QueryClientProvider client={client}>
              <RenderFileSpecs brandId="brand" jobId="job" output={output} />
            </QueryClientProvider>
          </NextIntlClientProvider>,
        );
        await waitFor(() => expect(view.container.textContent).toContain('29,97 fps'));
        expect(view.container.textContent).toContain('44,1 kHz');
        expect(view.container.textContent).not.toContain('NaN');
        expect(view.container.textContent).toContain('Authored creative.mp4');
        expect(specs.video?.frameRate).toBe(29.97);
        expect(specs.audioStreams?.[0]?.sampleRate).toBe(44100);
      } finally {
        read.mockRestore();
      }
    });
  });
}
