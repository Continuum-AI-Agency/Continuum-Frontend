import type { ReactNode } from "react";
import { motion } from "motion/react";
import { WarningCircle, MinusCircle } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BreathingDot } from "./BreathingDot";
import type { SectionStatus } from "../state/agentPreview";

type CardSurfaceProps = {
  title: string;
  badge?: string;
  chips?: ReactNode;
  findings?: ReactNode;
  status?: SectionStatus | "indeterminate";
  isEmpty: boolean;
  minBodyHeight?: number;
  // When set, the body is capped at this height and scrolls — so a long
  // completed section can never stretch the card (or its grid row).
  maxBodyHeight?: number;
  skeleton?: ReactNode;
  errorMessage?: string;
  children: ReactNode;
  className?: string;
};

const DEFAULT_MIN_BODY_HEIGHT = 96;

export function CardSurface({
  title,
  badge,
  chips,
  findings,
  status = "indeterminate",
  isEmpty,
  minBodyHeight = DEFAULT_MIN_BODY_HEIGHT,
  maxBodyHeight,
  skeleton,
  errorMessage,
  children,
  className,
}: CardSurfaceProps) {
  const isLoading = isEmpty && (status === "idle" || status === "running" || status === "indeterminate");
  const isError = status === "error" && isEmpty;
  const isSkipped = status === "skipped" && isEmpty;

  let body: ReactNode;
  if (isError) {
    body = (
      <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
        <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cs-warning,#cb8e00)]" />
        <span>{errorMessage ?? "Couldn't load this section. We'll keep trying in the background."}</span>
      </div>
    );
  } else if (isSkipped) {
    body = (
      <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
        <MinusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
        <span>Section unavailable for this brand.</span>
      </div>
    );
  } else if (isLoading) {
    body = skeleton ?? <DefaultSkeleton />;
  } else {
    body = children;
  }

  // Cross-fade the body when it transitions between phases (skeleton → content,
  // etc.) so the swap reveals cleanly instead of snapping. The bounded
  // min/max-height keeps the card from resizing during the fade.
  const phaseKey = isLoading ? "loading" : isError ? "error" : isSkipped ? "skipped" : "content";

  return (
    <Card className={cn("border-border bg-card shadow-sm text-foreground", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          {isLoading ? <BreathingDot tone={isError ? "rose" : "emerald"} /> : null}
          <CardTitle className="text-[14px]">{title}</CardTitle>
        </div>
        {(chips || badge) ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {chips}
            {badge ? (
              <Badge
                variant="outline"
                className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {badge}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent
        className={cn(
          "space-y-3 text-[13px] leading-relaxed text-muted-foreground",
          maxBodyHeight ? "overflow-y-auto" : undefined,
        )}
        style={{
          minHeight: minBodyHeight,
          ...(maxBodyHeight ? { maxHeight: maxBodyHeight } : {}),
        }}
      >
        <motion.div
          key={phaseKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-3"
        >
          {body}
        </motion.div>
        {findings}
      </CardContent>
    </Card>
  );
}

function DefaultSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}
