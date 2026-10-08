import {
  parseFrame,
  type VideoEditorAgentFrame,
  type VideoEditorAgentRequest,
  videoEditorAgentFrameSchema,
} from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { readNdjsonStream } from '@/lib/streaming/readNdjsonStream';

// Client for POST /api/ai-studio/video-projects/:projectId/agent.
//
// The frames narrate; the edits are committed revisions. A `project_revision` frame is
// the cue to refetch the project — the timeline itself never arrives over this stream.
// An unparseable line is dropped, so a Backend ahead of this client costs a line, not
// the turn.

export async function streamVideoEditorAgent({
  projectId,
  request,
  onFrame,
  signal,
}: {
  projectId: string;
  request: VideoEditorAgentRequest;
  onFrame: (frame: VideoEditorAgentFrame) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const token = await getBrowserAccessToken();
  const response = await fetch(
    `${getApiBaseUrl()}/api/ai-studio/video-projects/${encodeURIComponent(projectId)}/agent`,
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
    throw new Error(
      `The editor agent request failed (${response.status}). ${detail.slice(0, 160)}`,
    );
  }

  await readNdjsonStream({
    reader: response.body.getReader(),
    onLine: (line) => {
      const frame = parseFrame(line, videoEditorAgentFrameSchema);
      if (frame) onFrame(frame);
    },
  });
}
