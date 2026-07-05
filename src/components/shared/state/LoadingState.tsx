// Explicit loading state (BUG-028/IMP-031). Announces itself as busy via
// role="status" + aria-busy so a skeleton is never mistaken for absent data.
// Renders shimmer Skeleton bars by default; pass children to shape the skeleton
// to the real layout it stands in for.

import type { ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type LoadingStateProps = {
  label?: string
  lines?: number
  children?: ReactNode
  className?: string
}

export function LoadingState({
  label = "Loading",
  lines = 3,
  children,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn("w-full space-y-2", className)}
    >
      <span className="sr-only">{label}</span>
      {children !== undefined
        ? children
        : Array.from({ length: lines }, (_, index) => (
            <Skeleton
              key={index}
              className={cn("h-4 w-full", index === lines - 1 && "w-2/3")}
            />
          ))}
    </div>
  )
}
