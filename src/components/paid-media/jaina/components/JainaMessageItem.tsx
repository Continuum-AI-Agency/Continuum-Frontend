"use client";

import * as React from "react";
import { Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2Icon } from "lucide-react";
import { Message } from "@/components/ai-elements/message";
import { MentionifiedText } from "@/components/ai-elements/mentionified-text";
import { Checkpoint, CheckpointIcon } from "@/components/ai-elements/checkpoint";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import {
  frontendCheckpointReportSchema,
  hasReportContent,
  type CreativeArtifact,
  type ToolResultEventData,
} from "@/lib/jaina/schemas";
import type { JainaStreamState } from "@/lib/jaina/stream";
import {
  extractRenderableFallbackFromReport,
  extractRenderableFallbackFromStructuredContent,
  isStreamingPlaceholderMessage,
  normalizeJainaMarkdownTables,
} from "../jainaUtils";
import type { JainaChatMessage } from "../types";
import { ObjectivesQueue } from "./ObjectivesQueue";
import { LatestJainaThought, ThinkingWindow } from "./ThinkingWindow";
import { SparkleSpinner } from "./SparkleSpinner";
import { deriveLiveStatusLabel } from "./thinkingUtils";
import { PlanSection, type PlanFeedbackPayload } from "./PlanSection";
import { ClarificationBanner } from "./ClarificationBanner";
import { MessageActionBar } from "./MessageActionBar";
import { CreativesSection } from "./CreativesSection";
import { JainaInlineReport } from "./JainaInlineReport";
import { JainaReportV2 } from "./JainaReportV2";
import { WorkerInsightsPanel } from "./WorkerInsightsPanel";

function makeCreativeArtifact(details: Record<string, unknown>): CreativeArtifact | null {
  const imageUrl = details.image_url ? String(details.image_url) : null;
  const thumbUrl = details.thumbnail_url ? String(details.thumbnail_url) : null;
  const url = imageUrl || thumbUrl;
  if (!url) return null;
  const objectType = typeof details.object_type === "string" ? details.object_type.toUpperCase() : null;
  return {
    id: String(details.id || `creative-${Date.now()}`),
    type: "creative",
    url,
    thumbnail_url: thumbUrl ?? undefined,
    post_copy: details.body ? String(details.body) : undefined,
    headline: details.title ? String(details.title) : undefined,
    description: details.name ? String(details.name) : undefined,
    call_to_action: details.call_to_action_type ? String(details.call_to_action_type) : undefined,
    format: objectType === "VIDEO" ? "video" : objectType === "PHOTO" ? "image" : undefined,
  };
}

function extractCreativesFromToolResult(toolResult: ToolResultEventData): CreativeArtifact[] {
  if (!toolResult.ok || !toolResult.output) return [];
  const output = toolResult.output as Record<string, unknown>;

  // Batch format: { results: [{ ok, creative_details, ... }] }
  const results = output.results;
  if (Array.isArray(results)) {
    return results
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && r.ok !== false && !!r.creative_details)
      .map((r) => makeCreativeArtifact(r.creative_details as Record<string, unknown>))
      .filter((c): c is CreativeArtifact => c !== null);
  }

  // Single creative format: { creative_details: { ... } }
  const creativeDetails = output.creative_details as Record<string, unknown> | undefined;
  if (creativeDetails) {
    const c = makeCreativeArtifact(creativeDetails);
    return c ? [c] : [];
  }

  return [];
}

function isLikelyStructuredJsonMessage(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return true;
  }
  return (
    trimmed.includes('"executive_summary"') ||
    trimmed.includes('"performance_snapshot"') ||
    trimmed.includes('"sections"') ||
    trimmed.includes('"strategic_recommendations"')
  );
}

type JainaMessageItemProps = {
  message: JainaChatMessage;
  activeResponseId: string | null;
  state: JainaStreamState;
  onSuggestionClick?: (query: string) => void;
  onPlanFeedback?: (payload: PlanFeedbackPayload) => void;
  onRegenerate?: () => void;
  onFocusInput?: () => void;
};

export function JainaMessageItem({
  message,
  activeResponseId,
  state,
  onSuggestionClick,
  onPlanFeedback,
  onRegenerate,
  onFocusInput,
}: JainaMessageItemProps) {
  const isStreaming = message.id === activeResponseId;

  const reasoning = isStreaming ? state.progress : message.reasoning;
  const toolCalls = isStreaming ? state.toolCalls : message.toolCalls;
  const toolResults = isStreaming ? state.toolResults : message.toolResults;
  const objectives = isStreaming ? state.objectives : message.objectives;
  const report = isStreaming ? state.report : message.report;
  const reportV2 = isStreaming ? state.reportV2 : message.reportV2;
  const plan = message.plan;

  const structuredReport = React.useMemo(() => {
    if (!report || ("type" in report && report.type === "direct_answer")) return null;
    const parsed = frontendCheckpointReportSchema.safeParse(report);
    return parsed.success ? parsed.data : null;
  }, [report]);

  const shouldRenderInlineReport = Boolean(structuredReport && hasReportContent(structuredReport));
  const isStructuredJsonContent = isLikelyStructuredJsonMessage(message.content);
  const hasStructuredChild = Boolean(
    shouldRenderInlineReport || reportV2 || plan || message.pendingClarification
  );
  const shouldHideMarkdownContent = isStructuredJsonContent && hasStructuredChild;
  const trimmedContent = message.content.trim();

  // Suppress SafeMarkdown when it would just repeat the report's executive summary
  const isRedundantReportContent = Boolean(
    trimmedContent &&
    reportV2?.executive_summary?.trim() === trimmedContent
  );

  const hasRenderableContent = trimmedContent.length > 0 && !shouldHideMarkdownContent && !isRedundantReportContent;

  const structuredFallbackContent = React.useMemo(() => {
    if (shouldRenderInlineReport || reportV2) return null;
    return (
      extractRenderableFallbackFromReport(report ?? null) ??
      (isStructuredJsonContent ? extractRenderableFallbackFromStructuredContent(message.content) : null)
    );
  }, [isStructuredJsonContent, message.content, report, reportV2, shouldRenderInlineReport]);

  const liveStatusLabel = React.useMemo(
    () => (isStreaming ? deriveLiveStatusLabel(reasoning ?? []) ?? "Working" : null),
    [isStreaming, reasoning]
  );

  const showLiveStatus =
    isStreaming &&
    message.role === "assistant" &&
    (state.status === "starting" || state.status === "streaming");

  const showStaticFallback =
    !isStreaming &&
    message.role === "assistant" &&
    !hasRenderableContent &&
    !structuredFallbackContent &&
    !hasStructuredChild;

  const artifacts = isStreaming ? state.artifacts : message.artifacts;
  const toolCreatives = React.useMemo(() => {
    if (!toolResults) return [];
    return toolResults.flatMap(extractCreativesFromToolResult);
  }, [toolResults]);
  const allCreatives = [...toolCreatives, ...(artifacts?.creatives ?? [])];

  const spawnWorkerResults = React.useMemo(() => {
    if (!toolResults) return [];
    return toolResults.filter(
      (r): r is ToolResultEventData & { output: Record<string, unknown> } =>
        r.name === "spawn_worker" && r.ok && !!r.output
    );
  }, [toolResults]);

  return (
    <Message role={message.role}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="group w-full space-y-4"
      >
        {message.role === "user" ? (
          <Text size="2" className="font-medium whitespace-pre-wrap"><MentionifiedText text={message.content} references={message.metadata?.references} /></Text>
        ) : (
          <>
            {hasRenderableContent ? (
              <div className="relative">
                <SafeMarkdown
                  content={normalizeJainaMarkdownTables(message.content)}
                  className="text-[15px] leading-7 text-foreground"
                  mode={isStreaming ? "streaming" : "static"}
                  isAnimating={isStreaming}
                />
                {isStreaming && isStreamingPlaceholderMessage(message.content) ? (
                  <motion.span
                    aria-hidden="true"
                    className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] rounded-sm bg-primary"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                  />
                ) : null}
              </div>
            ) : null}

            {showLiveStatus ? (
              <motion.div
                key={liveStatusLabel}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <SparkleSpinner isActive className="text-foreground/60" />
                <span className="font-medium">{liveStatusLabel}</span>
              </motion.div>
            ) : null}

            {showStaticFallback ? (
              <Text size="2" className="text-muted-foreground">
                Response complete.
              </Text>
            ) : null}

            {structuredFallbackContent ? (
              <SafeMarkdown
                content={normalizeJainaMarkdownTables(structuredFallbackContent)}
                className="text-[15px] leading-7 text-foreground"
                mode="static"
                isAnimating={false}
              />
            ) : null}

            {message.pendingClarification ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <ClarificationBanner
                  question={message.pendingClarification.question}
                  onFocusInput={onFocusInput}
                />
              </motion.div>
            ) : null}

            <ObjectivesQueue objectives={objectives ?? []} isStreaming={isStreaming} />

            <ThinkingWindow
              reasoning={reasoning ?? []}
              toolCalls={toolCalls ?? []}
              toolResults={toolResults ?? []}
              isStreaming={isStreaming}
            />

            <AnimatePresence mode="wait">
              {isStreaming ? (
                <LatestJainaThought
                  key="latest-jaina-thought"
                  reasoning={reasoning ?? []}
                  isStreaming={isStreaming}
                />
              ) : null}
            </AnimatePresence>

            {plan ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <PlanSection
                  plan={plan}
                  isStreaming={isStreaming}
                  onPlanFeedback={onPlanFeedback}
                />
              </motion.div>
            ) : null}

            {reportV2 ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <JainaReportV2
                  report={reportV2}
                  isStreaming={isStreaming}
                  onSuggestionClick={onSuggestionClick}
                />
              </motion.div>
            ) : shouldRenderInlineReport ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <JainaInlineReport
                  report={structuredReport}
                  isStreaming={isStreaming}
                  onSuggestionClick={onSuggestionClick}
                />
              </motion.div>
            ) : null}

            {allCreatives.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <CreativesSection creatives={allCreatives} />
              </motion.div>
            ) : (
              <CreativesSection creatives={allCreatives} />
            )}

            {spawnWorkerResults.length > 0 ? (
              <WorkerInsightsPanel results={spawnWorkerResults} />
            ) : null}

            {!isStreaming && message.status === "done" && (reportV2 || shouldRenderInlineReport) ? (
              <Checkpoint className="pt-1">
                <CheckpointIcon>
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <CheckCircle2Icon className="size-4 text-emerald-500 shrink-0" aria-hidden="true" />
                  </motion.div>
                </CheckpointIcon>
                <motion.span
                  className="shrink-0 px-2 text-xs"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                >
                  Analysis complete
                </motion.span>
              </Checkpoint>
            ) : null}

            {!isStreaming && message.status === "done" ? (
              <MessageActionBar content={message.content} onRegenerate={onRegenerate} />
            ) : null}
          </>
        )}
      </motion.div>
    </Message>
  );
}
