import {
  type AiStudioComposerFrame,
  aiStudioComposerFrameSchema,
  type CanvasComposeRequest,
} from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { readNdjsonStream } from '@/lib/streaming/readNdjsonStream';

// Client for POST /api/ai-studio/canvas/compose.
//
// The frames it yields are NARRATION. The nodes the agent builds do not arrive
// here — they land in canvas_sessions and reach the canvas through
// useCanvasRealtime's postgres_changes subscription. So this client never touches
// the studio store, and a dropped frame costs a progress line, never a node.

const COMPOSE_PATH = '/api/ai-studio/canvas/compose';

export type ComposerFrameHandler = (frame: AiStudioComposerFrame) => void;

/**
 * Parse one NDJSON line into a composer frame.
 *
 * Fail-soft, deliberately: a Backend that has shipped a frame this client does not
 * know about yet must not blank the whole run. An unparseable line is dropped, a
 * line whose `type` we cannot read is dropped, and everything else is handed on.
 */
export function parseComposerFrame(line: string): AiStudioComposerFrame | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = aiStudioComposerFrameSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export interface StreamCanvasComposerOptions {
  request: CanvasComposeRequest;
  onFrame: ComposerFrameHandler;
  signal?: AbortSignal;
}

export async function streamCanvasComposer({
  request,
  onFrame,
  signal,
}: StreamCanvasComposerOptions): Promise<void> {
  const token = await getBrowserAccessToken();
  const response = await fetch(`${getApiBaseUrl()}${COMPOSE_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      detail.includes('<!DOCTYPE')
        ? 'The composer endpoint returned HTML — check the API base URL.'
        : `The composer request failed (${response.status}). ${detail.slice(0, 160)}`,
    );
  }

  await readNdjsonStream({
    reader: response.body.getReader(),
    onLine: (line) => {
      const frame = parseComposerFrame(line);
      if (frame) onFrame(frame);
    },
  });
}
