// The frame rate a video file actually has, read from its own packet timing with
// Mediabunny — the same reader in the browser (player frame-stepping) and on the
// server (marker export). Nothing stores a frame rate on media.assets, and a
// guessed 30 fps puts every marker of a 25 fps edit on the wrong frame.

import { ALL_FORMATS, Input, UrlSource } from 'mediabunny';
import { type FrameRate, snapFrameRate } from './commentExport';

const SAMPLED_PACKETS = 240;

export async function measureFrameRate(url: string): Promise<FrameRate | null> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const stats = await track.computePacketStats(SAMPLED_PACKETS);
    return stats.averagePacketRate > 0 ? snapFrameRate(stats.averagePacketRate) : null;
  } finally {
    input.dispose();
  }
}
