import {
  VIDEO_EDITOR_OPS,
  type VideoEditorOpInput,
  type VideoEditorOpName,
  type VideoEditorOpOutput,
} from '@continuum/contracts';
import { http } from './http';

/**
 * Run one editor op against a project — the same op, with the same contract, that the
 * in-editor agent and the MCP `video_editor` tool run. The workspace refetches after a
 * committing op; the realtime revision subscription covers edits made elsewhere.
 */
export function runVideoEditorOp<N extends VideoEditorOpName>(
  projectId: string,
  op: N,
  input: Omit<VideoEditorOpInput<N>, 'projectId'>,
  signal?: AbortSignal,
): Promise<VideoEditorOpOutput<N>> {
  return http.request<VideoEditorOpOutput<N>>({
    path: `/api/ai-studio/video-projects/${encodeURIComponent(projectId)}/ops/${op}`,
    method: 'POST',
    body: input,
    schema: VIDEO_EDITOR_OPS[op].output,
    cache: 'no-store',
    signal,
  });
}
