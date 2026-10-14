import { FORGE_PROJECT_FILE_MAX_BYTES, FORGE_PROJECT_FILE_MAX_MB } from '@continuum/contracts';
import { zip } from 'fflate';
import type { FolderFile } from '@/lib/library/folderUpload';

/** One folder becomes one package, including every linked asset at its original relative path. */
export async function packageProjectFolder(entries: readonly FolderFile[]): Promise<File> {
  if (!entries.some(({ file }) => /\.(aep|aepx|aet|psd|ai)$/i.test(file.name)))
    throw new Error(
      'Choose a folder containing an After Effects, Photoshop or Illustrator project.',
    );
  const limit = `This folder exceeds the ${FORGE_PROJECT_FILE_MAX_MB} MB upload limit. Choose a smaller project folder or upload a compressed ZIP.`;
  if (entries.reduce((total, { file }) => total + file.size, 0) > FORGE_PROJECT_FILE_MAX_BYTES)
    throw new Error(limit);
  const paths = entries.map(({ file, folders }) => [...folders, file.name].join('/'));
  if (
    paths.some(
      (path) =>
        /[\\\0]|^[a-z]:/i.test(path) ||
        path.split('/').some((part) => !part || part === '.' || part === '..'),
    )
  )
    throw new Error('The folder contains an unsafe file path.');
  if (new Set(paths).size !== paths.length)
    throw new Error('The folder contains duplicate file paths.');
  const files = await Promise.all(
    entries.map(
      async ({ file }, index) => [paths[index], new Uint8Array(await file.arrayBuffer())] as const,
    ),
  );
  const bytes = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    // ponytail: store without compression for predictable packing time; compress when upload size warrants it.
    zip(Object.fromEntries(files), { level: 0, mtime: new Date(2000, 0, 1) }, (error, result) =>
      error ? reject(error) : resolve(result as Uint8Array<ArrayBuffer>),
    );
  });
  if (bytes.length > FORGE_PROJECT_FILE_MAX_BYTES) throw new Error(limit);
  const roots = new Set(entries.map(({ folders }) => folders[0]).filter(Boolean));
  const name = roots.size === 1 ? [...roots][0] : 'templates';
  return new File([bytes], `${name}.zip`, { type: 'application/zip' });
}
