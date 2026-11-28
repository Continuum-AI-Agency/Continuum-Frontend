import { isLibraryFontFile } from '@continuum/contracts';
import { DOCUMENT_FILE_EXTENSIONS } from '@/lib/documents/uploadLimits';

// Where brand material belongs, decided from the file so the person never has to. Knowledge
// reads words (an image there is only OCR text, and ingest refuses an SVG or a font), the
// Library holds what Studio and the agents look at, and the font store holds faces. Every
// surface a customer hands brand material to routes through here.

export type BrandUploadHome = 'knowledge' | 'library' | 'fonts';

const extensionOf = (name: string) => name.slice(name.lastIndexOf('.')).toLowerCase();

const isSvg = (file: Pick<File, 'name' | 'type'>) =>
  file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);

const RASTER_IMAGE = /\.(png|jpe?g|webp|gif|avif|heic)$/i;

/**
 * The home a file belongs in. `fallback` takes what nothing claims (a .key deck, a zip with no
 * fonts): a Knowledge surface keeps it, so Knowledge's own message says how to export it.
 */
export function brandUploadHome(
  file: Pick<File, 'name' | 'type'>,
  fallback: BrandUploadHome = 'library',
): BrandUploadHome {
  if (isLibraryFontFile({ fileName: file.name, mimeType: file.type })) return 'fonts';
  if (isSvg(file) || /^(image|video|audio)\//.test(file.type) || RASTER_IMAGE.test(file.name))
    return 'library';
  if ((DOCUMENT_FILE_EXTENSIONS as readonly string[]).includes(extensionOf(file.name)))
    return 'knowledge';
  return fallback;
}

export function routeBrandUploads(
  files: readonly File[],
  fallback: BrandUploadHome = 'library',
): Record<BrandUploadHome, File[]> {
  const routed: Record<BrandUploadHome, File[]> = { knowledge: [], library: [], fonts: [] };
  for (const file of files) routed[brandUploadHome(file, fallback)].push(file);
  return routed;
}

/** A raster image can also be read for its text (a price list, a menu); an SVG cannot. */
export const mayReadAsText = (file: Pick<File, 'name' | 'type'>) =>
  !isSvg(file) && (file.type.startsWith('image/') || RASTER_IMAGE.test(file.name));

export const isZipFile = (file: Pick<File, 'name' | 'type'>) =>
  /\.zip$/i.test(file.name) || /^application\/(x-)?zip/.test(file.type);

/** Unpacks foundry zips so their faces route as fonts; fflate loads only when a zip is present. */
export async function withFontArchivesExpanded(files: readonly File[]): Promise<File[]> {
  if (!files.some(isZipFile)) return [...files];
  const { expandFontArchives } = await import('@/components/forge/designArchive');
  return expandFontArchives(files);
}
