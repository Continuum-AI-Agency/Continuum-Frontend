"use client";

import { format, parseISO } from "date-fns";
import { AlertCircle, Loader2, X } from "lucide-react";
import { Badge } from "@radix-ui/themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AgentJobState } from "./types";

type JobGridProps = {
  jobs: AgentJobState[];
  onRetryAction?: (jobId: string) => void;
  onCancelAction?: (jobId: string) => void;
};

function formatScheduledAt(scheduledAt: string | undefined): string {
  if (!scheduledAt) return "";
  try {
    return format(parseISO(scheduledAt), "EEE MMM d, h:mm a");
  } catch {
    return scheduledAt;
  }
}

function PlatformBadge({ platform }: { platform: string | undefined }) {
  if (!platform) return null;
  return (
    <Badge variant="soft" color="indigo" size="1">
      {platform}
    </Badge>
  );
}

function JobCard({
  job,
  onRetryAction,
  onCancelAction,
}: {
  job: AgentJobState;
  onRetryAction?: (jobId: string) => void;
  onCancelAction?: (jobId: string) => void;
}) {
  const scheduledLabel = formatScheduledAt(job.scheduledAt);

  if (job.status === "queued") {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <PlatformBadge platform={job.platform} />
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="soft" color="gray" size="1">Queued</Badge>
              {onCancelAction && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 text-muted-foreground"
                  onClick={() => onCancelAction(job.jobId)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          {scheduledLabel && (
            <p className="text-xs text-muted-foreground">{scheduledLabel}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (job.status === "running") {
    const stageLabel =
      typeof job.stage === "string" && job.stage
        ? job.stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "Working";
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <PlatformBadge platform={job.platform} />
            <div className="flex items-center gap-1">
              <Badge variant="soft" color="amber" size="1">{stageLabel}</Badge>
              {onCancelAction && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 text-muted-foreground"
                  onClick={() => onCancelAction(job.jobId)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-3/5 animate-pulse rounded-full bg-amber-400" />
          </div>
          {job.agentName && (
            <p className="truncate text-xs text-muted-foreground">{job.agentName}</p>
          )}
          {scheduledLabel && (
            <p className="text-xs text-muted-foreground">{scheduledLabel}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (job.status === "completed") {
    const card = job.uiPostCard;
    const caption = card?.caption ?? job.placement?.copy?.caption ?? "";
    const hashtags = card?.hashtags ?? [];
    const quality = card?.quality ?? null;
    const format = card?.format ?? null;
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <PlatformBadge platform={job.platform} />
              {format && (
                <Badge variant="soft" color="gray" size="1">{format}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {quality != null && (
                <Badge variant="soft" color={quality.passed ? "green" : "orange"} size="1">
                  {Math.round(quality.score * 100)}%
                </Badge>
              )}
              <Badge variant="soft" color="green" size="1">Ready</Badge>
            </div>
          </div>
          {caption && (
            <p className="line-clamp-2 text-xs text-foreground">{caption}</p>
          )}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {hashtags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {tag.startsWith("#") ? tag : `#${tag}`}
                </span>
              ))}
              {hashtags.length > 3 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  +{hashtags.length - 3}
                </span>
              )}
            </div>
          )}
          {scheduledLabel && (
            <p className="text-xs text-muted-foreground">{scheduledLabel}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (job.status === "failed") {
    return (
      <Card className="overflow-hidden border-destructive/30">
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              <PlatformBadge platform={job.platform} />
            </div>
            <Badge variant="soft" color="red" size="1">Failed</Badge>
          </div>
          {job.error?.message && (
            <p className="line-clamp-2 text-xs text-destructive/80">{job.error.message}</p>
          )}
          {onRetryAction && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              onClick={() => onRetryAction(job.jobId)}
            >
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden opacity-50">
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <PlatformBadge platform={job.platform} />
          <Badge variant="soft" color="gray" size="1">Cancelled</Badge>
        </div>
        {scheduledLabel && (
          <p className="text-xs text-muted-foreground">{scheduledLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function JobGrid({ jobs, onRetryAction, onCancelAction }: JobGridProps) {
  if (jobs.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {jobs.map((job) => (
        <JobCard
          key={job.jobId}
          job={job}
          onRetryAction={onRetryAction}
          onCancelAction={onCancelAction}
        />
      ))}
    </div>
  );
}
