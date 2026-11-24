import { isLibraryFontFile } from '@continuum/contracts';

// Knowledge reads a file for its words: an image becomes OCR text and its pixels never reach
// the Library, an SVG or a font is refused by ingest. Customers still drop logos, fonts and
// reference images here, so these are caught before upload and offered to the Library.

/** What a file dropped on Knowledge would be better kept as; null for an ordinary document. */
export type VisualAssetKind = 'font' | 'svg' | 'image';

export function visualAssetKind(file: Pick<File, 'name' | 'type'>): VisualAssetKind | null {
  if (isLibraryFontFile({ fileName: file.name, mimeType: file.type })) return 'font';
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return 'svg';
  if (file.type.startsWith('image/')) return 'image';
  return null;
}

/** Only a raster image may still go to Knowledge (its text is read); fonts and SVGs never. */
export const mayKeepInKnowledge = (file: Pick<File, 'name' | 'type'>) =>
  visualAssetKind(file) === 'image';

export function splitVisualAssets(files: readonly File[]) {
  const documents: File[] = [];
  const visual: File[] = [];
  for (const file of files) (visualAssetKind(file) ? visual : documents).push(file);
  return { documents, visual };
}
