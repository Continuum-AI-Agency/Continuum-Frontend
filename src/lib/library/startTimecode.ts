// A QuickTime/MP4 file's own start timecode, read from its `tmcd` track: the track's
// sample description says how it counts (frames per second of timecode, drop-frame
// flag) and its first sample is the frame count the file starts at. Cameras and
// editors write it, and it is what an editor's timeline shows for the clip — so a
// marker exported without it lands an hour (or a shoot-day) away from the clip.
//
// Read over HTTP Range requests (box headers, then the `moov` box only), the same
// in the browser and on the server. Mediabunny exposes no timecode track, and
// nothing in the Library stores one.

import type { SourceTimecode } from './commentExport';

export type TimecodeTrack = { chunkOffset: number; timebase: number; dropFrame: boolean };

const MAX_MOOV_BYTES = 32 * 1024 * 1024;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(
    bytes[at] ?? 0,
    bytes[at + 1] ?? 0,
    bytes[at + 2] ?? 0,
    bytes[at + 3] ?? 0,
  );
}

type Box = { type: string; start: number; payload: number; end: number };

// The child boxes of [from, to) in `bytes`.
function children(bytes: Uint8Array, from: number, to: number): Box[] {
  const data = view(bytes);
  const boxes: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = data.getUint32(at);
    let header = 8;
    if (size === 1) {
      size = Number(data.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) break;
    boxes.push({ type: fourcc(bytes, at + 4), start: at, payload: at + header, end: at + size });
    at += size;
  }
  return boxes;
}

function child(bytes: Uint8Array, box: Box, type: string): Box | undefined {
  return children(bytes, box.payload, box.end).find((candidate) => candidate.type === type);
}

// The timecode track inside a `moov` box's bytes, or null when the file has none.
export function findTimecodeTrack(moov: Uint8Array): TimecodeTrack | null {
  const data = view(moov);
  const root = children(moov, 0, moov.byteLength).find((box) => box.type === 'moov');
  if (!root) return null;
  for (const trak of children(moov, root.payload, root.end).filter((box) => box.type === 'trak')) {
    const mdia = child(moov, trak, 'mdia');
    const hdlr = mdia && child(moov, mdia, 'hdlr');
    if (!mdia || !hdlr || fourcc(moov, hdlr.payload + 8) !== 'tmcd') continue;
    const minf = child(moov, mdia, 'minf');
    const stbl = minf && child(moov, minf, 'stbl');
    const stsd = stbl && child(moov, stbl, 'stsd');
    if (!stbl || !stsd) continue;
    // stsd: version/flags(4) entry_count(4), then the first entry:
    // size(4) 'tmcd'(4) reserved(6) data_ref_index(2) reserved(4) flags(4)
    // timescale(4) frame_duration(4) number_of_frames(1).
    const entry = stsd.payload + 8;
    if (fourcc(moov, entry + 4) !== 'tmcd') continue;
    const flags = data.getUint32(entry + 20);
    const timebase = data.getUint8(entry + 32);
    const stco = child(moov, stbl, 'stco');
    const co64 = child(moov, stbl, 'co64');
    const chunkOffset = stco
      ? data.getUint32(stco.payload + 8)
      : co64
        ? Number(data.getBigUint64(co64.payload + 8))
        : null;
    if (chunkOffset === null || timebase === 0) continue;
    return { chunkOffset, timebase, dropFrame: (flags & 0x1) === 1 };
  }
  return null;
}

type RangeReader = (start: number, endInclusive: number) => Promise<Uint8Array>;

function httpRangeReader(url: string, fetchImpl: typeof fetch): RangeReader {
  return async (start, endInclusive) => {
    const response = await fetchImpl(url, { headers: { Range: `bytes=${start}-${endInclusive}` } });
    if (!response.ok) throw new Error(`range read failed (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // A server that ignores Range sends the whole file from byte 0.
    return response.status === 206 ? bytes : bytes.subarray(start, endInclusive + 1);
  };
}

async function readMoov(read: RangeReader): Promise<Uint8Array | null> {
  let at = 0;
  for (let hops = 0; hops < 64; hops += 1) {
    const header = await read(at, at + 15);
    if (header.byteLength < 8) return null;
    const data = view(header);
    let size = data.getUint32(0);
    if (size === 1 && header.byteLength >= 16) size = Number(data.getBigUint64(8));
    const type = fourcc(header, 4);
    if (type === 'moov') {
      if (size === 0 || size > MAX_MOOV_BYTES) return null;
      return read(at, at + size - 1);
    }
    if (size < 8) return null;
    at += size;
  }
  return null;
}

// The file's start timecode, or null when it carries none (or cannot be read).
export async function readStartTimecode(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceTimecode | null> {
  const read = httpRangeReader(url, fetchImpl);
  const moov = await readMoov(read);
  const track = moov ? findTimecodeTrack(moov) : null;
  if (!track) return null;
  const sample = await read(track.chunkOffset, track.chunkOffset + 3);
  if (sample.byteLength < 4) return null;
  return { startFrame: view(sample).getUint32(0), dropFrame: track.dropFrame };
}
