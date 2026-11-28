import {
  FORGE_PROJECT_FILE_MAX_BYTES,
  readZipDirectory,
  webComponentManifestPath,
} from '@continuum/contracts';
import { unzip } from 'fflate';

const FONT_ARCHIVE_ENTRY =
  /[\\/]$|\.(ttf|otf|woff2?|eot|txt|md|pdf|rtf)$|(^|[\\/])(licen[cs]e|readme|ofl|copying)[^\\/]*$|(^|[\\/])(\.ds_store|thumbs\.db|desktop\.ini)$/i;

/**
 * Design-only and font-only ZIPs follow the same upload/import path as loose designs and fonts. AE
 * packages and web component projects (a `forge-component.json`, which may bundle a .psd asset) stay
 * intact.
 */
export async function expandDesignArchives(files: readonly File[]): Promise<File[]> {
  const result: File[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name)) {
      result.push(file);
      continue;
    }
    const entries = await zipEntries(file);
    // A ZIP of nothing but fonts opens too: kept whole, it counted as a template project that never
    // parses, and its fonts never reached the font library. A licence, readme or web cut beside them
    // is fine; anything else (a package.json, source, a page) keeps the ZIP whole.
    const fontsOnly =
      entries.some((entry) => /\.(ttf|otf)$/i.test(entry.name)) &&
      entries.every((entry) => FONT_ARCHIVE_ENTRY.test(entry.name));
    if (
      entries.some((entry) => /\.(aep|aepx|aet)$/i.test(entry.name)) ||
      webComponentManifestPath(entries.map((entry) => entry.name)) ||
      (!entries.some((entry) => /\.(psd|ai)$/i.test(entry.name)) && !fontsOnly)
    ) {
      result.push(file);
      continue;
    }
    result.push(
      ...(await extractEntries(
        file,
        entries.filter((entry) => /\.(psd|ai|ttf|otf)$/i.test(entry.name)),
      )),
    );
  }
  return result;
}

/**
 * Type foundries ship a family as a .zip, often beside specimens and a licence. Only the face
 * files come out; everything else in the archive is skipped. A zip with no fonts in it, or one
 * that will not open, stays whole so the caller can route it like any other file.
 */
export async function expandFontArchives(files: readonly File[]): Promise<File[]> {
  const result: File[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name)) {
      result.push(file);
      continue;
    }
    try {
      const entries = await zipEntries(file);
      const fonts = await extractEntries(
        file,
        entries.filter((entry) => FONT_ENTRY.test(entry.name)),
      );
      result.push(...(fonts.length > 0 ? fonts : [file]));
    } catch (error) {
      console.warn('[designArchive] could not read font archive', file.name, error);
      result.push(file);
    }
  }
  return result;
}

const FONT_ENTRY = /\.(ttf|otf|woff2?)$/i;

const ENTRY_TYPES: [RegExp, string][] = [
  [/\.psd$/i, 'image/vnd.adobe.photoshop'],
  [/\.ai$/i, 'application/postscript'],
  [/\.otf$/i, 'font/otf'],
  [/\.woff2$/i, 'font/woff2'],
  [/\.woff$/i, 'font/woff'],
];

async function zipEntries(file: File) {
  if (file.size > FORGE_PROJECT_FILE_MAX_BYTES)
    throw new Error(`${file.name} exceeds the upload limit`);
  const directory = await readZipDirectory(
    file.size,
    async (start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()),
  );
  if (!directory) throw new Error(`${file.name} is not a readable ZIP`);
  return directory.filter(
    (entry) =>
      !entry.name.split(/[\\/]/).some((part) => part === '__MACOSX' || part.startsWith('._')),
  );
}

type ZipEntry = Awaited<ReturnType<typeof zipEntries>>[number];

/** Unpacks the selected entries, refusing anything encrypted, unusual, oversized or escaping. */
async function extractEntries(file: File, selected: ZipEntry[]): Promise<File[]> {
  if (
    selected.length > 100 ||
    selected.reduce((total, entry) => total + entry.size, 0) > FORGE_PROJECT_FILE_MAX_BYTES
  )
    throw new Error(`${file.name} contains too many or oversized design files`);
  for (const entry of selected) {
    if (
      entry.flags & 1 ||
      ![0, 8].includes(entry.method) ||
      /^[\\/]|^[a-z]:/i.test(entry.name) ||
      entry.name.split(/[\\/]/).includes('..')
    )
      throw new Error(`${file.name} contains an unsupported or unsafe entry`);
  }
  if (selected.length === 0) return [];
  const names = new Set(selected.map((entry) => entry.name));
  const extracted = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    void file
      .arrayBuffer()
      .then((buffer) =>
        unzip(
          new Uint8Array(buffer),
          { filter: (entry) => names.has(entry.name) },
          (error, data) => (error ? reject(error) : resolve(data)),
        ),
      )
      .catch(reject);
  });
  return selected.map((entry) => {
    const bytes = extracted[entry.name];
    if (!bytes || bytes.length !== entry.size)
      throw new Error(`${file.name} contains a damaged entry`);
    const name = entry.name.split(/[\\/]/).pop() as string;
    const type = ENTRY_TYPES.find(([pattern]) => pattern.test(name))?.[1] ?? 'font/ttf';
    return new File([bytes as Uint8Array<ArrayBuffer>], name, { type });
  });
}
