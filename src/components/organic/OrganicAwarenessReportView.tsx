"use client";

import * as React from "react";
import { Box, Card, Flex, Text } from "@radix-ui/themes";
import type {
  OrganicAwarenessBlock,
  OrganicAwarenessReportPayload,
} from "@continuum/contracts";

import { cn } from "@/lib/utils";

type TopPost = {
  id: string;
  mediaProductType: string | null;
  hookRate: number | null;
  views: number | null;
  reach: number | null;
};

type ContentTypeRow = {
  contentType: string;
  posts?: number;
  reach?: number;
  views?: number;
  engagement?: number;
};

const nf = new Intl.NumberFormat("en-US");

function SummaryBlock({ data }: { data: Record<string, unknown> }) {
  const metrics: Array<{ label: string; value: number }> = [
    { label: "Reach", value: Number(data.reach ?? 0) },
    { label: "Views", value: Number(data.views ?? 0) },
    { label: "Engagement", value: Number(data.engagement ?? 0) },
    { label: "Comments", value: Number(data.comments ?? 0) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg bg-muted/40 px-3 py-2">
          <Text size="5" weight="bold" className="block tabular-nums tracking-tight">
            {nf.format(metric.value)}
          </Text>
          <Text size="1" color="gray" className="leading-none">
            {metric.label}
          </Text>
        </div>
      ))}
    </div>
  );
}

function hookToneClass(hookRate: number | null): string {
  if (hookRate === null) return "text-muted-foreground";
  if (hookRate >= 40) return "text-emerald-600 dark:text-emerald-400";
  if (hookRate >= 25) return "text-blue-600 dark:text-blue-400";
  if (hookRate >= 15) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function TopPostsBlock({ posts }: { posts: TopPost[] }) {
  if (posts.length === 0) {
    return <Text size="1" color="gray">No reel hook rates available for this window yet.</Text>;
  }
  return (
    <ul className="divide-y divide-border/60">
      {posts.map((post, index) => (
        <li key={post.id || index} className="flex items-center justify-between gap-3 py-2">
          <Flex align="center" gap="2" className="min-w-0">
            <Text size="1" color="gray" className="w-4 shrink-0 tabular-nums">
              {index + 1}
            </Text>
            <span className="truncate text-xs capitalize">
              {(post.mediaProductType ?? "post").toLowerCase()}
            </span>
          </Flex>
          <Flex align="center" gap="4" className="shrink-0">
            <Text size="1" color="gray" className="tabular-nums">
              {post.views !== null ? `${nf.format(post.views)} views` : "—"}
            </Text>
            <span className={cn("text-xs font-semibold tabular-nums", hookToneClass(post.hookRate))}>
              {post.hookRate !== null ? `${post.hookRate.toFixed(1)}% hook` : "no hook data"}
            </span>
          </Flex>
        </li>
      ))}
    </ul>
  );
}

function ContentTypeBlock({ rows }: { rows: ContentTypeRow[] }) {
  const withViews = rows.filter((row) => (row.views ?? 0) > 0);
  if (withViews.length === 0) {
    return <Text size="1" color="gray">No content-type performance for this window.</Text>;
  }
  const max = Math.max(...withViews.map((row) => row.views ?? 0), 1);
  return (
    <ul className="space-y-1.5">
      {withViews.map((row) => (
        <li key={row.contentType} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs capitalize">{row.contentType}</span>
          <span
            className="h-2 rounded-full bg-accent/70"
            style={{ width: `${((row.views ?? 0) / max) * 100}%` }}
          />
          <Text size="1" color="gray" className="tabular-nums">
            {nf.format(row.views ?? 0)}
          </Text>
        </li>
      ))}
    </ul>
  );
}

function NarrativeBlock({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {lines.map((line, index) => (
        <li key={index} className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/70" />
          <Text size="2" className="leading-snug">
            {line}
          </Text>
        </li>
      ))}
    </ul>
  );
}

function AwarenessBlockCard({ block }: { block: OrganicAwarenessBlock }) {
  const data = (block.data ?? {}) as Record<string, unknown>;
  return (
    <Card variant="surface" className="border border-subtle bg-surface/95">
      <Box px="3" py="3">
        <Text size="2" weight="medium" className="mb-2 block">
          {block.title}
        </Text>
        {block.category === "summary" ? (
          <SummaryBlock data={data} />
        ) : block.category === "top_posts" ? (
          <TopPostsBlock posts={(block.data as TopPost[]) ?? []} />
        ) : block.category === "content_type" ? (
          <ContentTypeBlock rows={(block.data as ContentTypeRow[]) ?? []} />
        ) : block.category === "narrative" ? (
          <NarrativeBlock lines={(block.data as string[]) ?? []} />
        ) : null}
      </Box>
    </Card>
  );
}

export function OrganicAwarenessReportView({
  report,
}: {
  report: OrganicAwarenessReportPayload | null;
}) {
  const [open, setOpen] = React.useState(true);

  if (!report) {
    return (
      <Card variant="surface" className="border border-dashed border-subtle bg-surface/60">
        <Box px="4" py="6">
          <Text size="2" weight="medium" className="block">
            AI-Awareness report builds with your data
          </Text>
          <Text size="1" color="gray" className="mt-1 block">
            Once analytics run for this account, the flash-lite agents summarize what changed —
            top hooks, content-type shifts, and the week&apos;s momentum.
          </Text>
        </Box>
      </Card>
    );
  }

  return (
    <Card variant="surface" className="border border-subtle bg-surface/95">
      <Box px="4" py="3">
        <Flex align="center" justify="between" gap="3">
          <Box>
            <Text size="2" weight="bold" className="block">
              AI-Awareness
            </Text>
            <Text size="1" color="gray">
              {report.windowStart} – {report.windowEnd}
            </Text>
          </Box>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-md border border-subtle px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            aria-expanded={open}
          >
            {open ? "Hide" : "Show"}
          </button>
        </Flex>

        {open ? (
          <div className="mt-3 grid gap-3">
            {report.blocks.map((block, index) => (
              <AwarenessBlockCard key={`${block.category}-${index}`} block={block} />
            ))}
          </div>
        ) : null}
      </Box>
    </Card>
  );
}
