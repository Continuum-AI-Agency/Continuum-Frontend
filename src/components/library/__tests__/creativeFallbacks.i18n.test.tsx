import { afterEach, describe, expect, test } from 'bun:test';
import {
  describeEncodeSettings,
  describeMxfAudio,
  type EncodeSettings,
  shareLinkActivityEventSchema,
} from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { NoSpecimenText, TypefaceHoldBadge } from '@/components/brand/typefaceHonesty';
import {
  describeEncodeSettingsUi,
  describeMxfAudioUi,
} from '@/components/forge/encodePresentation';
import { PaletteReadout, ProvenanceMark } from '@/components/onboarding/v2/dna/RevealMarks';
import { englishMessages } from '@/i18n/__tests__/render';
import commonEs from '../../../../messages/common/es.json';
import commonPt from '../../../../messages/common/pt-BR.json';
import forgeEs from '../../../../messages/forge/es.json';
import forgePt from '../../../../messages/forge/pt-BR.json';
import libraryEs from '../../../../messages/library/es.json';
import libraryPt from '../../../../messages/library/pt-BR.json';
import { TimelineMarkerStrip } from '../detail/TimelineMarkerStrip';
import { ShareLinkActivity } from '../share/ShareLinkActivity';

afterEach(cleanup);
const failTranslation = (error: unknown): never => {
  throw error;
};
const messages = (locale: 'en' | 'pt-BR' | 'es') => ({
  ...englishMessages,
  ...(locale === 'pt-BR'
    ? { common: commonPt, forge: forgePt, library: libraryPt }
    : locale === 'es'
      ? { common: commonEs, forge: forgeEs, library: libraryEs }
      : {}),
});
const translate = (locale: 'en' | 'pt-BR' | 'es') =>
  createTranslator({
    locale,
    messages: messages(locale),
    namespace: 'forge',
    onError: failTranslation,
  });

describe('creative fallback presentation', () => {
  test('keeps the canonical English encode summary and original settings, including no-file and still behavior', () => {
    const examples: Array<EncodeSettings | undefined> = [
      undefined,
      { fps: 'comp' },
      { fps: '30000/1001', files: { mxf: true } },
      { files: { mp4: false } },
      {
        files: { mxf: true },
        audio: { enabled: false },
        video: { mxfProfile: 'xdcam-hd422-1080i5994' },
      },
      { files: { mxf: true, gif: true }, audio: { layout: 'stereo' } },
    ];
    for (const settings of examples) {
      const original = structuredClone(settings);
      for (const container of ['mp4', 'mov', null] as const)
        expect(describeEncodeSettingsUi(settings, container, translate('en'), 'en')).toBe(
          describeEncodeSettings(settings, container),
        );
      expect(describeMxfAudioUi(settings, translate('en'))).toBe(describeMxfAudio(settings));
      expect(settings).toEqual(original);
    }
  });
  for (const locale of ['pt-BR', 'es'] as const) {
    test(`formats encode settings in ${locale} without changing precision, channels or codec identities`, () => {
      const settings: EncodeSettings = {
        fps: '30000/1001',
        files: { mxf: true },
        audio: { layout: 'stereo' },
      };
      const result = describeEncodeSettingsUi(settings, 'mp4', translate(locale), locale);
      expect(result).toContain('29,97 fps');
      expect(result).toContain('MP4 + MXF');
      expect(result).toContain('48 kHz');
      expect(result).toContain('PCM');
      expect(result).not.toContain('stereo track');
      expect(settings.fps).toBe('30000/1001');
    });
    test(`renders fallback copy and comment accessibility in ${locale} with a throwing real provider`, () => {
      const event = shareLinkActivityEventSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        shareLinkId: '22222222-2222-4222-8222-222222222222',
        kind: 'download',
        assetId: null,
        assetTitle: null,
        versionId: null,
        reviewerName: 'Cláudia / Cliente',
        reviewerEmail: 'claudia@example.test',
        createdAt: '2026-11-11T12:00:00Z',
      });
      const selected: string[] = [];
      const { container, getByRole } = render(
        <NextIntlClientProvider
          locale={locale}
          timeZone="UTC"
          messages={messages(locale)}
          onError={failTranslation}
        >
          <TypefaceHoldBadge held />
          <TypefaceHoldBadge held={false} />
          <NoSpecimenText />
          <ProvenanceMark field="logo" provenance={{ read: false, source: null }} />
          <PaletteReadout
            colours={[
              { hex: '#abcdef', role: null, rule: null },
              {
                hex: '#fedcba',
                role: 'authored',
                rule: 'Written by the brand — preserve exactly.',
              },
            ]}
          />
          <ShareLinkActivity events={[]} />
          <ShareLinkActivity events={[event]} />
          <TimelineMarkerStrip
            durationMs={10000}
            markers={[
              {
                id: 'authored-marker',
                timeMs: 1250,
                endMs: null,
                initials: 'CC',
                title: 'Please keep MY words.',
              },
            ]}
            onSelect={(marker) => selected.push(marker.id)}
          />
        </NextIntlClientProvider>,
      );
      expect(container.textContent).toContain(
        locale === 'pt-BR' ? 'Nenhuma atividade ainda.' : 'Aún no hay actividad.',
      );
      expect(container.textContent).toContain(locale === 'pt-BR' ? 'baixou' : 'descargó');
      expect(container.textContent).toContain('Cláudia / Cliente <claudia@example.test>');
      expect(container.textContent).toContain('Written by the brand — preserve exactly.');
      expect(container.textContent).not.toContain('nothing found');
      expect(container.textContent).not.toContain('No specimen is rendered here.');
      const button = getByRole('button', {
        name: new RegExp(
          `${locale === 'pt-BR' ? 'Comentário em' : 'Comentario en'}.*Please keep MY words\\.`,
        ),
      });
      expect(button.getAttribute('data-time-ms')).toBe('1250');
      button.click();
      expect(selected).toEqual(['authored-marker']);
    });
  }
});
