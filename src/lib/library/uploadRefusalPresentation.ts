import {
  classifyLibraryFileOrGeneric,
  isLibraryFontFile,
  LIBRARY_PRESENTATION_MAX_BYTES,
  LIBRARY_PROJECT_FILE_MAX_BYTES,
  LIBRARY_UPLOAD_MAX_BYTES,
} from '@continuum/contracts';
import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { uploadSizeRefusal } from './uploadMediaAsset';
/** Canonical admission rules decide; only their display changes with the locale. */
export function uploadRefusalPresentation(
  file: { name: string; size: number; type?: string },
  translate: ReturnType<typeof useTranslations<'library'>>,
  locale: UiLocale,
): string | null {
  if (!uploadSizeRefusal(file)) return null;
  if (isLibraryFontFile({ fileName: file.name, mimeType: file.type }))
    return translate('uploadFontRefusal', { file: file.name });
  const family = classifyLibraryFileOrGeneric({
    fileName: file.name,
    mimeType: file.type,
  }).family;
  const kind =
    file.size > LIBRARY_UPLOAD_MAX_BYTES
      ? 'storage'
      : family === 'presentation'
        ? 'presentation'
        : 'project';
  const max =
    (kind === 'storage'
      ? LIBRARY_UPLOAD_MAX_BYTES
      : kind === 'presentation'
        ? LIBRARY_PRESENTATION_MAX_BYTES
        : LIBRARY_PROJECT_FILE_MAX_BYTES) /
    (1024 * 1024);
  const size = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(Number((file.size / (1024 * 1024)).toFixed(1)));
  return translate('uploadSizeRefusal', { file: file.name, size, max, kind });
}
