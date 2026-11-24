import { isLibraryFontFile } from '@continuum/contracts';
import { unzip } from 'fflate';

// Type foundries ship a family as a .zip. The font store takes face files, so a dropped
// archive is unpacked here, on the person's machine, and only its fonts go on to the font
// review; licences, specimens and macOS resource forks inside it are skipped.

/** An archive bigger than this unpacked is not a font family; it is skipped whole. */
const MAX_UNPACKED_BYTES = 100 * 1024 * 1024;
const MAX_FONTS = 200;

const isZip = (file: File) =>
  /\.zip$/i.test(file.name) ||
  file.type === 'application/zip' ||
  file.type === 'application/x-zip-compressed';

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function fontsInZip(bytes: Uint8Array): Promise<File[]> {
  let unpacked = 0;
  return new Promise((resolve, reject) => {
    unzip(
      bytes,
      {
        filter: (entry) => {
          const name = baseName(entry.name);
          if (entry.name.startsWith('__MACOSX/') || name.startsWith('._')) return false;
          if (!isLibraryFontFile({ fileName: name, mimeType: '' })) return false;
          unpacked += entry.originalSize;
          return unpacked <= MAX_UNPACKED_BYTES;
        },
      },
      (error, entries) => {
        if (error) return reject(error);
        const files = Object.entries(entries)
          .slice(0, MAX_FONTS)
          .map(([path, data]) => new File([data as Uint8Array<ArrayBuffer>], baseName(path)));
        resolve(files);
      },
    );
  });
}

/** Every dropped file, with each .zip replaced by the font files inside it. */
export async function expandFontArchives(files: readonly File[]): Promise<File[]> {
  const expanded = await Promise.all(
    files.map(async (file) => {
      if (!isZip(file)) return [file];
      try {
        return await fontsInZip(new Uint8Array(await file.arrayBuffer()));
      } catch (error) {
        // An archive that will not open adds no fonts; the rest of the drop still goes on.
        console.warn('[fontArchive] could not read archive', file.name, error);
        return [];
      }
    }),
  );
  return expanded.flat();
}
