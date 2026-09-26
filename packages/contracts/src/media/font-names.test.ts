import { describe, expect, it } from 'bun:test';
import { readFontNames } from './font-names';

type Name = { platformId: number; languageId: number; nameId: number; text: string };

const utf16be = (text: string) =>
  Uint8Array.from(
    [...text].flatMap((char) => [char.charCodeAt(0) >> 8, char.charCodeAt(0) & 0xff]),
  );

/** A one-table sfnt whose only table is `name` — the smallest file the reader has to handle. */
function sfnt(names: readonly Name[], version = 0x00010000): Uint8Array {
  const strings = names.map((name) =>
    name.platformId === 1
      ? Uint8Array.from([...name.text].map((c) => c.charCodeAt(0)))
      : utf16be(name.text),
  );
  const nameHeader = 6 + names.length * 12;
  const nameLength = nameHeader + strings.reduce((sum, s) => sum + s.length, 0);
  const bytes = new Uint8Array(12 + 16 + nameLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, version);
  view.setUint16(4, 1);
  view.setUint32(12, 0x6e616d65);
  view.setUint32(12 + 8, 28);
  view.setUint32(12 + 12, nameLength);
  view.setUint16(28 + 2, names.length);
  view.setUint16(28 + 4, nameHeader);
  let offset = 0;
  names.forEach((name, i) => {
    const at = 28 + 6 + i * 12;
    view.setUint16(at, name.platformId);
    view.setUint16(at + 2, name.platformId === 3 ? 1 : 0);
    view.setUint16(at + 4, name.languageId);
    view.setUint16(at + 6, name.nameId);
    view.setUint16(at + 8, strings[i]!.length);
    view.setUint16(at + 10, offset);
    bytes.set(strings[i]!, 28 + nameHeader + offset);
    offset += strings[i]!.length;
  });
  return bytes;
}

describe('readFontNames', () => {
  it('reads the PostScript name a hashed filename hides, preferring the typographic family', () => {
    const file = sfnt([
      { platformId: 3, languageId: 0x409, nameId: 1, text: 'Plus Jakarta Sans Medium' },
      { platformId: 3, languageId: 0x409, nameId: 2, text: 'Regular' },
      { platformId: 3, languageId: 0x409, nameId: 4, text: 'Plus Jakarta Sans Medium' },
      { platformId: 3, languageId: 0x409, nameId: 6, text: 'PlusJakartaSans-Medium' },
      { platformId: 3, languageId: 0x409, nameId: 16, text: 'Plus Jakarta Sans' },
      { platformId: 3, languageId: 0x409, nameId: 17, text: 'Medium' },
    ]);
    expect(readFontNames(file)).toEqual({
      family: 'Plus Jakarta Sans',
      subfamily: 'Medium',
      postScriptName: 'PlusJakartaSans-Medium',
      fullName: 'Plus Jakarta Sans Medium',
    });
  });

  it('prefers the English Windows record over a Mac one, and reads a Mac-only file', () => {
    expect(
      readFontNames(
        sfnt([
          { platformId: 1, languageId: 0, nameId: 6, text: 'Sora-Mac' },
          { platformId: 3, languageId: 0x409, nameId: 6, text: 'Sora-SemiBold' },
        ]),
      )?.postScriptName,
    ).toBe('Sora-SemiBold');
    expect(
      readFontNames(sfnt([{ platformId: 1, languageId: 0, nameId: 6, text: 'Poppins-Bold' }])),
    ).toEqual({
      family: null,
      subfamily: null,
      postScriptName: 'Poppins-Bold',
      fullName: null,
    });
  });

  it('reads CFF-flavoured OpenType', () => {
    const file = sfnt(
      [{ platformId: 3, languageId: 0x409, nameId: 6, text: 'Gotham-Bold' }],
      0x4f54544f,
    );
    expect(readFontNames(file)?.postScriptName).toBe('Gotham-Bold');
  });

  it('returns null for anything that is not a desktop font, or is truncated', () => {
    expect(readFontNames(new TextEncoder().encode('wOF2 compressed tables'))).toBeNull();
    expect(readFontNames(new TextEncoder().encode('PK zip'))).toBeNull();
    expect(readFontNames(new Uint8Array(4))).toBeNull();
    const truncated = sfnt([
      { platformId: 3, languageId: 0x409, nameId: 6, text: 'X-Bold' },
    ]).subarray(0, 20);
    expect(readFontNames(truncated)).toBeNull();
  });
});
