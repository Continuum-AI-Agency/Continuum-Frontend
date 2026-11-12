import { type EncodeSettings, encodeFilesOf, FILE_LABEL } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type ForgeText = ReturnType<typeof useTranslations<'forge'>>;

/** Display only: settings and canonical container identities never change. */
export function describeMxfAudioUi(settings: EncodeSettings | null | undefined, t: ForgeText) {
  return t(
    settings?.audio?.enabled === false
      ? 'mxfNoAudio'
      : settings?.audio?.layout === 'stereo'
        ? 'mxfStereoAudio'
        : 'mxfMonoAudio',
  );
}

export function describeEncodeSettingsUi(
  settings: EncodeSettings | null | undefined,
  container: 'mp4' | 'mov' | null,
  t: ForgeText,
  locale: UiLocale,
): string | null {
  if (!container) return null;
  const files = encodeFilesOf(settings, container);
  const fps = settings?.fps;
  const rate =
    fps === undefined
      ? null
      : fps === 'comp'
        ? t('encodeCompRate')
        : (() => {
            const [numerator, denominator] = String(fps).split('/').map(Number);
            const value = denominator ? (numerator ?? 0) / denominator : Number(fps);
            // Match the canonical three-decimal rounding, without introducing grouping.
            return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false }).format(Number(value.toFixed(3)))} fps`;
          })();
  const parts = [
    rate,
    settings?.files !== undefined
      ? files.map((file) => FILE_LABEL[file]).join(' + ') || t('encodeNoFile')
      : null,
    files.includes('mxf') ? describeMxfAudioUi(settings, t) : null,
    files.includes('mxf')
      ? settings?.video?.mxfProfile === 'xdcam-hd422-1080i5994'
        ? 'XDCAM HD422 · 1080i59.94 · 50 Mb/s'
        : t('dnxhrProgressive')
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' · ') : null;
}
