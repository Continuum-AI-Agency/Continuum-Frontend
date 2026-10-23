import {
  type ForgeAgentFrame,
  type ForgeAgentRequest,
  forgeAgentFrameSchema,
  parseFrame,
} from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { readNdjsonStream } from '@/lib/streaming/readNdjsonStream';

// Client for POST /api/ai-studio/templates/:assetId/agent.
//
// The frames narrate; the edits are the person's authoring draft. A `draft` frame is the cue to
// reload the draft — the layers themselves never arrive over this stream. An unparseable line is
// dropped, so a Backend ahead of this client costs a line, not the turn.

export async function streamForgeAgent({
  assetId,
  request,
  onFrame,
  signal,
}: {
  assetId: string;
  request: ForgeAgentRequest;
  onFrame: (frame: ForgeAgentFrame) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const token = await getBrowserAccessToken();
  const response = await fetch(
    `${getApiBaseUrl()}/api/ai-studio/templates/${encodeURIComponent(assetId)}/agent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal,
    },
  );

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`The template agent request failed (${response.status}). ${detail.slice(0, 160)}`);
  }

  await readNdjsonStream({
    reader: response.body.getReader(),
    onLine: (line) => {
      const frame = parseFrame(line, forgeAgentFrameSchema);
      if (frame) onFrame(frame);
    },
  });
}
