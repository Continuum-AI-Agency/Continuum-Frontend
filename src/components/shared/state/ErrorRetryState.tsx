// Error state with an inline retry (mirrors the proven message+retry pattern in
// organic/primitives/CalendarToolbar.tsx). role="alert" announces the failure;
// the retry button appears only when a handler is supplied.

import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ErrorRetryStateProps = {
  message: string
  title?: string
  onRetry?: () => void
  retryLabel?: string
  media?: ReactNode
  className?: string
}

export function ErrorRetryState({
  message,
  title = "Something went wrong",
  onRetry,
  retryLabel = "Retry",
  media,
  className,
}: ErrorRetryStateProps) {
  return (
    <Empty role="alert" className={cn("gap-3", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
          {media !== undefined ? media : <TriangleAlertIcon aria-hidden="true" />}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      {onRetry !== undefined ? (
        <EmptyContent>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <RefreshCwIcon aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            {retryLabel}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
