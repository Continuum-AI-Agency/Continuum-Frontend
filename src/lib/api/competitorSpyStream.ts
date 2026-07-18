// Browser -> Backend NDJSON stream client for an on-demand competitor sync run.
// http.ts is JSON-only, so this uses raw fetch (same base URL + Bearer attach)
// and decodes the line-delimited frames through the shared contracts schema.

import {
  type CompetitorSpyStreamFrame,
  competitorSpyStreamFrameSchema,
  parseFrame,
} from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

export const streamCompetitorSync = async (params: {
  brandId: string;
  competitorIds?: string[];
  signal?: AbortSignal;
  onFrame: (frame: CompetitorSpyStreamFrame) => void;
}): Promise<void> => {
  const token = await getBrowserAccessToken();
  const response = await fetch(`${getApiBaseUrl()}/api/competitor-ad-spy/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      brandId: params.brandId,
      ...(params.competitorIds ? { competitorIds: params.competitorIds } : {}),
    }),
    signal: params.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`competitor_sync_stream_failed_${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flushLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const frame = parseFrame(trimmed, competitorSpyStreamFrameSchema);
    if (frame) params.onFrame(frame as CompetitorSpyStreamFrame);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      flushLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
    }
  }
  flushLine(buffer);
};

// One-click scan (POST /api/competitor-ad-spy/scan): the full discover → sync →
// analyze → aggregate → gap pipeline as an NDJSON stream. Same envelope and
// frame schema as the sync run above; the scan continues server-side if the
// client disconnects.
export const streamCompetitorScan = async (
  brandId: string,
  onFrame: (frame: CompetitorSpyStreamFrame) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const token = await getBrowserAccessToken();
  const response = await fetch(`${getApiBaseUrl()}/api/competitor-ad-spy/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ brandId }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`competitor_scan_stream_failed_${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flushLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const frame = parseFrame(trimmed, competitorSpyStreamFrameSchema);
    if (frame) onFrame(frame as CompetitorSpyStreamFrame);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      flushLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
    }
  }
  flushLine(buffer);
};
