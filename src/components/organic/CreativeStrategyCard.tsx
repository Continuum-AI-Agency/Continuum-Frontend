'use client';

// "What's Working" — the brand's data-derived winning angles/hooks, mined from its
// own top-performing posts and ads and grounded in measured performance + audience.
// Reads the materialized creative_strategy_reports row (RLS) via useCreativeStrategyReport
// and mirrors the OrganicAwarenessReportView card idiom (Radix surface + collapse +
// dashed placeholder while assembling).

import type {
  CreativeAudience,
  CreativeInsight,
  CreativeLeaderboardEntry,
} from '@continuum/contracts';
import { Box, Card, Flex, Text } from '@radix-ui/themes';
import * as React from 'react';

import { useCreativeStrategyReport } from '@/hooks/useCreativeStrategyReport';
import { cn } from '@/lib/utils';

const MAX_INSIGHTS = 6;

function audienceLine(audience: CreativeAudience | null | undefined): string | null {
  if (!audience) return null;
  if (audience.note) return audience.note;
  const seg = audience.segments[0];
  return seg ? `${seg.label}${seg.sharePct !== null ? ` (${seg.sharePct}%)` : ''}` : null;
}

function Leaderboard({ title, entries }: { title: string; entries: CreativeLeaderboardEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Box>
      <Text size="1" color="gray" className="mb-1 block uppercase tracking-wide">
        {title}
      </Text>
      <Flex gap="2" wrap="wrap">
        {entries.map((entry) => (
          <span
            key={`${title}-${entry.label}`}
            className="rounded-full border border-subtle bg-muted/40 px-2 py-0.5 text-xs"
          >
            {entry.label}
            <span className="ml-1 text-muted-foreground tabular-nums">{entry.count}</span>
          </span>
        ))}
      </Flex>
    </Box>
  );
}

function ExemplarThumbs({ insight }: { insight: CreativeInsight }) {
  const urls = insight.exemplars
    .map((exemplar) => exemplar.thumbnailRef)
    .filter((url): url is string => typeof url === 'string' && url.startsWith('http'))
    .slice(0, 4);
  if (urls.length === 0) return null;
  return (
    <Flex gap="1" className="mt-2">
      {urls.map((url, index) => (
        // biome-ignore lint/performance/noImgElement: transient signed thumbnails, not Next-optimizable
        <img
          key={`${insight.id}-thumb-${index}`}
          src={url}
          alt=""
          className="h-10 w-10 rounded-md border border-subtle object-cover"
          loading="lazy"
        />
      ))}
    </Flex>
  );
}

function InsightRow({ insight }: { insight: CreativeInsight }) {
  const audience = audienceLine(insight.audience);
  return (
    <Card variant="surface" className="border border-subtle bg-surface/95">
      <Box px="3" py="3">
        <Flex align="center" justify="between" gap="2" className="mb-1">
          <Flex align="center" gap="2" className="min-w-0">
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
              {insight.kind}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {insight.surface}
            </span>
          </Flex>
          <Text size="1" color="gray" className="shrink-0 tabular-nums">
            {Math.round(insight.confidence * 100)}%
          </Text>
        </Flex>
        <Text size="2" weight="bold" className="block leading-snug">
          {insight.label}
        </Text>
        <Text size="2" color="gray" className="mt-0.5 block leading-snug">
          {insight.recommendation}
        </Text>
        <Flex gap="3" wrap="wrap" className="mt-1.5">
          {insight.performanceSummary ? (
            <Text size="1" color="gray" className="tabular-nums">
              {insight.performanceSummary}
            </Text>
          ) : null}
          {audience ? (
            <Text size="1" className="text-accent">
              {audience}
            </Text>
          ) : null}
        </Flex>
        <ExemplarThumbs insight={insight} />
      </Box>
    </Card>
  );
}

function EmptyCard({ status }: { status: string }) {
  const message =
    status === 'empty'
      ? 'We could not find enough top posts or ads to mine yet. As your content performs, winning angles will appear here.'
      : 'Your winning angles are assembling. The flash-lite agents analyze your top posts and ads to surface the hooks and angles that work — and who they resonate with.';
  return (
    <Card variant="surface" className="border border-dashed border-subtle bg-surface/60">
      <Box px="4" py="6">
        <Text size="2" weight="medium" className="block">
          What&apos;s Working — your winning angles
        </Text>
        <Text size="1" color="gray" className="mt-1 block">
          {message}
        </Text>
      </Box>
    </Card>
  );
}

export function CreativeStrategyCard({ brandId }: { brandId?: string }) {
  const { status, report, refreshedAt } = useCreativeStrategyReport(brandId);
  const [open, setOpen] = React.useState(true);

  if (status !== 'ready' || !report || report.insights.length === 0) {
    return <EmptyCard status={status} />;
  }

  const audience = audienceLine(report.audienceSnapshot);
  const sources = report.sourceCounts;

  return (
    <Card variant="surface" className="border border-subtle bg-surface/95">
      <Box px="4" py="3">
        <Flex align="center" justify="between" gap="3">
          <Box className="min-w-0">
            <Text size="2" weight="bold" className="block">
              What&apos;s Working
            </Text>
            <Text size="1" color="gray">
              from your top {sources.topOrganicPosts} posts + {sources.topAds} ads
              {audience ? ` · audience ${audience}` : ''}
            </Text>
          </Box>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={cn(
              'rounded-md border border-subtle px-2 py-1 text-xs text-muted-foreground transition-colors',
              'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
            )}
            aria-expanded={open}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </Flex>

        {open ? (
          <div className="mt-3 grid gap-3">
            <Flex gap="4" wrap="wrap">
              <Leaderboard title="Top hooks" entries={report.hookLeaderboard} />
              <Leaderboard title="Top angles" entries={report.angleLeaderboard} />
            </Flex>
            <div className="grid gap-2 sm:grid-cols-2">
              {report.insights.slice(0, MAX_INSIGHTS).map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </div>
            {refreshedAt ? (
              <Text size="1" color="gray" className="block text-right">
                Updated {new Date(refreshedAt).toLocaleDateString()}
              </Text>
            ) : null}
          </div>
        ) : null}
      </Box>
    </Card>
  );
}
