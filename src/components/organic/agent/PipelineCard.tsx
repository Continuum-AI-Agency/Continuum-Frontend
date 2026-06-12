"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, Check, Clock, ImageOff, Loader2, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useCalendarStore } from "@/lib/organic/store";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { AgentCard, MetaRow, PlatformTag, StatusLabel } from "./agentCardKit";
import type { CheckpointState, PipelineCardState, PipelinePreview, PipelineStage, PipelineStageNode } from "./types";

const STAGE_LABELS: Record<PipelineStage, string> = {
  strategist: "Strategy",
  concept: "Concept",
  draft: "Draft",
  assets: "Assets",
  quality: "Quality",
  merge: "Merge",
};

const STATUS: Record<
  PipelineCardState["status"],
  { label: string; tone: "running" | "done" | "failed" | "neutral" }
> = {
  running: { label: "Generating", tone: "running" },
  completed: { label: "Drafts ready", tone: "done" },
  failed: { label: "Failed", tone: "failed" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const IMAGE_OUTLINE = "outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10";

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Slide ${i + 1}`} className={cn("aspect-[4/5] w-full rounded-lg object-cover", IMAGE_OUTLINE)} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={images[0]} alt="Preview" className={cn("aspect-[4/5] w-full rounded-lg object-cover", IMAGE_OUTLINE)} />
  );
}

function StageNode({ node, index }: { node: PipelineStageNode; index: number }) {
  const dot =
    node.status === "active" ? (
      <motion.div
        initial={{ scale: 0.25, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
      >
        <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
      </motion.div>
    ) : node.status === "done" ? (
      <Check className="h-3 w-3 text-emerald-500" />
    ) : node.status === "failed" ? (
      <AlertCircle className="h-3 w-3 text-destructive" />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
    );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.04, duration: 0.15 }}
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
    >
      <div className="flex h-3 items-center justify-center">{dot}</div>
      <span
        className={cn(
          "text-[10px] leading-none",
          node.status === "pending" ? "text-muted-foreground/50" : "text-muted-foreground",
        )}
      >
        {STAGE_LABELS[node.stage]}
      </span>
    </motion.div>
  );
}

// Three-step media checkpoint labels shown once text-ready is received.
const CHECKPOINT_STEPS = [
  { key: "caption" as const, label: "Caption" },
  { key: "creative" as const, label: "Creative direction" },
  { key: "media" as const, label: "Media" },
] as const;

type CheckpointStepKey = typeof CHECKPOINT_STEPS[number]["key"];

function checkpointStepStatus(
  key: CheckpointStepKey,
  cp: CheckpointState,
): "done" | "active" | "awaiting" | "generating" | "ready" | "user_supplied" | "pending" {
  if (key === "caption") return cp.textReady ? "done" : "active";
  if (key === "creative") {
    if (!cp.textReady) return "pending";
    return cp.blueprintReady ? "done" : "active";
  }
  // media step
  if (!cp.blueprintReady) return "pending";
  if (cp.awaitingMediaChoice) return "awaiting";
  if (cp.mediaStatus === "generating") return "generating";
  if (cp.mediaStatus === "ready") return "ready";
  if (cp.mediaStatus === "user_supplied") return "user_supplied";
  return "pending";
}

function CheckpointStepNode({ stepKey, label, checkpoint }: {
  stepKey: CheckpointStepKey;
  label: string;
  checkpoint: CheckpointState;
}) {
  const status = checkpointStepStatus(stepKey, checkpoint);

  const dot =
    status === "done" ? (
      <Check className="h-3 w-3 text-emerald-500" />
    ) : status === "active" || status === "generating" ? (
      <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
    ) : status === "awaiting" ? (
      <Clock className="h-3 w-3 text-muted-foreground" />
    ) : status === "ready" || status === "user_supplied" ? (
      <Sparkles className="h-3 w-3 text-emerald-500" />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
    );

  const sublabel =
    status === "awaiting"
      ? "Awaiting your choice"
      : status === "generating"
        ? "Generating…"
        : status === "user_supplied"
          ? "Your creative"
          : status === "ready"
            ? "Ready"
            : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <div className="flex h-4 items-center justify-center">{dot}</div>
      <span
        className={cn(
          "text-center text-[10px] leading-none",
          status === "pending" ? "text-muted-foreground/40" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      {sublabel && (
        <span className="text-center text-[9px] leading-none text-muted-foreground/70">
          {sublabel}
        </span>
      )}
    </div>
  );
}

function CheckpointStepper({ checkpoint }: { checkpoint: CheckpointState }) {
  return (
    <div className="flex items-start gap-1">
      {CHECKPOINT_STEPS.map(({ key, label }) => (
        <CheckpointStepNode key={key} stepKey={key} label={label} checkpoint={checkpoint} />
      ))}
    </div>
  );
}

export function PipelineCard({ card }: { card: PipelineCardState }) {
  const status = STATUS[card.status];
  const quality = qualityPercent(card.quality?.overallScore);
  const isRunning = card.status === "running";

  // A finished single-post pipeline persists a calendar draft; signal the calendar
  // to reconcile so it appears without a manual reload (debounced workspace-side).
  const requestCalendarRefetch = useCalendarStore((state) => state.requestCalendarRefetch);
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (reconciledRef.current) return;
    if (card.status === "completed" && card.draftId) {
      reconciledRef.current = true;
      requestCalendarRefetch();
    }
  }, [card.status, card.draftId, requestCalendarRefetch]);

  return (
    <AgentCard className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {card.platform && <PlatformTag platform={card.platform} />}
          <MetaRow items={[card.preview?.format ?? undefined]} />
        </div>
        <StatusLabel tone={status.tone}>
          {status.label}
          {quality != null ? ` · ${quality}%` : ""}
        </StatusLabel>
      </div>

      {card.checkpoint ? (
        <CheckpointStepper checkpoint={card.checkpoint} />
      ) : (
        <div className="flex items-start gap-1">
          {card.stages.map((node, idx) => (
            <StageNode key={node.stage} node={node} index={idx} />
          ))}
        </div>
      )}

      {isRunning && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand-primary transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(5, Math.min(100, card.pct ?? 10))}%` }}
          />
        </div>
      )}

      <PreviewImages preview={card.preview} />

      {card.preview?.caption && (
        <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground text-pretty">
          {card.preview.caption}
        </p>
      )}

      {card.status === "failed" && card.error?.message && (
        <p className="line-clamp-2 text-[12px] text-destructive/80">{card.error.message}</p>
      )}
    </AgentCard>
  );
}
