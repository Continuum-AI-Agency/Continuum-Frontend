// A folder dropped on the Library (or picked with "Upload folder") keeps its shape: every
// directory becomes a collection nested under its parent, and each file is filed into the
// collection of the folder it sat in.

export type FolderFile = { file: File; folders: string[] };

/** "Shoot/Day 1/a.mp4" → folders ["Shoot", "Day 1"]. A loose file has none. */
export function foldersOf(relativePath: string): string[] {
  return relativePath.split('/').filter(Boolean).slice(0, -1);
}

// Finder and Explorer litter folders with these; they would only show up as refused uploads.
const isSystemFile = (name: string) => name.startsWith('.') || name === 'Thumbs.db';

/** Files from a `webkitdirectory` input: each carries its path under the picked folder. */
export function folderFilesFromInput(files: FileList | readonly File[]): FolderFile[] {
  return Array.from(files)
    .filter((file) => !isSystemFile(file.name))
    .map((file) => ({ file, folders: foldersOf(file.webkitRelativePath) }));
}

/** Every folder path, parents before children, each once ("A", "A/B", "A/B/C"). */
export function folderPaths(entries: readonly FolderFile[]): string[][] {
  const seen = new Map<string, string[]>();
  for (const { folders } of entries) {
    for (let depth = 1; depth <= folders.length; depth += 1) {
      const path = folders.slice(0, depth);
      seen.set(path.join('/'), path);
    }
  }
  return [...seen.values()].sort((a, b) => a.length - b.length);
}

/**
 * Creates one collection per folder, parents first, and returns folder path → collection
 * id. `create` is the Library's own create_library_collection command.
 */
export async function createFolderCollections(
  paths: readonly string[][],
  create: (input: { name: string; parentId: string | null }) => Promise<{ id: string }>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const path of paths) {
    const parentId = ids.get(path.slice(0, -1).join('/')) ?? null;
    const collection = await create({ name: path[path.length - 1] as string, parentId });
    ids.set(path.join('/'), collection.id);
  }
  return ids;
}

// ── Drag and drop ──────────────────────────────────────────────────────────────
// DataTransfer.files flattens a dropped folder to nothing; the entry API walks it.

type Entry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (resolve: (file: File) => void, reject: (error: unknown) => void) => void;
  createReader?: () => {
    readEntries: (resolve: (entries: Entry[]) => void, reject: (error: unknown) => void) => void;
  };
};

async function walk(entry: Entry, folders: string[], out: FolderFile[]): Promise<void> {
  if (isSystemFile(entry.name)) return;
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file?.(resolve, reject));
    out.push({ file, folders });
    return;
  }
  if (!entry.isDirectory || !entry.createReader) return;
  const reader = entry.createReader();
  // readEntries answers in batches (100 in Chrome) until it answers with none.
  for (;;) {
    const batch = await new Promise<Entry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return;
    for (const child of batch) await walk(child, [...folders, entry.name], out);
  }
}

/** Null when nothing dropped is a folder — the caller keeps its flat file path. */
export async function folderFilesFromDrop(
  items: DataTransferItemList,
): Promise<FolderFile[] | null> {
  const entries = Array.from(items)
    .map((item) => (item.kind === 'file' ? (item.webkitGetAsEntry() as Entry | null) : null))
    .filter((entry): entry is Entry => Boolean(entry));
  if (!entries.some((entry) => entry.isDirectory)) return null;
  const out: FolderFile[] = [];
  for (const entry of entries) await walk(entry, [], out);
  return out;
}
