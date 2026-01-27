import { OrganicCalendarWorkspaceClient } from "./OrganicCalendarWorkspaceClient"
import type { OrganicTrendType, OrganicCalendarDay, OrganicCreationStep, OrganicEditorSlide } from "./types"
import type { Trend } from "@/lib/organic/trends"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import { buildWeekDays, startOfWeek } from "./calendar-utils"

const defaultCreationSteps: OrganicCreationStep[] = [
  {
    id: "trends",
    title: "Review trends",
    detail: "Select high-signal topics",
    status: "active",
  },
  {
    id: "competitors",
    title: "Competitor analysis",
    detail: "Scanning recent top posts...",
    status: "upcoming",
  },
  {
    id: "agent",
    title: "Agent drafting",
    detail: "Generating content variants...",
    status: "upcoming",
  },
  {
    id: "composer",
    title: "Review & Refine",
    detail: "Polish drafts for scheduling",
    status: "upcoming",
  },
]

const defaultEditorSlides: OrganicEditorSlide[] = [
  { id: "slide-1", label: "Hook", gradient: "from-purple-500/20 to-blue-500/20" },
  { id: "slide-2", label: "Value", gradient: "from-blue-500/20 to-cyan-500/20" },
  { id: "slide-3", label: "Example", gradient: "from-cyan-500/20 to-emerald-500/20" },
  { id: "slide-4", label: "CTA", gradient: "from-emerald-500/20 to-lime-500/20" },
]

type OrganicCalendarWorkspaceProps = {
  trendTypes?: OrganicTrendType[]
  trends?: Trend[]
  activePlatforms?: OrganicPlatformKey[]
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>
  maxTrendSelections?: number
  brandProfileId?: string
  userId?: string
  instagramAccountId?: string
}

export function OrganicCalendarWorkspace({
  trendTypes = [],
  trends,
  activePlatforms,
  platformAccountIds,
  maxTrendSelections,
  brandProfileId,
  userId,
  instagramAccountId,
}: OrganicCalendarWorkspaceProps) {
  const weekStart = startOfWeek(new Date())
  const days = buildWeekDays(weekStart)

  return (
    <OrganicCalendarWorkspaceClient
      days={days}
      initialWeekStart={weekStart.toISOString()}
      steps={defaultCreationSteps}
      editorSlides={defaultEditorSlides}
      trendTypes={trendTypes}
      trends={trends}
      activePlatforms={activePlatforms}
      platformAccountIds={platformAccountIds}
      maxTrendSelections={maxTrendSelections}
      brandProfileId={brandProfileId}
      userId={userId}
      instagramAccountId={instagramAccountId}
    />
  )
}
