"use client";

import * as React from "react";
import { Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2Icon } from "lucide-react";
import { Message } from "@/components/ai-elements/message";
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
} from "../jainaUtils";
import type { JainaChatMessage } from "../types";
import { ObjectivesQueue } from "./ObjectivesQueue";
import { ThinkingWindow } from "./ThinkingWindow";
import { PlanSection, type PlanFeedbackPayload } from "./PlanSection";
import { ClarificationBanner } from "./ClarificationBanner";
import { MessageActionBar } from "./MessageActionBar";
import { CreativesSection } from "./CreativesSection";
import { JainaInlineReport } from "./JainaInlineReport";
import { JainaReportV2 } from "./JainaReportV2";
import { WorkerInsightsPanel } from "./WorkerInsightsPanel";

function extractCreativeFromToolResult(toolResult: ToolResultEventData): CreativeArtifact | null {
  if (!toolResult.ok || !toolResult.output) return null;
  const output = toolResult.output as Record<string, unknown>;
  const creativeDetails = output.creative_details as Record<string, unknown> | undefined;
  if (creativeDetails) {
    return {
      id: String(creativeDetails.id || `creative-${Date.now()}`),
      type: "creative",
      url: String(creativeDetails.image_url || ""),
      thumbnail_url: creativeDetails.thumbnail_url ? String(creativeDetails.thumbnail_url) : undefined,
      post_copy: creativeDetails.body ? String(creativeDetails.body) : undefined,
      headline: creativeDetails.title ? String(creativeDetails.title) : undefined,
      description: creativeDetails.name ? String(creativeDetails.name) : undefined,
      call_to_action: creativeDetails.call_to_action_type ? String(creativeDetails.call_to_action_type) : undefined,
    };
  }
  if (typeof output.preview_iframe === "string") {
    return { id: `preview-${Date.now()}`, type: "creative", url: "", format: "video" };
  }
  return null;
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

const JAINA_LOADING_MESSAGES = [
  "Pulling performance signals...",
  "Synthesizing campaign data...",
  "Connecting the dots...",
  "Building your brief...",
  "Analyzing spend patterns...",
  "Identifying opportunities...",
] as const;

function RotatingMessage() {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % JAINA_LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={index}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="block text-sm text-muted-foreground"
      >
        {JAINA_LOADING_MESSAGES[index]}
      </motion.span>
    </AnimatePresence>
  );
}

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

  const hasThinkingContent =
    (reasoning?.length ?? 0) > 0 || (toolCalls?.length ?? 0) > 0;

  const showStreamingPlaceholder =
    isStreaming &&
    message.role === "assistant" &&
    !hasRenderableContent &&
    !structuredFallbackContent &&
    !hasStructuredChild &&
    !hasThinkingContent;

  const showStaticFallback =
    !isStreaming &&
    message.role === "assistant" &&
    !hasRenderableContent &&
    !structuredFallbackContent &&
    !hasStructuredChild;

  const artifacts = isStreaming ? state.artifacts : message.artifacts;
  const toolCreatives = React.useMemo(() => {
    if (!toolResults) return [];
    return toolResults
      .map(extractCreativeFromToolResult)
      .filter((c): c is CreativeArtifact => c !== null);
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
          <Text size="2" className="font-medium">{message.content}</Text>
        ) : (
          <>
            {hasRenderableContent ? (
              <div className="relative">
                <SafeMarkdown
                  content={message.content}
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

            {showStreamingPlaceholder ? <RotatingMessage /> : null}

            {showStaticFallback ? (
              <Text size="2" className="text-muted-foreground">
                Response complete.
              </Text>
            ) : null}

            {structuredFallbackContent ? (
              <SafeMarkdown
                content={structuredFallbackContent}
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
