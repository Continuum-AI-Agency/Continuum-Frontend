import { OrganicCalendarWorkspaceClient } from "./OrganicCalendarWorkspaceClient"
import {
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
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>
  maxTrendSelections?: number
  brandProfileId?: string
  userId?: string
  instagramAccountId?: string
}

export function OrganicCalendarWorkspace({
  trendTypes,
  trends,
  activePlatforms,
  platformAccountIds,
  maxTrendSelections,
  brandProfileId,
  userId,
  instagramAccountId,
}: OrganicCalendarWorkspaceProps) {
  return (
    <OrganicCalendarWorkspaceClient
      days={organicCalendarDays}
      steps={organicCreationSteps}
      editorSlides={organicEditorSlides}
      trendTypes={trendTypes ?? organicTrendTypes}
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
