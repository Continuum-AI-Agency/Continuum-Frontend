import { OrganicCalendarWorkspaceClient } from "./OrganicCalendarWorkspaceClient"
import type { OrganicTrendType, OrganicCalendarDay, OrganicCreationStep, OrganicEditorSlide } from "./types"
import type { Trend } from "@/lib/organic/trends"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"

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

function generateCurrentWeekDays(): OrganicCalendarDay[] {
  const days: OrganicCalendarDay[] = []
  const today = new Date()
  const dayOfWeek = today.getDay() 
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(today)
  monday.setDate(today.getDate() + diffToMonday)

  const weekDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  for (let i = 0; i < 7; i++) {
    const current = new Date(monday)
    current.setDate(monday.getDate() + i)
    
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, "0")
    const date = String(current.getDate()).padStart(2, "0")
    const id = `${year}-${month}-${date}`
    
    const monthName = current.toLocaleString("en-US", { month: "short" })
    const dateLabel = `${monthName} ${current.getDate()}`

    days.push({
      id,
      label: weekDayLabels[i],
      dateLabel,
      suggestedTimes: ["9:00 AM", "1:00 PM", "5:00 PM"],
      slots: [],
    })
  }

  return days
}

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
  const days = generateCurrentWeekDays()

  return (
    <OrganicCalendarWorkspaceClient
      days={days}
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
