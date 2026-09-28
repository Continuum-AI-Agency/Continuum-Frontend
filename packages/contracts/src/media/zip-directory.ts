// The entry names of a stored ZIP, read from its central directory with two range reads —
// never the whole file. Import-free, so the library-upload edge function imports it by path
// and the Backend imports it from @continuum/contracts; both then hand the names to
// classifyZipEntries (asset-formats.ts).

/** Reads bytes [start, end) of the stored file. */
export type ZipRangeReader = (start: number, end: number) => Promise<Uint8Array>;

/** One central-directory record: enough to classify the zip or serve one file out of it. */
export type ZipDirectoryEntry = {
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_MIN_BYTES = 22;
// The EOCD sits in the last 22 bytes plus an archive comment of at most 65,535 bytes.
const EOCD_SEARCH_BYTES = EOCD_MIN_BYTES + 0xffff;
// ponytail: a directory over 16 MB (~200k entries) reads as "not a zip" → stored as an archive.
const MAX_CENTRAL_DIRECTORY_BYTES = 16 * 1024 * 1024;

/**
 * The central directory in order, or null when the bytes are not a readable ZIP (so the
 * caller files it as a plain archive rather than guessing).
 */
export async function readZipDirectory(
  size: number,
  read: ZipRangeReader,
): Promise<ZipDirectoryEntry[] | null> {
  if (!Number.isSafeInteger(size) || size < EOCD_MIN_BYTES) return null;
  const tailStart = Math.max(0, size - EOCD_SEARCH_BYTES);
  const tail = await read(tailStart, size);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let at = tail.byteLength - EOCD_MIN_BYTES; at >= 0; at -= 1) {
    if (tailView.getUint32(at, true) === EOCD_SIGNATURE) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = tailView.getUint16(eocd + 10, true);
  const directorySize = tailView.getUint32(eocd + 12, true);
  const directoryOffset = tailView.getUint32(eocd + 16, true);
  // ponytail: ZIP64 (over 4 GB or 65,535 entries) reads as an archive; the upload cap is 500 MB.
  if (directoryOffset === 0xffffffff || entries === 0xffff) return null;
  if (
    directorySize > MAX_CENTRAL_DIRECTORY_BYTES ||
    directoryOffset + directorySize > size - (tail.byteLength - eocd)
  ) {
    return null;
  }
  const directory =
    directoryOffset >= tailStart
      ? tail.subarray(directoryOffset - tailStart, directoryOffset - tailStart + directorySize)
      : await read(directoryOffset, directoryOffset + directorySize);
  return parseCentralDirectory(directory, entries);
}

/** Entry names in directory order, or null when the bytes are not a readable ZIP. */
export async function readZipEntryNames(
  size: number,
  read: ZipRangeReader,
): Promise<string[] | null> {
  return (await readZipDirectory(size, read))?.map((entry) => entry.name) ?? null;
}

function parseCentralDirectory(
  directory: Uint8Array,
  entries: number,
): ZipDirectoryEntry[] | null {
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const decoder = new TextDecoder('utf-8');
  const records: ZipDirectoryEntry[] = [];
  let at = 0;
  for (let index = 0; index < entries; index += 1) {
    if (at + 46 > directory.byteLength) return null;
    if (view.getUint32(at, true) !== CENTRAL_HEADER_SIGNATURE) return null;
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    if (at + 46 + nameLength > directory.byteLength) return null;
    records.push({
      name: decoder.decode(directory.subarray(at + 46, at + 46 + nameLength)),
      method: view.getUint16(at + 10, true),
      flags: view.getUint16(at + 8, true),
      compressedSize: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      localHeaderOffset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return records;
}
