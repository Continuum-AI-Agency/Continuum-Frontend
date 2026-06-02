"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Badge } from "@radix-ui/themes";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import type { PipelineCardState, PipelinePreview, PipelineStage, PipelineStageNode } from "./types";

const STAGE_LABELS: Record<PipelineStage, string> = {
  strategist: "Strategy",
  concept: "Concept",
  draft: "Draft",
  assets: "Assets",
  quality: "Quality",
  merge: "Merge",
};

const STATUS_BADGE: Record<
  PipelineCardState["status"],
  { label: string; color: "amber" | "green" | "red" | "gray" }
> = {
  running: { label: "Generating", color: "amber" },
  completed: { label: "Ready", color: "green" },
  failed: { label: "Failed", color: "red" },
  cancelled: { label: "Cancelled", color: "gray" },
};

function qualityPercent(score: number | undefined): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return score <= 1 ? Math.round(score * 100) : Math.round(score);
}

function resolvePreviewImages(preview: PipelinePreview | undefined): string[] {
  if (!preview) return [];
  if (preview.images?.length) return preview.images;
  if (preview.imageUrl) return [preview.imageUrl];
  return [];
}

function PreviewImages({ preview }: { preview: PipelinePreview | undefined }) {
  const images = resolvePreviewImages(preview);
  if (images.length === 0) return null;

  if (images.length > 1) {
    return (
      <Carousel className="w-full">
        <CarouselContent>
          {images.map((url, i) => (
            <CarouselItem key={i}>
              <img
                src={url}
                alt={`Slide ${i + 1}`}
                className="w-full rounded-md object-cover aspect-[4/5]"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    );
  }

  return (
    <img
      src={images[0]}
      alt="Preview"
      className="w-full rounded-md object-cover aspect-[4/5]"
    />
  );
}

function StageNode({ node }: { node: PipelineStageNode }) {
  const label = STAGE_LABELS[node.stage];
  const icon =
    node.status === "active" ? (
      <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
    ) : node.status === "done" ? (
      <Check className="h-3 w-3 text-green-500" />
    ) : node.status === "failed" ? (
      <AlertCircle className="h-3 w-3 text-destructive" />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
    );

  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <div
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border",
          node.status === "active" && "border-amber-400/50 bg-amber-50 dark:bg-amber-950/30",
          node.status === "done" && "border-green-400/50 bg-green-50 dark:bg-green-950/30",
          node.status === "failed" && "border-destructive/40 bg-destructive/5",
          node.status === "pending" && "border-muted bg-muted/30",
        )}
      >
        {icon}
      </div>
      <span
        className={cn(
          "text-[10px] leading-none",
          node.status === "pending" ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function PipelineCard({ card }: { card: PipelineCardState }) {
  const badge = STATUS_BADGE[card.status];
  const quality = qualityPercent(card.quality?.overallScore);
  const isRunning = card.status === "running";

  return (
    <Card className={cn("overflow-hidden", card.status === "failed" && "border-destructive/30")}>
      <CardContent className="flex flex-col gap-2.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {card.platform && (
              <Badge variant="soft" color="indigo" size="1">
                {card.platform}
              </Badge>
            )}
            {card.preview?.format && (
              <Badge variant="soft" color="gray" size="1">
                {card.preview.format}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {quality != null && (
              <Badge variant="soft" color={card.quality?.passed ? "green" : "orange"} size="1">
                {quality}%
              </Badge>
            )}
            <Badge variant="soft" color={badge.color} size="1">
              {badge.label}
            </Badge>
          </div>
        </div>

        <div className="flex items-start justify-between gap-1">
          {card.stages.map((node) => (
            <StageNode key={node.stage} node={node} />
          ))}
        </div>

        {isRunning && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-amber-400 transition-all"
              style={{ width: `${Math.max(5, Math.min(100, card.pct ?? 10))}%` }}
            />
          </div>
        )}

        <PreviewImages preview={card.preview} />

        {card.preview?.caption && (
          <p className="line-clamp-2 text-xs text-foreground">{card.preview.caption}</p>
        )}

        {card.status === "failed" && card.error?.message && (
          <p className="line-clamp-2 text-xs text-destructive/80">{card.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
