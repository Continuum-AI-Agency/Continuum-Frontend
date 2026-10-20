import { z } from 'zod';
import { readFontNames } from './font-names';

export const HYPERFRAMES_FONT_STRETCHES = [
  'ultra-condensed',
  'extra-condensed',
  'condensed',
  'semi-condensed',
  'normal',
  'semi-expanded',
  'expanded',
  'extra-expanded',
  'ultra-expanded',
] as const;
/** Static faces only. Variable ranges and font collections need their own qualified contract. */
export const hyperframesFontFaceSchema = z
  .object({
    family: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (value) =>
          value === value.trim() &&
          new TextEncoder().encode(value).length <= 200 &&
          /^[\p{L}_][\p{L}\p{N}_. -]*$/u.test(value) &&
          ![
            'serif',
            'sans-serif',
            'monospace',
            'cursive',
            'fantasy',
            'system-ui',
            'ui-serif',
            'ui-sans-serif',
            'ui-monospace',
            'ui-rounded',
            'emoji',
            'math',
            'fangsong',
          ].includes(value.toLowerCase()),
        'Pin a concrete font family; generic CSS families require an explicit replacement',
      ),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    weight: z.number().int().min(1).max(1000),
    style: z.enum(['normal', 'italic', 'oblique']),
    stretch: z.enum(HYPERFRAMES_FONT_STRETCHES),
  })
  .strict();
export type HyperframesFontFace = z.infer<typeof hyperframesFontFaceSchema>;
export type HyperframesFontMetadata = Omit<HyperframesFontFace, 'sha256'>;

/** Family matching is case insensitive; two different byte pins may not claim one static face. */
export function hyperframesFontFaceKey(face: Omit<HyperframesFontFace, 'sha256'>): string {
  return JSON.stringify([face.family.toLowerCase(), face.weight, face.style, face.stretch]);
}

/** Read bounded static SFNT metadata with the same OS/2 and post rules as pinned fontdb 0.24.
 * This is an ingestion check, not a substitute for browser OTS and native font/glyph admission.
 * WOFF/WOFF2, collections, variable fonts and malformed or oversized names refuse explicitly.
 */
export function readHyperframesFontMetadata(input: Uint8Array): HyperframesFontMetadata | null {
  if (input.length < 12 || input.length > 16 << 20) return null;
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (![0x00010000, 0x74727565, 0x4f54544f].includes(view.getUint32(0))) return null;
  const count = view.getUint16(4);
  if (!count || count > 256 || 12 + 16 * count > input.length) return null;
  const tables = new Map<number, { offset: number; length: number }>();
  for (let index = 0; index < count; index++) {
    const at = 12 + index * 16,
      tag = view.getUint32(at),
      offset = view.getUint32(at + 8),
      length = view.getUint32(at + 12);
    if (tables.has(tag) || offset > input.length || length > input.length - offset) return null;
    tables.set(tag, { offset, length });
  }
  if (
    [
      0x66766172, 0x434f4c52, 0x4350414c, 0x43424454, 0x43424c43, 0x73626978, 0x53564720,
      0x43464632,
    ].some((tag) => tables.has(tag))
  )
    return null; // fvar: ranges are not silently reduced to a default instance.
  const names = tables.get(0x6e616d65);
  if (!names || names.length < 6) return null;
  const records = view.getUint16(names.offset + 2),
    storage = view.getUint16(names.offset + 4);
  if (records > 4096 || 6 + 12 * records > names.length || storage > names.length) return null;
  let nameBytes = 0;
  for (let index = 0; index < records; index++) {
    const at = names.offset + 6 + 12 * index,
      length = view.getUint16(at + 8),
      offset = view.getUint16(at + 10);
    nameBytes += length;
    if (length > 4096 || nameBytes > 1 << 20 || storage + offset + length > names.length)
      return null;
  }
  const family = readFontNames(input)?.family;
  if (!family || !hyperframesFontFaceSchema.shape.family.safeParse(family).success) return null;
  let weight = 400,
    style: HyperframesFontMetadata['style'] = 'normal',
    stretch: HyperframesFontMetadata['stretch'] = 'normal';
  const os2 = tables.get(0x4f532f32);
  if (os2) {
    if (os2.length < 2) return null;
    const version = view.getUint16(os2.offset),
      minimum = [78, 86, 96, 96, 96, 100][version];
    if (minimum === undefined || os2.length < minimum) return null;
    weight = view.getUint16(os2.offset + 4);
    const width = view.getUint16(os2.offset + 6),
      flags = view.getUint16(os2.offset + 62);
    if (width < 1 || width > 9) return null;
    stretch = HYPERFRAMES_FONT_STRETCHES[width - 1]!;
    style = flags & 1 ? 'italic' : version >= 4 && flags & 512 ? 'oblique' : 'normal';
  }
  const post = tables.get(0x706f7374);
  if (post) {
    if (post.length < 16) return null;
    if (style === 'normal' && view.getInt32(post.offset + 4) !== 0) style = 'italic';
  }
  if (weight < 1 || weight > 1000) return null;
  return { family, weight, style, stretch };
}
