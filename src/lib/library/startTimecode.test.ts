import { describe, expect, it } from 'bun:test';
import { findTimecodeTrack, readStartTimecode } from './startTimecode';

// Minimal ISO-BMFF writer for the handful of boxes the reader walks.
function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set(new TextEncoder().encode(type), 4);
  let at = 8;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

function u32(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  values.forEach((value, i) => new DataView(out.buffer).setUint32(i * 4, value));
  return out;
}

function tmcdTrack(chunkOffset: number, flags: number, timebase: number): Uint8Array {
  const entry = new Uint8Array(34);
  const data = new DataView(entry.buffer);
  data.setUint32(0, 34);
  entry.set(new TextEncoder().encode('tmcd'), 4);
  data.setUint16(14, 1);
  data.setUint32(20, flags);
  data.setUint32(24, 30000);
  data.setUint32(28, 1001);
  data.setUint8(32, timebase);
  const hdlr = box('hdlr', u32(0, 0), new TextEncoder().encode('tmcd'), u32(0, 0, 0));
  const stsd = box('stsd', u32(0, 1), entry);
  const stco = box('stco', u32(0, 1, chunkOffset));
  return box('trak', box('mdia', hdlr, box('minf', box('stbl', stsd, stco))));
}

function videoTrack(): Uint8Array {
  const hdlr = box('hdlr', u32(0, 0), new TextEncoder().encode('vide'), u32(0, 0, 0));
  return box('trak', box('mdia', hdlr));
}

describe('findTimecodeTrack', () => {
  it('finds the tmcd track among others and reads its drop-frame flag and base', () => {
    const moov = box('moov', videoTrack(), tmcdTrack(4096, 1, 30));
    expect(findTimecodeTrack(moov)).toEqual({ chunkOffset: 4096, timebase: 30, dropFrame: true });
  });

  it('reads a non-drop track', () => {
    expect(findTimecodeTrack(box('moov', tmcdTrack(10, 0, 25)))?.dropFrame).toBe(false);
  });

  it('answers null for a file without a timecode track', () => {
    expect(findTimecodeTrack(box('moov', videoTrack()))).toBeNull();
  });
});

describe('readStartTimecode', () => {
  it('walks box headers to moov and reads the first timecode sample', async () => {
    const ftyp = box('ftyp', new TextEncoder().encode('isom'), u32(0));
    const sample = u32(107892);
    const mdatStart = ftyp.byteLength;
    const mdat = box('mdat', sample, new Uint8Array(1000));
    const moov = box('moov', videoTrack(), tmcdTrack(mdatStart + 8, 1, 30));
    const file = new Uint8Array(ftyp.byteLength + mdat.byteLength + moov.byteLength);
    file.set(ftyp, 0);
    file.set(mdat, ftyp.byteLength);
    file.set(moov, ftyp.byteLength + mdat.byteLength);
    const requests: string[] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('Range') ?? '';
      requests.push(range);
      const [start, end] = range.replace('bytes=', '').split('-').map(Number);
      return new Response(file.slice(start, (end ?? file.length - 1) + 1), { status: 206 });
    }) as unknown as typeof fetch;
    expect(await readStartTimecode('https://storage/clip.mov', fakeFetch)).toEqual({
      startFrame: 107892,
      dropFrame: true,
    });
    // Headers, the moov box and one sample — never the media data.
    expect(requests.length).toBeLessThanOrEqual(5);
  });
});
