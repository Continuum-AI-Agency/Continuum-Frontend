// Attach-wins guard (Frontend mirror of the backend guard in realizeImageMedia).
// Once the user attaches their own creative mid-generation the draft is
// user_supplied and FINAL: no in-flight realization frame may overwrite it. This
// keeps the user's media exactly as the backend discards any late generated
// result, so clicking "Generate" can never clobber a creative the user assigned.

import type { OrganicCalendarDraft } from "@/components/organic/primitives/types"

type UpdateDraft = (
  draftId: string,
  updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
) => void

export function patchUnlessUserSupplied(
  updateDraft: UpdateDraft,
  draftId: string,
  patch: (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
): void {
  updateDraft(draftId, (draft) =>
    draft.mediaSuggestion?.mediaStatus === "user_supplied" ? draft : patch(draft),
  )
}
