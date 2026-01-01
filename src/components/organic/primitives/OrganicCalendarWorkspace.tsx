import { OrganicCalendarWorkspaceClient } from "./OrganicCalendarWorkspaceClient"
import {
  organicActivityFeed,
  organicCalendarDays,
  organicCreationSteps,
  organicEditorSlides,
  organicTrendTypes,
} from "./mock-data"
import type { OrganicTrendType } from "./types"
import type { Trend } from "@/lib/organic/trends"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"

type OrganicCalendarWorkspaceProps = {
  trendTypes?: OrganicTrendType[]
  trends?: Trend[]
  activePlatforms?: OrganicPlatformKey[]
  maxTrendSelections?: number
  brandProfileId?: string
  userId?: string
  instagramAccountId?: string
}

export function OrganicCalendarWorkspace({
  trendTypes,
  trends,
  activePlatforms,
  maxTrendSelections,
  brandProfileId,
  userId,
  instagramAccountId,
}: OrganicCalendarWorkspaceProps) {
  return (
    <OrganicCalendarWorkspaceClient
      days={organicCalendarDays}
      steps={organicCreationSteps}
      activityFeed={organicActivityFeed}
      editorSlides={organicEditorSlides}
      trendTypes={trendTypes ?? organicTrendTypes}
      trends={trends}
      activePlatforms={activePlatforms}
      maxTrendSelections={maxTrendSelections}
      brandProfileId={brandProfileId}
      userId={userId}
      instagramAccountId={instagramAccountId}
    />
  )
}
