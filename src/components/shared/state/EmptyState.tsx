// Outcome-first empty state (IMP-008). Leads with the payoff a user unlocks
// after setup, not the missing requirement. Composes the shadcn Empty
// primitives in ui/empty.tsx — it does not fork them.

import { CheckIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

type EmptyStateProps = {
  headline: string
  media?: ReactNode
  description?: string
  unlocks?: readonly string[]
  action?: ReactNode
  secondaryAction?: ReactNode
  className?: string
}

export function EmptyState({
  headline,
  media,
  description,
  unlocks,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  const hasUnlocks = unlocks !== undefined && unlocks.length > 0
  const hasActions = action !== undefined || secondaryAction !== undefined

  return (
    <Empty className={cn("gap-3", className)}>
      <EmptyHeader>
        {media !== undefined ? (
          <EmptyMedia variant="icon">{media}</EmptyMedia>
        ) : null}
        <EmptyTitle>{headline}</EmptyTitle>
        {description !== undefined ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>

      {hasUnlocks ? (
        <ul
          aria-label="What you unlock after setup"
          className="mx-auto flex max-w-sm flex-col gap-1.5 text-left"
        >
          {unlocks.map((outcome) => (
            <li
              key={outcome}
              className="flex items-start gap-2 text-xs text-muted-foreground"
            >
              <CheckIcon
                aria-hidden="true"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
              />
              <span>{outcome}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {hasActions ? (
        <EmptyContent className="flex flex-row flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
