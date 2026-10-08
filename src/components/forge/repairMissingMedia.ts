import type { TemplateParse } from '@continuum/contracts';
import { unzipSync, zipSync } from 'fflate';
import type { FolderFile } from '@/lib/library/folderUpload';

export type MissingMedia = NonNullable<TemplateParse['missingFootage']>[number];
export type MediaRepair = { missing: MissingMedia; replacement?: Uint8Array };
const MAX_REPAIR_BYTES = 64 * 1024 * 1024;
const normalizedPath = (path: string) => path.replace(/\\/g, '/');
const basename = (path: string) => normalizedPath(path).split('/').pop() ?? '';
const tooLarge = () =>
  new Error('This package is too large for in-browser repair. Upload a corrected ZIP revision.');
const safePath = (path: string) =>
  !/^[/]|^[a-z]:|\0/i.test(path) && !path.split('/').some((part) => part === '.' || part === '..');
const isProject = (path: string) =>
  /\.(aep|aepx|aet)$/i.test(path) &&
  !path
    .split('/')
    .some(
      (part) =>
        part === '__MACOSX' || part.startsWith('._') || /adobe after effects auto-save/i.test(part),
    );

export class RepairProjectChoiceRequired extends Error {
  constructor(public readonly projects: string[]) {
    super('Choose the After Effects project for this missing file, then repair again.');
  }
}

function readEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  // ponytail: bounded in-memory repair; move packaging to the server for packages above 64 MB.
  if (bytes.length > MAX_REPAIR_BYTES) throw tooLarge();
  let size = 0;
  const entries = unzipSync(bytes, {
    filter: (entry) => {
      if (!safePath(normalizedPath(entry.name)))
        throw new Error('The ZIP contains an unsafe file path.');
      size += entry.originalSize;
      if (size > MAX_REPAIR_BYTES) throw tooLarge();
      return true;
    },
  });
  const normalized: Record<string, Uint8Array> = Object.create(null);
  for (const [path, content] of Object.entries(entries)) {
    const name = normalizedPath(path);
    if (name in normalized) throw new Error('The ZIP contains duplicate file paths.');
    normalized[name] = content;
  }
  return normalized;
}

function selectProject(projects: string[], projectPath?: string, aepName?: string): string {
  if (projectPath) {
    const exact = normalizedPath(projectPath);
    if (!safePath(exact) || !projects.includes(exact))
      throw new Error(
        'The selected project is not in this package. Refresh the template and try again.',
      );
    return exact;
  }
  const named =
    aepName && /\.(aep|aepx|aet)$/i.test(aepName)
      ? projects.filter((path) => basename(path) === basename(aepName))
      : [];
  if (named.length === 1) return named[0]!;
  if (projects.length === 1) return projects[0]!;
  if (projects.length > 1) throw new RepairProjectChoiceRequired(projects);
  throw new Error(
    'This package has no After Effects project. Upload the original project to repair its media.',
  );
}

/** One version for the whole repair; project and unrelated footage bytes remain unchanged. */
export function repairMissingMediaPackage(
  source: Uint8Array,
  filename: string,
  repairs: readonly MediaRepair[],
  aepName?: string,
): Uint8Array {
  if (source.length > MAX_REPAIR_BYTES) throw tooLarge();
  const entries = /\.zip$/i.test(filename)
    ? readEntries(source)
    : /\.(aep|aepx|aet)$/i.test(filename)
      ? { [basename(filename)]: source }
      : null;
  if (!entries) throw new Error('Choose an After Effects project or ZIP to repair its media.');
  const projects = Object.keys(entries).filter(isProject);
  let size = Object.values(entries).reduce((total, bytes) => total + bytes.length, 0);
  const repairedPaths = new Map<string, Uint8Array>();
  for (const { missing, replacement: supplied } of repairs) {
    const project = selectProject(projects, missing.projectPath, aepName);
    const parts = missing.file.split(/[\\/]+/).filter(Boolean);
    const footage = parts.lastIndexOf('(Footage)');
    if (missing.ascend && missing.ascend.target > parts.length)
      throw new Error(
        'The project records an invalid media path. Upload a relinked project revision.',
      );
    const tail = missing.ascend
      ? parts.slice(-missing.ascend.target)
      : footage >= 0
        ? parts.slice(footage)
        : parts.slice(-1);
    if (!tail.length || !safePath(tail.join('/')) || tail.some((part) => part.includes(':')))
      throw new Error('The missing media path is unsafe.');
    const directory = project.split('/').slice(0, -1);
    directory.splice(Math.max(0, directory.length - Math.max(0, (missing.ascend?.base ?? 1) - 1)));
    const destination = [...directory, ...tail].join('/');
    let replacement = supplied;
    if (!replacement) {
      const matches = Object.entries(entries).filter(
        ([path]) =>
          !path.split('/').some((part) => part === '__MACOSX' || part.startsWith('._')) &&
          basename(path).toLowerCase() === tail.at(-1)?.toLowerCase(),
      );
      if (matches.length !== 1 || matches[0]?.[0] === destination)
        throw new Error('Could not find one matching file in this ZIP. Drop the file on this row.');
      replacement = matches[0]![1];
    }
    const previousRepair = repairedPaths.get(destination);
    if (
      previousRepair &&
      (previousRepair.length !== replacement.length ||
        previousRepair.some((byte, index) => byte !== replacement[index]))
    )
      throw new Error(
        `Different replacements target the same media path: ${destination}. Repair them in separate project packages.`,
      );
    repairedPaths.set(destination, replacement);
    size += replacement.length - (entries[destination]?.length ?? 0);
    if (size > MAX_REPAIR_BYTES) throw tooLarge();
    entries[destination] = new Uint8Array(replacement);
  }
  return zipSync(entries, { level: 0 });
}

export function repairMissingMediaZip(
  zipBytes: Uint8Array,
  missingPath: string,
  replacement?: Uint8Array,
  aepName?: string,
): Uint8Array {
  return repairMissingMediaPackage(
    zipBytes,
    'source.zip',
    [{ missing: { name: null, file: missingPath }, replacement }],
    aepName,
  );
}

/** Longest path suffix first; duplicate basenames remain a choice rather than a guess. */
export function matchMissingMediaFiles(
  missing: readonly MissingMedia[],
  candidates: readonly FolderFile[],
): Array<{ missing: MissingMedia; matches: FolderFile[] }> {
  return missing.map((item) => {
    const wanted = normalizedPath(item.file).toLowerCase().split('/');
    let best = 0;
    let matches: FolderFile[] = [];
    for (const candidate of candidates) {
      const path = [...candidate.folders, candidate.file.name].map((part) => part.toLowerCase());
      let score = 0;
      while (
        score < Math.min(path.length, wanted.length) &&
        path.at(-1 - score) === wanted.at(-1 - score)
      )
        score += 1;
      if (!score || score < best) continue;
      if (score > best) {
        best = score;
        matches = [];
      }
      matches.push(candidate);
    }
    return { missing: item, matches };
  });
}
