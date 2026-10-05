import { FORGE_PROJECT_FILE_MAX_BYTES, readZipDirectory } from '@continuum/contracts';
import { unzip } from 'fflate';

/** Design-only ZIPs follow the same upload/import path as loose designs. AE packages stay intact. */
export async function expandDesignArchives(files: readonly File[]): Promise<File[]> {
  const result: File[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name)) {
      result.push(file);
      continue;
    }
    if (file.size > FORGE_PROJECT_FILE_MAX_BYTES)
      throw new Error(`${file.name} exceeds the upload limit`);
    const directory = await readZipDirectory(
      file.size,
      async (start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()),
    );
    if (!directory) throw new Error(`${file.name} is not a readable ZIP`);
    const entries = directory.filter(
      (entry) =>
        !entry.name.split(/[\\/]/).some((part) => part === '__MACOSX' || part.startsWith('._')),
    );
    if (
      entries.some((entry) => /\.(aep|aepx|aet)$/i.test(entry.name)) ||
      !entries.some((entry) => /\.(psd|ai)$/i.test(entry.name))
    ) {
      result.push(file);
      continue;
    }
    const selected = entries.filter((entry) => /\.(psd|ai|ttf|otf)$/i.test(entry.name));
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
    const names = new Set(selected.map((entry) => entry.name));
    const extracted = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      void file
        .arrayBuffer()
        .then((buffer) =>
          unzip(
            new Uint8Array(buffer),
            {
              filter: (entry) => names.has(entry.name),
            },
            (error, data) => (error ? reject(error) : resolve(data)),
          ),
        )
        .catch(reject);
    });
    for (const entry of selected) {
      const bytes = extracted[entry.name];
      if (!bytes || bytes.length !== entry.size)
        throw new Error(`${file.name} contains a damaged entry`);
      const name = entry.name.split(/[\\/]/).pop()!;
      const type = /\.psd$/i.test(name)
        ? 'image/vnd.adobe.photoshop'
        : /\.ai$/i.test(name)
          ? 'application/postscript'
          : /\.otf$/i.test(name)
            ? 'font/otf'
            : 'font/ttf';
      result.push(new File([bytes as Uint8Array<ArrayBuffer>], name, { type }));
    }
  }
  return result;
}
