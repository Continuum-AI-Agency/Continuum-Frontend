import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';

// The generated hook lives inside the draft's stored generation context — either at
// the placement level (mediaSuggestion.generationContext) or, for per-slide carousels,
// on the first asset. storyHook is the reel/story opener; hook is the copy opener.
// Returns null for a draft the agent never generated (no context yet).
export function resolveDraftHook(draft: OrganicCalendarDraft): string | null {
  const fromPlacement = draft.mediaSuggestion?.generationContext?.creativeDirection;
  const fromAsset = draft.mediaSuggestion?.assets?.[0]?.generationContext?.creativeDirection;
  const candidate =
    fromPlacement?.storyHook ??
    fromPlacement?.hook ??
    fromAsset?.storyHook ??
    fromAsset?.hook ??
    null;
  const trimmed = candidate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
