import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { render } from '@/i18n/__tests__/render';
import commonEn from '../../../../messages/common/en.json';
import commonEs from '../../../../messages/common/es.json';
import commonPt from '../../../../messages/common/pt-BR.json';
import en from '../../../../messages/organic/en.json';
import es from '../../../../messages/organic/es.json';
import pt from '../../../../messages/organic/pt-BR.json';
import { AgentWorkingIndicator } from '../agent/AgentWorkingIndicator';
import { organicMediaStripLabel } from '../agent/OrganicMessageRow';
import { PinToAgentButton } from '../agent/PinToAgentButton';
import { Sparkline } from '../cards/Sparkline';
import { PostMediaPreviewImage } from '../PostMediaPreviewImage';
import { EditableCaption } from '../primitives/EditableCaption';
import { GenerationProgressPanel } from '../primitives/GenerationProgressPanel';

afterEach(cleanup);

for (const [locale, organic, common] of [
  ['en', en, commonEn],
  ['pt-BR', pt, commonPt],
  ['es', es, commonEs],
] as const) {
  const t = createTranslator({
    locale,
    namespace: 'organic',
    messages: { organic },
    onError: (error) => {
      throw error;
    },
  });
  const wrap = (children: ReactNode) => (
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={{ organic, common }}
      onError={(error) => {
        throw error;
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
  describe(`Identifier-bound defaults ${locale}`, () => {
    test('uses localized defaults while respecting explicit author-supplied labels', () => {
      const waiting = render(wrap(<AgentWorkingIndicator variant="pinned" />));
      expect(waiting.container.textContent).toContain(t('agentWorkingDefault'));
      waiting.unmount();
      const customWaiting = render(
        wrap(<AgentWorkingIndicator variant="pinned" label="Continuum is working…" />),
      );
      expect(customWaiting.container.textContent).toContain('Continuum is working…');
      customWaiting.unmount();
      const pin = render(wrap(<PinToAgentButton suggestions={[]} />));
      expect(pin.getByRole('button', { name: t('agentPinDefault') })).toBeTruthy();
      pin.unmount();
      const sparkline = render(wrap(<Sparkline values={[1, 4, 2]} />));
      expect(sparkline.getByRole('img', { name: t('trend_9e21771') })).toBeTruthy();
    });
    test('localizes media-failure and caption defaults without changing source text or callbacks', () => {
      const media = render(
        wrap(
          <PostMediaPreviewImage
            postId="raw-id"
            src="https://signed/source"
            alt="Authored generated caption"
          />,
        ),
      );
      fireEvent.error(media.getByRole('img'));
      expect(media.getByText(t('media_preview_unavailable_045101c'))).toBeTruthy();
      media.unmount();
      let actual = '';
      const caption = render(
        wrap(
          <EditableCaption
            value=""
            platform="instagram"
            onChange={(value) => {
              actual = value;
            }}
          />,
        ),
      );
      fireEvent.click(
        caption.getByRole('button', {
          name: t('addCaptionField', { field: t('captionField') }),
        }),
      );
      const input = caption.getByRole('textbox', {
        name: t('caption_87d296e'),
      });
      expect(input.getAttribute('placeholder')).toBe(t('captionPlaceholder'));
      fireEvent.change(input, {
        target: { value: 'Write a caption… is authored content.' },
      });
      expect(actual).toBe('Write a caption… is authored content.');
    });
    test('localizes controlled stages/native progress and keeps untrusted failures out of visible guidance', () => {
      const source = {
        stage: 'drafting',
        percent: 45.25,
        message: 'Generated progress narrative remains source text.',
      };
      const before = { ...source };
      const view = render(wrap(<GenerationProgressPanel status="running" {...source} />));
      expect(view.getByText(t('generationStage', { stage: 'drafting' }))).toBeTruthy();
      expect(view.container.textContent).toContain(
        new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: 20,
          useGrouping: false,
        }).format(source.percent / 100),
      );
      expect(view.getByText(source.message)).toBeTruthy();
      view.rerender(
        wrap(
          <GenerationProgressPanel
            status="error"
            percent={0}
            error="Private upstream diagnostic"
          />,
        ),
      );
      expect(view.getByRole('alert').textContent).toBe(t('streamGenerationFailed'));
      expect(view.container.textContent).not.toContain('Private upstream diagnostic');
      expect(source).toEqual(before);
    });
    test('translates only known tool strip chrome and keeps product names/unknown tool IDs invariant', () => {
      for (const [tool, key] of [
        ['searchMediaLibrary', 'library_dc20b3d'],
        ['listCompetitorInstagramPosts', 'stripCompetitorPosts'],
        ['getYouTubeOrganicAnalytics', 'stripYoutubeVideos'],
      ] as const)
        expect(organicMediaStripLabel(tool, t)).toBe(t(key));
      expect(organicMediaStripLabel('unsplashSearch', t)).toBe('Unsplash');
      expect(organicMediaStripLabel('unknown_tool_identifier', t)).toBeUndefined();
    });
  });
}
