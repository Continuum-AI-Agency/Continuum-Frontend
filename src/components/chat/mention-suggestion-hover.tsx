"use client";

/**
 * Hover previews for context-grabber rows: full text (no truncation), type-specific
 * detail (What's Working creatives, KPI 7d sparklines, packs, media enlarge).
 */

import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  FileText,
  ImageIcon,
  Lightbulb,
  LineChart,
  Package,
  Sparkles,
  Target,
  TrendingUp,
  Workflow,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentMentionReference, AgentMentionSuggestion } from "@/lib/agent-references";
import { OPTIMIZATION_PACKS } from "@/lib/agent/kpi-mentions";
import { fetchOrganicAnalytics } from "@/lib/api/organicAnalytics.client";
import type { OrganicPlatform } from "@/lib/schemas/organicMetrics";
import { cn } from "@/lib/utils";
import { getOrganicMetric } from "@continuum/contracts";

export type MentionAnalyticsContext = {
  brandId?: string;
  integrationAccountId?: string | null;
  platform?: Extract<OrganicPlatform, "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin"> | null;
};

function readString(meta: Record<string, unknown> | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}

function readNumber(meta: Record<string, unknown> | undefined, key: string): number | null {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function typeLabel(type: AgentMentionReference["type"]): string {
  switch (type) {
    case "creative_insight":
      return "What's Working";
    case "organic_insight":
      return "Insight";
    case "kpi":
      return "Metric";
    case "media_asset":
      return "Media";
    case "canvas_node":
      return "Canvas";
    default:
      return type.replace(/_/g, " ");
  }
}

function TypeIcon({ type }: { type: AgentMentionReference["type"] }) {
  const cls = "size-3.5 text-muted-foreground";
  switch (type) {
    case "media_asset":
      return <ImageIcon className={cls} />;
    case "canvas_node":
      return <Workflow className={cls} />;
    case "skill":
      return <Sparkles className={cls} />;
    case "document":
      return <BookOpen className={cls} />;
    case "trend":
    case "event":
      return <TrendingUp className={cls} />;
    case "question":
      return <Lightbulb className={cls} />;
    case "draft":
      return <FileText className={cls} />;
    case "campaign":
    case "adset":
      return <Target className={cls} />;
    case "creative_insight":
    case "organic_insight":
    case "kpi":
      return <LineChart className={cls} />;
    default:
      return <FileText className={cls} />;
  }
}

/** Compact 7-day bars (matches InstagramOrganicReportingWidget MiniBars). */
export function MiniBars({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length === 0) {
    return <div className={cn("h-10", className)} aria-hidden />;
  }
  const max = Math.max(...values, 1);
  return (
    <div className={cn("flex h-10 items-end gap-0.5", className)} aria-hidden>
      {values.map((value, index) => (
        <span
          key={index}
          className="min-w-[3px] flex-1 rounded-sm bg-primary/70"
          style={{ height: `${Math.max(10, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function useMetricTrendSeries(params: {
  enabled: boolean;
  analytics?: MentionAnalyticsContext | null;
  metricKey?: string | null;
}) {
  const { enabled, analytics, metricKey } = params;
  const brandId = analytics?.brandId;
  const accountId = analytics?.integrationAccountId;
  const platform = analytics?.platform;

  return useQuery({
    queryKey: ["mention-kpi-series", brandId, accountId, platform, metricKey, "last_7d"],
    enabled: Boolean(
      enabled && brandId && accountId && platform && metricKey && metricKey.length > 0,
    ),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const data = await fetchOrganicAnalytics({
        brandId: brandId as string,
        integrationAccountId: accountId as string,
        platform: platform as NonNullable<typeof platform>,
        range: { preset: "last_7d" },
        scope: "kpis",
      });
      const trends = data.trends ?? [];
      const key = metricKey as string;
      const points = trends
        .slice(-7)
        .map((point) => {
          const raw = (point as Record<string, unknown>)[key];
          return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        })
        .filter((v): v is number => v != null);
      const comparison = data.comparison as
        | Record<string, { current?: number; previous?: number; percentageChange?: number }>
        | null
        | undefined;
      const snap = comparison?.[key];
      const metricsBag = data.metrics as Record<string, number | undefined> | undefined;
      return {
        values: points,
        current: snap?.current ?? metricsBag?.[key] ?? null,
        previous: snap?.previous ?? null,
        percentageChange: snap?.percentageChange ?? null,
      };
    },
  });
}

function MetricSeriesBlock({
  metricKey,
  label,
  analytics,
  open,
  fallbackValue,
  fallbackDelta,
}: {
  metricKey: string;
  label: string;
  analytics?: MentionAnalyticsContext | null;
  open: boolean;
  fallbackValue?: number | null;
  fallbackDelta?: number | null;
}) {
  const series = useMetricTrendSeries({
    enabled: open,
    analytics,
    metricKey,
  });
  const values = series.data?.values ?? [];
  const current = series.data?.current ?? fallbackValue ?? null;
  const delta = series.data?.percentageChange ?? fallbackDelta ?? null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{label}</p>
          <p className="text-2xs text-muted-foreground">Last 7 days</p>
        </div>
        <div className="text-right">
          {current != null ? (
            <p className="text-sm font-semibold tabular-nums leading-none">
              {typeof current === "number" && current < 1 && current > 0
                ? `${(current * 100).toFixed(1)}%`
                : current.toLocaleString()}
            </p>
          ) : series.isLoading ? (
            <Skeleton className="ml-auto h-4 w-12" />
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
          {delta != null ? (
            <p
              className={cn(
                "mt-1 text-2xs tabular-nums",
                delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
              )}
            >
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}%
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2">
        {series.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : values.length > 0 ? (
          <MiniBars values={values} />
        ) : (
          <p className="py-2 text-center text-2xs text-muted-foreground">No daily series yet</p>
        )}
      </div>
    </div>
  );
}

function CreativeInsightHover({
  meta,
  label,
}: {
  meta: Record<string, unknown>;
  label: string;
}) {
  const thumbs = Array.isArray(meta.exemplarThumbnails)
    ? (meta.exemplarThumbnails as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  const snippets = Array.isArray(meta.exemplarSnippets)
    ? (meta.exemplarSnippets as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  const permalinks = Array.isArray(meta.exemplarPermalinks)
    ? (meta.exemplarPermalinks as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  const description = readString(meta, "description");
  const recommendation = readString(meta, "recommendation");
  const performance = readString(meta, "performanceSummary");
  const metricName = readString(meta, "metricName");
  const metricValue = readNumber(meta, "metricValue");
  const confidence = readNumber(meta, "confidence");
  const count = Math.max(thumbs.length, snippets.length, 1);

  return (
    <div className="flex flex-col gap-2.5">
      {description ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {recommendation ? (
        <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs leading-relaxed">{recommendation}</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5 text-2xs">
        {performance ? (
          <Badge variant="muted" className="font-normal">
            {performance}
          </Badge>
        ) : null}
        {metricName && metricValue != null ? (
          <Badge variant="outline" className="font-normal tabular-nums">
            {metricName.replace(/_/g, " ")} {metricValue < 1 ? `${(metricValue * 100).toFixed(0)}%` : metricValue.toLocaleString()}
          </Badge>
        ) : null}
        {confidence != null ? (
          <Badge variant="secondary" className="font-normal tabular-nums">
            {Math.round(confidence * 100)}% conf
          </Badge>
        ) : null}
      </div>
      {count > 0 && (thumbs.length > 0 || snippets.length > 0) ? (
        <div>
          <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Top creatives
          </p>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {Array.from({ length: Math.min(count, 4) }).map((_, i) => {
              const thumb = thumbs[i];
              const snippet = snippets[i];
              const link = permalinks[i];
              const inner = (
                <>
                  <span className="relative block aspect-square w-16 overflow-hidden rounded-md border border-border/60 bg-muted">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-2xs text-muted-foreground">
                        {(label || "·").charAt(0)}
                      </span>
                    )}
                  </span>
                  {snippet ? (
                    <span className="line-clamp-2 text-2xs leading-snug text-muted-foreground">
                      {snippet}
                    </span>
                  ) : null}
                </>
              );
              if (link) {
                return (
                  <a
                    key={`ex-${i}-${link}`}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-16 shrink-0 flex-col gap-1 hover:opacity-90"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {inner}
                  </a>
                );
              }
              return (
                <span key={`ex-${i}`} className="flex w-16 shrink-0 flex-col gap-1">
                  {inner}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PackHover({
  meta,
  analytics,
  open,
}: {
  meta: Record<string, unknown>;
  analytics?: MentionAnalyticsContext | null;
  open: boolean;
}) {
  const packId = readString(meta, "packId");
  const pack = OPTIMIZATION_PACKS.find((p) => p.id === packId);
  const keys = Array.isArray(meta.metricKeys)
    ? (meta.metricKeys as unknown[]).filter((k): k is string => typeof k === "string")
    : (pack?.metricKeys ?? []);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {pack?.description ?? "Optimization pack — metrics included below."}
      </p>
      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {keys.slice(0, 5).map((key) => {
          const entry = getOrganicMetric(key as never);
          return (
            <MetricSeriesBlock
              key={key}
              metricKey={key}
              label={entry?.label ?? key}
              analytics={analytics}
              open={open}
            />
          );
        })}
      </div>
    </div>
  );
}

function MediaHover({
  suggestion,
  meta,
}: {
  suggestion: AgentMentionSuggestion;
  meta: Record<string, unknown>;
}) {
  const url =
    suggestion.preview?.url ??
    readString(meta, "previewUrl") ??
    readString(meta, "thumbnailUrl");
  const kind =
    suggestion.preview?.kind ??
    readString(meta, "previewKind") ??
    readString(meta, "kind") ??
    "image";
  const description = readString(meta, "description");
  const tags = Array.isArray(meta.tags)
    ? (meta.tags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 8)
    : [];

  return (
    <div className="flex flex-col gap-2.5">
      {url ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          {kind === "video" ? (
            <video
              src={url}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-contain" />
          )}
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ImageIcon className="size-8 opacity-50" />
        </div>
      )}
      {description ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="muted" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GenericTextHover({
  suggestion,
  meta,
}: {
  suggestion: AgentMentionSuggestion;
  meta: Record<string, unknown>;
}) {
  const body =
    readString(meta, "description") ??
    readString(meta, "text") ??
    readString(meta, "recommendation") ??
    readString(meta, "relevanceToBrand") ??
    readString(meta, "whyRelevant") ??
    readString(meta, "opportunity") ??
    readString(meta, "summary") ??
    readString(meta, "captionPreview") ??
    suggestion.description ??
    null;

  return body ? (
    <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{body}</p>
  ) : (
    <p className="text-xs text-muted-foreground">No additional detail for this reference.</p>
  );
}

function HoverBody({
  suggestion,
  analytics,
  open,
}: {
  suggestion: AgentMentionSuggestion;
  analytics?: MentionAnalyticsContext | null;
  open: boolean;
}) {
  const ref = suggestion.reference;
  const meta = (ref?.metadata ?? {}) as Record<string, unknown>;
  const type = suggestion.type;
  const isPack = meta.isPack === true || suggestion.badge === "pack";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-foreground">{suggestion.label}</p>
          <p className="mt-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
            {isPack ? "Pack" : typeLabel(type)}
            {readString(meta, "kind") ? ` · ${readString(meta, "kind")}` : null}
            {readString(meta, "category") ? ` · ${readString(meta, "category")}` : null}
          </p>
        </div>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
          {isPack ? <Package className="size-3.5 text-muted-foreground" /> : <TypeIcon type={type} />}
        </span>
      </div>

      {type === "creative_insight" && ref ? (
        <CreativeInsightHover meta={meta} label={suggestion.label} />
      ) : isPack ? (
        <PackHover meta={meta} analytics={analytics} open={open} />
      ) : type === "kpi" && readString(meta, "metricKey") ? (
        <MetricSeriesBlock
          metricKey={readString(meta, "metricKey") as string}
          label={
            readString(meta, "metricLabel") ??
            suggestion.label
          }
          analytics={analytics}
          open={open}
          fallbackValue={readNumber(meta, "value")}
          fallbackDelta={readNumber(meta, "percentageChange")}
        />
      ) : type === "media_asset" || type === "canvas_node" ? (
        <MediaHover suggestion={suggestion} meta={meta} />
      ) : (
        <GenericTextHover suggestion={suggestion} meta={meta} />
      )}

      {type === "organic_insight" ? (
        <div className="flex flex-wrap gap-1.5">
          {readString(meta, "severity") ? (
            <Badge variant="muted" className="font-normal capitalize">
              {readString(meta, "severity")}
            </Badge>
          ) : null}
          {readNumber(meta, "delta") != null ? (
            <Badge variant="outline" className="font-normal tabular-nums">
              Δ {readNumber(meta, "delta")!.toFixed(1)}%
            </Badge>
          ) : null}
          {readString(meta, "metric") ? (
            <Badge variant="secondary" className="font-normal">
              {readString(meta, "metric")!.replace(/_/g, " ")}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Wraps a grabber row so hover always reveals full detail (and charts / creatives
 * when the type supports them). Click still selects via the child CommandItem.
 */
export function MentionSuggestionHover({
  suggestion,
  analytics,
  children,
}: {
  suggestion: AgentMentionSuggestion;
  analytics?: MentionAnalyticsContext | null;
  children: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  // Folders: light description hover only (still useful for long childrenLabel).
  const isFolder = Boolean(suggestion.isFolder || suggestion.childrenLabel);

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={180} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        className={cn(
          "z-[80] w-80 p-3",
          (suggestion.type === "media_asset" || suggestion.type === "canvas_node") && "w-96",
        )}
        // Keep hover interactive (links on creatives) without dismissing the menu.
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {isFolder && !suggestion.reference ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{suggestion.label}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {suggestion.childrenLabel ?? suggestion.description ?? "Open folder"}
            </p>
          </div>
        ) : (
          <HoverBody suggestion={suggestion} analytics={analytics} open={open} />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
