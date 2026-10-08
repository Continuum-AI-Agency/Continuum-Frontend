// A QuickTime/MP4 file's own start timecode (its `tmcd` track), for the player and marker
// export. The reader is shared with the Backend media probe and lives in @continuum/contracts.

import { findTimecodeTrack, httpRangeReader, readSourceTimecode } from '@continuum/contracts';
import type { SourceTimecode } from './commentExport';

export { findTimecodeTrack };
export type { TimecodeTrack } from '@continuum/contracts';

// The file's start timecode, or null when it carries none (or cannot be read).
export async function readStartTimecode(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceTimecode | null> {
  const read = await readSourceTimecode(httpRangeReader(url, fetchImpl));
  return read ? { startFrame: read.startFrame, dropFrame: read.dropFrame } : null;
}
