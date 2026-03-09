import {
  CircleDashed,
  Facebook,
  Instagram,
  Linkedin,
  Music2,
  Twitter,
  Youtube,
} from "lucide-react"

import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type { OrganicCalendarDay, OrganicPlatformTag } from "./types"

export type PlannerPlatformKey = OrganicPlatformTag | "x"

export type PlannerPlatform = {
  key: PlannerPlatformKey
  label: string
  shortLabel: string
  Icon: typeof Instagram
  comingSoon?: boolean
}

const PLATFORM_META: Record<PlannerPlatformKey, PlannerPlatform> = {
  instagram: {
    key: "instagram",
    label: "Instagram",
    shortLabel: "IG",
    Icon: Instagram,
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn",
    shortLabel: "IN",
    Icon: Linkedin,
  },
  youtube: {
    key: "youtube",
    label: "YouTube",
    shortLabel: "YT",
    Icon: Youtube,
  },
  facebook: {
    key: "facebook",
    label: "Facebook",
    shortLabel: "FB",
    Icon: Facebook,
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok",
    shortLabel: "TT",
    Icon: Music2,
  },
  x: {
    key: "x",
    label: "X",
    shortLabel: "X",
    Icon: Twitter,
  },
}

const SCHEDULABLE_PLATFORM_ORDER: OrganicPlatformTag[] = [
  "instagram",
  "linkedin",
]

const COMING_SOON_ORDER: PlannerPlatformKey[] = [
  "facebook",
  "youtube",
  "tiktok",
  "x",
]

export function buildPlannerPlatforms(
  activePlatforms: OrganicPlatformKey[],
  days: OrganicCalendarDay[]
): PlannerPlatform[] {
  const discoveredSchedulable = new Set<OrganicPlatformTag>([
    "instagram",
    "linkedin",
  ])

  activePlatforms.forEach((platform) => {
    if (SCHEDULABLE_PLATFORM_ORDER.includes(platform)) {
      discoveredSchedulable.add(platform)
    }
  })
  days.forEach((day) => {
    day.slots.forEach((draft) => {
      draft.platforms.forEach((platform) => {
        if (SCHEDULABLE_PLATFORM_ORDER.includes(platform)) {
          discoveredSchedulable.add(platform)
        }
      })
    })
  })

  const schedulablePlatforms = SCHEDULABLE_PLATFORM_ORDER.filter((platform) =>
    discoveredSchedulable.has(platform)
  ).map((platform) => PLATFORM_META[platform])

  const comingSoonPlatforms = COMING_SOON_ORDER.map((platform) => ({
    ...PLATFORM_META[platform],
    Icon: PLATFORM_META[platform].Icon ?? CircleDashed,
    comingSoon: true,
  }))

  return [...schedulablePlatforms, ...comingSoonPlatforms]
}
