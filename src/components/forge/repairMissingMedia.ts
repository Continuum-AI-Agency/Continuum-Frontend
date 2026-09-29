import { unzipSync, zipSync } from 'fflate';

const MAX_REPAIR_ZIP_BYTES = 64 * 1024 * 1024;

/** Add one referenced media file beside the AEP, retaining the other package entries. */
export function repairMissingMediaZip(
  zipBytes: Uint8Array,
  missingPath: string,
  replacement?: Uint8Array,
  aepName?: string,
): Uint8Array {
  // ponytail: in-memory ZIP repair is capped at 64 MB; stream archives if larger packages need it.
  if (zipBytes.length > MAX_REPAIR_ZIP_BYTES)
    throw new Error(
      'This ZIP is too large for in-browser repair. Upload a corrected ZIP revision.',
    );
  const entries = unzipSync(zipBytes);
  const aeps = Object.keys(entries).filter((path) => /\.aepx?$/i.test(path));
  const selected = aepName
    ? aeps.filter(
        (path) => path.replace(/\\/g, '/').split('/').pop() === aepName.split(/[\\/]/).pop(),
      )
    : aeps;
  if (selected.length !== 1) throw new Error('Could not identify one AEP for media repair.');
  const aepDirectory = selected[0]!.replace(/\\/g, '/').replace(/[^/]+$/, '');
  const parts = missingPath.split(/[\\/]+/).filter(Boolean);
  const footage = parts.lastIndexOf('(Footage)');
  const tail = footage >= 0 ? parts.slice(footage) : parts.slice(-1);
  if (!tail.length || tail.some((part) => part === '.' || part === '..' || part.includes(':')))
    throw new Error('The missing media path is unsafe.');
  const destination = `${aepDirectory}${tail.join('/')}`;
  const normalized = Object.fromEntries(
    Object.entries(entries).map(([path, bytes]) => [path.replace(/\\/g, '/'), bytes]),
  );
  if (!replacement) {
    const matches = Object.entries(normalized).filter(
      ([path]) => path.split('/').pop()?.toLowerCase() === tail.at(-1)?.toLowerCase(),
    );
    if (matches.length !== 1 || matches[0]?.[0] === destination)
      throw new Error('Could not find one matching file in this ZIP. Drop the file on this row.');
    replacement = matches[0]![1];
  }
  normalized[destination] = new Uint8Array(replacement);
  return zipSync(normalized, { level: 0 });
}
