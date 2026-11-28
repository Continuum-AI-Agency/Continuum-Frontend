// TH #23: a ~144 s export failed at 10% with "No decoded frame at the requested timeline time".
// Both customer sources had an MP4 empty edit (video starting after audio), so their first video
// frame sat at 0.023 s / 0.033 s and a decode request at source 0 came back null.
//
// `fixtures/lead-in-empty-edit.mp4` is synthetic (ffmpeg testsrc2 + sine, 1 s, 160x90) with the
// same shape: video muxed with `-itsoffset 0.023` behind audio, giving an empty edit and a first
// video frame at 0.022 s. Regenerate:
//   ffmpeg -f lavfi -i testsrc2=size=160x90:rate=30 -t 1 -c:v libx264 -bf 2 -g 30 -pix_fmt yuv420p v.mp4
//   ffmpeg -f lavfi -i sine=frequency=440:sample_rate=44100 -t 1.05 -c:a aac -b:a 32k a.m4a
//   ffmpeg -i a.m4a -itsoffset 0.023 -i v.mp4 -map 1:v -map 0:a -c copy lead-in-empty-edit.mp4
//
// Bun has no WebCodecs, so this reads the real bytes at the packet level. `EncodedPacketSink.getPacket`
// has the same "latest frame at or before t, else null" lookup `CanvasSink` decodes from; the decoded
// path is `video-editor:export:long:bench`.

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from 'mediabunny';
import { atDecodableTime, LEAD_IN_TOLERANCE_SEC, missingFrameMessage } from './sourceClock';

async function openFixture() {
  const bytes = readFileSync(join(import.meta.dir, 'fixtures/lead-in-empty-edit.mp4'));
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('fixture has no video track');
  return { sink: new EncodedPacketSink(track), firstFrameSec: await track.getFirstTimestamp() };
}

const cadence30 = Array.from({ length: 30 }, (_, frame) => frame / 30);

describe('lead-in fixture', () => {
  it('has a first video frame after 0, as the failing customer sources did', async () => {
    const { firstFrameSec } = await openFixture();
    expect(firstFrameSec).toBeGreaterThan(0.02);
    expect(firstFrameSec).toBeLessThan(LEAD_IN_TOLERANCE_SEC);
  });

  it('has no frame for the raw request at source 0 (the baseline failure)', async () => {
    const { sink } = await openFixture();
    expect(await sink.getPacket(0)).toBeNull();
  });

  it('serves every 30 fps output tick once requests go through atDecodableTime', async () => {
    const { sink, firstFrameSec } = await openFixture();
    for (const sec of cadence30) {
      const packet = await sink.getPacket(atDecodableTime(sec, firstFrameSec));
      expect(packet).not.toBeNull();
    }
    const first = await sink.getPacket(atDecodableTime(0, firstFrameSec));
    expect(first?.timestamp).toBe(firstFrameSec);
  });
});

describe('atDecodableTime', () => {
  it('moves a request inside the lead-in up to the first frame', () => {
    expect(atDecodableTime(0, 0.023)).toBe(0.023);
    expect(atDecodableTime(0.01, 0.033)).toBe(0.033);
  });

  it('leaves a request at or after the first frame alone', () => {
    expect(atDecodableTime(0.023, 0.023)).toBe(0.023);
    expect(atDecodableTime(5, 0.023)).toBe(5);
  });

  it('leaves a gap wider than the tolerance alone, so missing picture still fails loudly', () => {
    expect(atDecodableTime(0, 0.5)).toBe(0);
    expect(atDecodableTime(0, LEAD_IN_TOLERANCE_SEC + 0.001)).toBe(0);
  });
});

describe('missingFrameMessage', () => {
  it('names the source time, the timeline time and the first frame', () => {
    expect(missingFrameMessage(0, 12.5, 0.5)).toBe(
      'No decoded frame at source 0.000 s (timeline 12.500 s); the source\'s first frame is at 0.500 s.',
    );
  });
});
