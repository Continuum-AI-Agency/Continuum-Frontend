'use client';

import { format, parseISO } from 'date-fns';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromPreviewUrls } from '@/components/chat/media/media';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useDraftRealizedImages, useDraftStoryboard } from '../hooks/useDraftStoryboard';
import type { AgentJobState } from './types';

type JobGridProps = {
  jobs: AgentJobState[];
  onRetryAction?: (jobId: string) => void;
  onCancelAction?: (jobId: string) => void;
};

function formatScheduledAt(scheduledAt: string | undefined): string {
  if (!scheduledAt) return '';
  try {
    return format(parseISO(scheduledAt), 'EEE MMM d, h:mm a');
  } catch {
    return scheduledAt;
  }
}

function PlatformBadge({ platform }: { platform: string | undefined }) {
  if (!platform) return null;
  return <Pill variant="violet">{platform}</Pill>;
}

function toQualityPercent(score: number | undefined | null): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return score <= 1 ? Math.round(score * 100) : Math.round(score);
}

function getCombinedHashtags(job: AgentJobState, fallbackHashtags: string[]): string[] {
  if (fallbackHashtags.length > 0) return fallbackHashtags;
  const hashtags = job.placement?.copy?.hashtags;
  if (!hashtags) return [];
  return [...(hashtags.high ?? []), ...(hashtags.medium ?? []), ...(hashtags.low ?? [])];
}

type PlacementQualityDetails = {
  passed: boolean | null;
  overallScore: number | null;
  summary: string | null;
  requiredFixes: string[];
  blockingIssues: string[];
};

function getPlacementQualityDetails(job: AgentJobState): PlacementQualityDetails {
  const quality = (job.placement as { quality?: unknown } | undefined)?.quality;
  if (!quality || typeof quality !== 'object') {
    return {
      passed: null,
      overallScore: null,
      summary: null,
      requiredFixes: [],
      blockingIssues: [],
    };
  }

  const record = quality as Record<string, unknown>;
  return {
    passed: typeof record.passed === 'boolean' ? record.passed : null,
    overallScore: typeof record.overallScore === 'number' ? record.overallScore : null,
    summary: typeof record.summary === 'string' ? record.summary : null,
    requiredFixes: Array.isArray(record.requiredFixes)
      ? record.requiredFixes.filter((value): value is string => typeof value === 'string')
      : [],
    blockingIssues: Array.isArray(record.blockingIssues)
      ? record.blockingIssues.filter((value): value is string => typeof value === 'string')
      : [],
  };
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
  // Durable media from the persisted draft (re-signed on calendar load) — the
  // reliable source for restored sessions, where the signed URLs baked into old
  // chat frames have long expired.
  const draftStoryboard = useDraftStoryboard(job.draftId);
  const draftRealized = useDraftRealizedImages(job.draftId);

  if (job.status === 'queued') {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <PlatformBadge platform={job.platform} />
            </div>
            <div className="flex items-center gap-1">
              <Pill variant="muted">Queued</Pill>
              {onCancelAction && (
                <Button
                  aria-label="Cancel queued generation"
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
          {scheduledLabel && <p className="text-xs text-muted-foreground">{scheduledLabel}</p>}
        </CardContent>
      </Card>
    );
  }

  if (job.status === 'running') {
    const stageLabel =
      typeof job.stage === 'string' && job.stage
        ? job.stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : 'Working';
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <PlatformBadge platform={job.platform} />
            <div className="flex items-center gap-1">
              <Pill variant="warning">{stageLabel}</Pill>
              {onCancelAction && (
                <Button
                  aria-label="Cancel running generation"
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
            {typeof job.pct === 'number' ? (
              <div
                className="h-full rounded-full bg-amber-400 transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(5, Math.min(100, job.pct))}%` }}
              />
            ) : (
              <div className="h-full w-3/5 animate-pulse rounded-full bg-amber-400" />
            )}
          </div>
          {job.agentName && (
            <p className="truncate text-xs text-muted-foreground">{job.agentName}</p>
          )}
          {scheduledLabel && <p className="text-xs text-muted-foreground">{scheduledLabel}</p>}
        </CardContent>
      </Card>
    );
  }

  if (job.status === 'completed') {
    const card = job.uiPostCard;
    const placementQuality = getPlacementQualityDetails(job);
    const caption = card?.caption ?? job.placement?.copy?.caption ?? '';
    const hashtags = getCombinedHashtags(job, card?.hashtags ?? []);
    const score = toQualityPercent(card?.quality?.score ?? placementQuality.overallScore);
    const passed = card?.quality?.passed ?? placementQuality.passed ?? false;
    const format =
      card?.format ?? job.placement?.content?.format ?? job.placement?.content?.type ?? null;
    const qualitySummary = placementQuality.summary;
    const requiredFixes = placementQuality.requiredFixes;
    const blockingIssues = placementQuality.blockingIssues;
    const creativeIdea = job.placement?.creative?.creativeIdea ?? null;
    const mediaPrompt = job.placement?.creative?.mediaSuggestion?.prompt ?? null;
    const cta = job.placement?.content?.cta ?? null;
    const trendId = card?.trendId ?? job.placement?.seed?.trendId ?? job.trendId ?? null;
    const topic = card?.topic ?? job.placement?.content?.titleTopic ?? null;
    // FRESH draft-derived URLs first (realized final media, then storyboard —
    // both re-signed on calendar load), THEN the frame-payload URLs. The frame
    // URLs are only fresh during a live stream; in a restored session they are
    // days-old signed URLs that render as dead gray tiles. Never base64.
    const thumbnailUrl =
      draftRealized[0] ??
      draftStoryboard[0] ??
      job.placement?.publishingAssets?.find(
        (asset) => typeof asset.storageUrl === 'string' && asset.storageUrl.length > 0,
      )?.storageUrl ??
      job.previewImages?.[0] ??
      null;

    const previewCard = (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <PlatformBadge platform={job.platform} />
              {format && <Pill variant="muted">{format}</Pill>}
            </div>
            <div className="flex items-center gap-1">
              {score != null && <Pill variant={passed ? 'success' : 'warning'}>{score}%</Pill>}
              <Pill variant="success">Ready</Pill>
            </div>
          </div>
          {thumbnailUrl && (
            <div className="aspect-[4/5] w-full overflow-hidden rounded-md outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
              <ChatMediaThumb
                media={mediaFromPreviewUrls(`job:${job.jobId}`, [thumbnailUrl], format)[0]}
                className="rounded-none"
                fallbackSeed={topic ?? caption}
              />
            </div>
          )}
          {caption && <p className="line-clamp-2 text-xs text-foreground">{caption}</p>}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {hashtags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
                >
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </span>
              ))}
              {hashtags.length > 3 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
                  +{hashtags.length - 3}
                </span>
              )}
            </div>
          )}
          {scheduledLabel && <p className="text-xs text-muted-foreground">{scheduledLabel}</p>}
        </CardContent>
      </Card>
    );

    return (
      <HoverCard openDelay={120}>
        <HoverCardTrigger asChild>
          <div>{previewCard}</div>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-[380px] space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <PlatformBadge platform={job.platform} />
            {format && <Pill variant="muted">{format}</Pill>}
            {score != null && (
              <Pill variant={passed ? 'success' : 'warning'}>Quality {score}%</Pill>
            )}
            {topic && <Pill variant="violet">{topic}</Pill>}
          </div>

          {caption && (
            <div className="space-y-1">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Caption
              </p>
              <p className="max-h-24 overflow-y-auto text-xs leading-relaxed text-foreground">
                {caption}
              </p>
            </div>
          )}

          {qualitySummary && (
            <div className="space-y-1">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quality Summary
              </p>
              <p className="text-xs leading-relaxed text-foreground">{qualitySummary}</p>
            </div>
          )}

          {requiredFixes.length > 0 && (
            <div className="space-y-1">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Required Fixes
              </p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-foreground">
                {requiredFixes.slice(0, 4).map((fix: string, index: number) => (
                  <li key={`${job.jobId}-fix-${index}`}>{fix}</li>
                ))}
              </ul>
            </div>
          )}

          {blockingIssues.length > 0 && (
            <div className="space-y-1">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Blocking Issues
              </p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-destructive">
                {blockingIssues.slice(0, 4).map((issue: string, index: number) => (
                  <li key={`${job.jobId}-block-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {(creativeIdea || mediaPrompt || cta || trendId) && (
            <div className="space-y-1">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Creative Context
              </p>
              {creativeIdea && (
                <p className="text-xs leading-relaxed text-foreground">
                  <span className="font-medium">Idea:</span> {creativeIdea}
                </p>
              )}
              {mediaPrompt && (
                <p className="text-xs leading-relaxed text-foreground">
                  <span className="font-medium">Prompt:</span> {mediaPrompt}
                </p>
              )}
              {cta && (
                <p className="text-xs leading-relaxed text-foreground">
                  <span className="font-medium">CTA:</span> {cta}
                </p>
              )}
              {trendId && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium">Trend:</span> {trendId}
                </p>
              )}
            </div>
          )}
        </HoverCardContent>
      </HoverCard>
    );
  }

  if (job.status === 'failed') {
    return (
      <Card className="overflow-hidden border-destructive/30">
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              <PlatformBadge platform={job.platform} />
            </div>
            <Pill variant="destructive">Failed</Pill>
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
          <Pill variant="muted">Cancelled</Pill>
        </div>
        {scheduledLabel && <p className="text-xs text-muted-foreground">{scheduledLabel}</p>}
      </CardContent>
    </Card>
  );
}

const MAX_INLINE_JOBS = 4;
const JOB_STATUS_RANK: Record<string, number> = {
  running: 0,
  queued: 1,
  failed: 2,
  completed: 3,
  cancelled: 4,
};

export function JobGrid({ jobs, onRetryAction, onCancelAction }: JobGridProps) {
  if (jobs.length === 0) return null;
  // Cap inline cards at 4 (active first); the rest live in the shell-wide
  // Generations panel so a large batch doesn't dominate the chat.
  const ordered = [...jobs].sort(
    (a, b) => (JOB_STATUS_RANK[a.status] ?? 9) - (JOB_STATUS_RANK[b.status] ?? 9),
  );
  const visible = ordered.slice(0, MAX_INLINE_JOBS);
  const overflow = ordered.length - visible.length;
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,180px))] gap-2">
        {visible.map((job) => (
          <JobCard
            key={job.jobId}
            job={job}
            onRetryAction={onRetryAction}
            onCancelAction={onCancelAction}
          />
        ))}
      </div>
      {overflow > 0 && (
        <p className="px-0.5 text-xs text-muted-foreground">
          +{overflow} more in the Generations panel above
        </p>
      )}
    </div>
  );
}
