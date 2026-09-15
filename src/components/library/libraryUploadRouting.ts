import { isLibraryFontFile } from '@continuum/contracts';

export function partitionLibraryUploadFiles(fileList: FileList | File[]) {
  const fonts: File[] = [];
  const media: File[] = [];
  for (const file of Array.from(fileList)) {
    (isLibraryFontFile({ fileName: file.name, mimeType: file.type }) ? fonts : media).push(file);
  }
  return { fonts, media };
}
