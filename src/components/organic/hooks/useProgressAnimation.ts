"use client"

import * as React from "react"
import { useReducedMotion } from "motion/react"

const STAGE_CEILINGS: Record<string, number> = {
  queued: 14,
  concepting: 29,
  drafting: 54,
  generating_assets: 59,
  reviewing: 74,
  revising: 94,
  merging: 99,
}

function resolveStageCeiling(stage: string | undefined): number {
  if (!stage) return 14
  return STAGE_CEILINGS[stage] ?? 99
}

export function useProgressAnimation(
  progress: number | undefined,
  stage: string | undefined
): number | undefined {
  const reduceMotion = useReducedMotion()
  const [displayProgress, setDisplayProgress] = React.useState<number | undefined>(progress)

  // Sync: snap up when progress jumps ahead, or clear when generation ends
  React.useEffect(() => {
    if (progress === undefined) {
      setDisplayProgress(undefined)
      return
    }
    setDisplayProgress((prev) => {
      if (prev === undefined) return progress
      return Math.max(prev, progress)
    })
  }, [progress, stage])

  // Tick up 1%/sec, capped at current stage ceiling
  React.useEffect(() => {
    if (reduceMotion || displayProgress === undefined) return

    const id = setInterval(() => {
      setDisplayProgress((prev) => {
        if (prev === undefined) return prev
        const ceiling = resolveStageCeiling(stage)
        return prev < ceiling ? prev + 1 : prev
      })
    }, 1000)

    return () => clearInterval(id)
  }, [reduceMotion, displayProgress, stage])

  if (reduceMotion) return progress
  return displayProgress
}
