// What a font file says it is, read from its own OpenType `name` table.
//
// Why this exists: After Effects packages ship fonts under hashed filenames
// (`2f0cf1733d838e005b2ef333cfea82b6.ttf`), and a template asks for a face by its PostScript
// name (`PlusJakartaSans-Bold`). A family guessed from the filename can never match, so every
// font a client sent us read as "not uploaded". The name table is the only identity a font
// file carries that survives being renamed. Pure and dependency-free so the browser (prefill
// the upload dialog) and the Backend (index the face) read it the same way.

export interface FontNames {
  /** Typographic family (nameID 16) when present, else the legacy family (nameID 1). */
  family: string | null;
  /** Typographic subfamily (nameID 17) when present, else nameID 2 — "Bold", "SemiBold Italic". */
  subfamily: string | null;
  /** nameID 6 — what After Effects and the AEP parse call this face. */
  postScriptName: string | null;
  /**
   * nameID 4 — "Poppins ExtraBold". Unique per face, which is why Windows files a font in its
   * registry under it; a family name is shared by every weight and collides there.
   */
  fullName: string | null;
}

const TRUETYPE = 0x00010000;
const TRUE_TAG = 0x74727565; // 'true' — legacy Apple TrueType
const OTTO_TAG = 0x4f54544f; // 'OTTO' — CFF-flavoured OpenType
const NAME_TAG = 0x6e616d65; // 'name'

const WINDOWS = 3;
const MAC = 1;
const UNICODE = 0;
const EN_US = 0x409;

interface NameRecord {
  platformId: number;
  languageId: number;
  nameId: number;
  text: string;
}

function decodeUtf16be(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i + 1 < bytes.length; i += 2)
    text += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
  return text;
}

/** Mac Roman is ASCII below 0x80, which is every PostScript name by definition. */
function decodeMacRoman(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function readRecords(view: DataView, bytes: Uint8Array, nameOffset: number): NameRecord[] {
  const count = view.getUint16(nameOffset + 2);
  const storage = nameOffset + view.getUint16(nameOffset + 4);
  const records: NameRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = nameOffset + 6 + i * 12;
    if (at + 12 > view.byteLength) break;
    const platformId = view.getUint16(at);
    const length = view.getUint16(at + 8);
    const start = storage + view.getUint16(at + 10);
    if (start + length > bytes.length) continue;
    const raw = bytes.subarray(start, start + length);
    const text = (platformId === MAC ? decodeMacRoman(raw) : decodeUtf16be(raw))
      .replace(/\0/g, '')
      .trim();
    if (text) {
      records.push({
        platformId,
        languageId: view.getUint16(at + 4),
        nameId: view.getUint16(at + 6),
        text,
      });
    }
  }
  return records;
}

/** English Windows first — the record every tool agrees on — then any Windows, Mac, Unicode. */
function pick(records: readonly NameRecord[], nameId: number): string | null {
  const withId = records.filter((record) => record.nameId === nameId);
  const rank = (record: NameRecord) =>
    record.platformId === WINDOWS && record.languageId === EN_US
      ? 0
      : record.platformId === WINDOWS
        ? 1
        : record.platformId === MAC
          ? 2
          : record.platformId === UNICODE
            ? 3
            : 4;
  return [...withId].sort((a, b) => rank(a) - rank(b))[0]?.text ?? null;
}

/**
 * The names a TrueType/OpenType file carries, or null for anything else.
 *
 * WOFF/WOFF2 return null on purpose: their tables are compressed, and an After Effects
 * package ships desktop TTF/OTF. A collection (`ttcf`) is null too — the store refuses those.
 */
export function readFontNames(input: Uint8Array | ArrayBuffer): FontNames | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0);
  if (version !== TRUETYPE && version !== TRUE_TAG && version !== OTTO_TAG) return null;

  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i += 1) {
    const at = 12 + i * 16;
    if (at + 16 > bytes.length) return null;
    if (view.getUint32(at) !== NAME_TAG) continue;
    const nameOffset = view.getUint32(at + 8);
    if (nameOffset + 6 > bytes.length) return null;
    const records = readRecords(view, bytes, nameOffset);
    return {
      family: pick(records, 16) ?? pick(records, 1),
      subfamily: pick(records, 17) ?? pick(records, 2),
      postScriptName: pick(records, 6),
      fullName: pick(records, 4),
    };
  }
  return null;
}
