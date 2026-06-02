"use client";

import { motion } from "motion/react";
import { CheckCircle2Icon, CircleDotIcon, AlertCircleIcon } from "lucide-react";
import type { PipelineStage, PipelineStageNode } from "./types";

const STAGE_LABELS: Record<PipelineStage, string> = {
  strategist: "Strategizing",
  concept: "Concepting",
  draft: "Drafting",
  assets: "Generating assets",
  quality: "Reviewing",
  merge: "Merging",
};

type StageRowProps = {
  node: PipelineStageNode;
  isLast: boolean;
};

function StageRow({ node, isLast }: StageRowProps) {
  const treeChar = isLast ? "└─" : "├─";
  const label = STAGE_LABELS[node.stage] ?? node.stage;
  const codename = node.agentName ?? node.stage;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-baseline gap-1.5 text-xs"
    >
      <span className="shrink-0 font-mono text-muted-foreground/50">{treeChar}</span>
      <span className="font-medium text-foreground/80">{codename}</span>
      <span className="text-muted-foreground/40">·</span>
      <span className="text-muted-foreground/60">{label}</span>
      <span className="text-muted-foreground/40">·</span>
      {node.status === "done" ? (
        <span className="flex items-center gap-1 text-emerald-500/70">
          <CheckCircle2Icon className="size-3" />
          done
        </span>
      ) : node.status === "failed" ? (
        <span className="flex items-center gap-1 text-destructive/70">
          <AlertCircleIcon className="size-3" />
          failed
        </span>
      ) : (
        <span className="flex items-center gap-1 text-muted-foreground/50">
          <CircleDotIcon className="size-3 animate-pulse" />
          running
        </span>
      )}
    </motion.div>
  );
}

type ActiveStagesPanelProps = {
  stages: PipelineStageNode[];
  isStreaming: boolean;
};

export function ActiveStagesPanel({ stages, isStreaming }: ActiveStagesPanelProps) {
  if (!isStreaming || stages.length === 0) return null;

  return (
    <div className="mt-0.5 space-y-0.5 px-3 pb-1">
      {stages.map((node, index) => (
        <StageRow key={node.stage} node={node} isLast={index === stages.length - 1} />
      ))}
    </div>
  );
}
