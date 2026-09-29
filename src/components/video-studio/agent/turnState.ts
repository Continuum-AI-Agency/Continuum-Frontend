import type {
  EditorProjectV2,
  VideoEditorAgentFrame,
  VideoEditorOpName,
  VideoEditorPoolAsset,
} from '@continuum/contracts';

// The agent panel's pure state: how a turn folds its NDJSON frames, and how @-mentions
// become exact ids the agent can act on.

export type ToolChip = {
  toolCallId: string;
  op: VideoEditorOpName;
  ok?: boolean;
  summary?: string;
};

export type Turn = {
  id: string;
  prompt: string;
  text: string;
  tools: ToolChip[];
  status: 'running' | 'done' | 'error' | 'stopped';
  error?: string;
  /** The revision the person was looking at — "Undo this turn" restores it. */
  baseRevision: number;
  committed: boolean;
  undone: boolean;
};

export type Mention = { token: string; kind: 'clip' | 'asset'; id: string; detail: string };

/** Mentioned clips and assets ride along as exact ids, so the agent never guesses one. */
export function withMentionContext(prompt: string, mentions: readonly Mention[]): string {
  const used = mentions.filter((mention) => prompt.includes(mention.token));
  if (used.length === 0) return prompt;
  const lines = used.map((mention) => `${mention.token} = ${mention.kind} ${mention.id}`);
  return `${prompt}\n\nMentioned: ${lines.join('; ')}`;
}

export function clipMentions(project: EditorProjectV2): Mention[] {
  return project.tracks.flatMap((track) =>
    track.clips.map((clip, index) => {
      const text = clip.kind === 'text' ? clip.text : undefined;
      const label = (clip.name ?? text ?? `${track.name} ${index + 1}`).slice(0, 40).trim();
      return {
        token: `@${label}`,
        kind: 'clip' as const,
        id: clip.id,
        detail: `${track.name} · ${clip.timelineStartSec.toFixed(1)} s`,
      };
    }),
  );
}

export const assetMention = (asset: VideoEditorPoolAsset): Mention => ({
  token: `@${asset.title.slice(0, 40).trim()}`,
  kind: 'asset',
  id: asset.assetId,
  detail: asset.kind,
});

export function applyFrame(turn: Turn, frame: VideoEditorAgentFrame): Turn {
  switch (frame.type) {
    case 'text_delta':
      return { ...turn, text: turn.text + frame.data.text };
    case 'tool_start':
      return {
        ...turn,
        tools: [...turn.tools, { toolCallId: frame.data.toolCallId, op: frame.data.op }],
      };
    case 'tool_result':
      return {
        ...turn,
        tools: turn.tools.map((chip) =>
          chip.toolCallId === frame.data.toolCallId
            ? { ...chip, ok: frame.data.ok, summary: frame.data.summary }
            : chip,
        ),
      };
    case 'project_revision':
      return { ...turn, committed: true };
    case 'done':
      return { ...turn, status: 'done' };
    case 'error':
      return frame.data.code === 'aborted'
        ? { ...turn, status: 'stopped' }
        : { ...turn, status: 'error', error: frame.data.message };
    default:
      return turn;
  }
}
