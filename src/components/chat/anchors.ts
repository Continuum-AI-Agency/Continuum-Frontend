// The navigation model shared by every chat surface. An anchor is any point in the transcript a
// reader can jump to: a turn, or a domain milestone the agent reached mid-run. Surfaces derive
// these from their own stream frames; the shell never inspects surface-specific state.

export type TranscriptAnchorKind = 'user' | 'assistant' | 'milestone';

export type TranscriptAnchor = {
  id: string;
  kind: TranscriptAnchorKind;
  label?: string;
  at?: string;
};

const NAVIGABLE_KINDS: ReadonlySet<TranscriptAnchorKind> = new Set(['assistant', 'milestone']);

const DEFAULT_LABELS: Record<TranscriptAnchorKind, string> = {
  user: 'Your message',
  assistant: 'Response',
  milestone: 'Checkpoint',
};

export function isNavigableAnchor(anchor: TranscriptAnchor): boolean {
  return NAVIGABLE_KINDS.has(anchor.kind);
}

export function anchorLabel(anchor: TranscriptAnchor): string {
  return anchor.label ?? DEFAULT_LABELS[anchor.kind];
}

// "Next response" skips the reader's own turns — the point of the control is to move between the
// agent's outputs, not to step through every row.
export function nextNavigableAnchorId(
  anchors: readonly TranscriptAnchor[],
  currentAnchorId: string | null,
): string | null {
  const currentIndex = currentAnchorId
    ? anchors.findIndex((anchor) => anchor.id === currentAnchorId)
    : -1;

  for (let index = currentIndex + 1; index < anchors.length; index += 1) {
    const candidate = anchors[index];
    if (isNavigableAnchor(candidate)) {
      return candidate.id;
    }
  }

  return null;
}

export function previousNavigableAnchorId(
  anchors: readonly TranscriptAnchor[],
  currentAnchorId: string | null,
): string | null {
  const currentIndex = currentAnchorId
    ? anchors.findIndex((anchor) => anchor.id === currentAnchorId)
    : anchors.length;

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = anchors[index];
    if (isNavigableAnchor(candidate)) {
      return candidate.id;
    }
  }

  return null;
}
