import type { OrganicCalendarDraft } from "@/components/organic/primitives/types"

export function inferPostType(draft: OrganicCalendarDraft): "POST" | "REEL" | "CAROUSEL" {
  if (draft.format === "Reel" || draft.format === "Video") return "REEL"
  if (draft.format === "Carousel") return "CAROUSEL"
  return "POST"
}
