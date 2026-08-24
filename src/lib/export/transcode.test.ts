// The parts of the export encoder that do not need a WebCodecs browser: the format
// catalog, the H.265 fallback rule, ZIP entry naming and the ZIP round trip. The
// encoders themselves are graded on real bytes by `studio:router-export:e2e:bench`.

import { describe, expect, it } from 'bun:test';
import {
  codecForFormat,
  DEFAULT_EXPORT_FORMAT,
  EXPORT_FORMATS,
  formatsForKind,
  GIF_MAX_EDGE,
  GIF_MAX_FPS,
  IMAGE_EXPORT_FORMATS,
  isExportFormatId,
  transcodeVideo,
  uniqueEntryNames,
  unzipToEntries,
  VIDEO_EXPORT_FORMATS,
  zipBlobs,
} from './transcode';

describe('the format catalog', () => {
  it('offers only still formats for a still and only clip formats for a clip', () => {
    expect(formatsForKind('image')).toEqual(IMAGE_EXPORT_FORMATS);
    expect(formatsForKind('video')).toEqual(VIDEO_EXPORT_FORMATS);
    for (const id of IMAGE_EXPORT_FORMATS) expect(EXPORT_FORMATS[id].kind).toBe('image');
    for (const id of VIDEO_EXPORT_FORMATS) expect(EXPORT_FORMATS[id].kind).toBe('video');
  });

  it('names every format exactly once across the two lists', () => {
    const listed = [...IMAGE_EXPORT_FORMATS, ...VIDEO_EXPORT_FORMATS];
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.sort()).toEqual(Object.keys(EXPORT_FORMATS).sort());
  });

  it('defaults each kind to a format of that kind', () => {
    expect(EXPORT_FORMATS[DEFAULT_EXPORT_FORMAT.image].kind).toBe('image');
    expect(EXPORT_FORMATS[DEFAULT_EXPORT_FORMAT.video].kind).toBe('video');
  });

  it('rejects anything that is not a known format id', () => {
    expect(isExportFormatId('png')).toBe(true);
    expect(isExportFormatId('mp4-h265')).toBe(true);
    expect(isExportFormatId('avi')).toBe(false);
    expect(isExportFormatId(undefined)).toBe(false);
    expect(isExportFormatId(null)).toBe(false);
    expect(isExportFormatId(7)).toBe(false);
  });

  it('caps GIF at 15fps and 480px', () => {
    expect(GIF_MAX_FPS).toBe(15);
    expect(GIF_MAX_EDGE).toBe(480);
  });
});

describe('codecForFormat — the H.265 fallback rule', () => {
  it('encodes hevc only when the browser can', () => {
    expect(codecForFormat('mp4-h265', true)).toEqual({ codec: 'hevc', fellBackToH264: false });
  });

  it('falls back to H.264 and says so when it cannot', () => {
    expect(codecForFormat('mp4-h265', false)).toEqual({ codec: 'avc', fellBackToH264: true });
  });

  it('never reports a fallback for a format that never asked for hevc', () => {
    for (const format of ['mp4-h264', 'mov-h264', 'video-original'] as const) {
      expect(codecForFormat(format, false)).toEqual({ codec: 'avc', fellBackToH264: false });
      expect(codecForFormat(format, true)).toEqual({ codec: 'avc', fellBackToH264: false });
    }
  });
});

describe('transcodeVideo', () => {
  it('passes the original through untouched, without loading an encoder', async () => {
    const source = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/webm' });
    const result = await transcodeVideo(source, 'video-original');
    expect(result.fellBackToH264).toBe(false);
    expect(await result.blob.arrayBuffer()).toEqual(await source.arrayBuffer());
    expect(result.blob.type).toBe('video/webm');
  });

  it('refuses a still format', async () => {
    const source = new Blob([new Uint8Array([1])], { type: 'video/mp4' });
    await expect(transcodeVideo(source, 'png')).rejects.toThrow(/not a clip format/);
  });

  it('sends GIF to its own encoder rather than the muxer', async () => {
    const source = new Blob([new Uint8Array([1])], { type: 'video/mp4' });
    await expect(transcodeVideo(source, 'gif')).rejects.toThrow(/encodeGif/);
  });
});

describe('uniqueEntryNames', () => {
  it('leaves distinct names alone', () => {
    expect(uniqueEntryNames(['a.png', 'b.png'])).toEqual(['a.png', 'b.png']);
  });

  it('suffixes before the extension so the file still opens', () => {
    expect(uniqueEntryNames(['shot.png', 'shot.png', 'shot.png'])).toEqual([
      'shot.png',
      'shot (2).png',
      'shot (3).png',
    ]);
  });

  it('does not collide with a name the caller already used for the suffix', () => {
    const names = uniqueEntryNames(['shot.png', 'shot (2).png', 'shot.png']);
    expect(new Set(names).size).toBe(3);
    expect(names[2]).toBe('shot (3).png');
  });

  it('handles extensionless names', () => {
    expect(uniqueEntryNames(['clip', 'clip'])).toEqual(['clip', 'clip (2)']);
  });
});

describe('zipBlobs', () => {
  it('round-trips every entry byte for byte', async () => {
    const first = new Uint8Array([1, 2, 3, 4, 5]);
    const second = new Uint8Array([9, 8, 7]);
    const zip = await zipBlobs([
      { name: 'one.png', blob: new Blob([first]) },
      { name: 'two.png', blob: new Blob([second]) },
    ]);
    expect(zip.type).toBe('application/zip');

    const entries = unzipToEntries(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual(['one.png', 'two.png']);
    expect(entries['one.png']).toEqual(first);
    expect(entries['two.png']).toEqual(second);
  });

  it('keeps both copies when two entries share a name', async () => {
    const zip = await zipBlobs([
      { name: 'same.png', blob: new Blob([new Uint8Array([1])]) },
      { name: 'same.png', blob: new Blob([new Uint8Array([2])]) },
    ]);
    const entries = unzipToEntries(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual(['same (2).png', 'same.png']);
    expect(entries['same.png']).toEqual(new Uint8Array([1]));
    expect(entries['same (2).png']).toEqual(new Uint8Array([2]));
  });

  it('refuses an empty bundle rather than writing a zero-entry ZIP', async () => {
    await expect(zipBlobs([])).rejects.toThrow(/Nothing to zip/);
  });
});
