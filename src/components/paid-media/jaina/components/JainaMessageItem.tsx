'use client';

import type { JainaToolApprovalRequiredPayload } from '@continuum/contracts';
import { motion } from 'motion/react';
import * as React from 'react';
import { AgentDelegatedCard } from '@/components/agents/AgentDelegatedCard';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatMediaGrid } from '@/components/chat/media/ChatMedia';
import { mediaFromPersistedAttachments } from '@/components/chat/media/media';
import { MentionifiedText } from '@/components/chat/mentionified-text';
import {
  PaidScaffoldCard,
  type ScaffoldDecision,
} from '@/components/paid-media/jaina/scaffold/PaidScaffoldCard';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import {
  type CreativeArtifact,
  frontendCheckpointReportSchema,
  hasReportContent,
  type ToolResultEventData,
} from '@/lib/jaina/schemas';
import type { JainaStreamState } from '@/lib/jaina/stream';
import {
  extractRenderableFallbackFromReport,
  extractRenderableFallbackFromStructuredContent,
  isStreamingPlaceholderMessage,
  normalizeJainaMarkdownTables,
} from '../jainaUtils';
import type { JainaChatMessage } from '../types';
import { AudienceGroupApprovalCard } from './AudienceGroupApprovalCard';
import { ClarificationBanner } from './ClarificationBanner';
import { CreativesSection } from './CreativesSection';
import { JainaInlineReport } from './JainaInlineReport';
import { JainaReportV2 } from './JainaReportV2';
import { MessageActionBar } from './MessageActionBar';
import { ObjectivesQueue } from './ObjectivesQueue';
import { type PlanFeedbackPayload, PlanSection } from './PlanSection';
import { ThinkingWindow } from './ThinkingWindow';
import { WorkerInsightsPanel } from './WorkerInsightsPanel';

function makeCreativeArtifact(details: Record<string, unknown>): CreativeArtifact | null {
  const imageUrl = details.image_url ? String(details.image_url) : null;
  const thumbUrl = details.thumbnail_url ? String(details.thumbnail_url) : null;
  const url = imageUrl || thumbUrl;
  if (!url) return null;
  const objectType =
    typeof details.object_type === 'string' ? details.object_type.toUpperCase() : null;
  return {
    id: String(details.id || `creative-${Date.now()}`),
    type: 'creative',
    url,
    thumbnail_url: thumbUrl ?? undefined,
    post_copy: details.body ? String(details.body) : undefined,
    headline: details.title ? String(details.title) : undefined,
    description: details.name ? String(details.name) : undefined,
    call_to_action: details.call_to_action_type ? String(details.call_to_action_type) : undefined,
    format: objectType === 'VIDEO' ? 'video' : objectType === 'PHOTO' ? 'image' : undefined,
  };
}

function extractCreativesFromToolResult(toolResult: ToolResultEventData): CreativeArtifact[] {
  if (!toolResult.ok || !toolResult.output) return [];
  const output = toolResult.output as Record<string, unknown>;

  // Batch format: { results: [{ ok, creative_details, ... }] }
  const results = output.results;
  if (Array.isArray(results)) {
    return results
      .filter(
        (r): r is Record<string, unknown> =>
          !!r && typeof r === 'object' && r.ok !== false && !!r.creative_details,
      )
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
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
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
  /**
   * Takes the prompt rather than a prepared thunk: a thunk closed over the preceding message
   * would be a new function on every parent render, which is exactly what defeats the memo
   * below and puts every finished message back into each streaming frame's render.
   */
  onRegenerate?: (prompt: string) => void;
  regeneratePrompt?: string;
  onFocusInput?: () => void;
  onScaffoldDecision?: (
    approval: JainaToolApprovalRequiredPayload,
    decision: ScaffoldDecision,
  ) => void;
  /** Decisions submitted but not yet echoed back by a tool.approval_resolved frame. */
  optimisticScaffoldDecisions?: Record<string, ScaffoldDecision>;
};

function JainaMessageItemImpl({
  message,
  activeResponseId,
  state,
  onSuggestionClick,
  onPlanFeedback,
  onRegenerate,
  regeneratePrompt,
  onFocusInput,
  onScaffoldDecision,
  optimisticScaffoldDecisions,
}: JainaMessageItemProps) {
  const isStreaming = message.id === activeResponseId;

  const reasoning = isStreaming ? state.progress : message.reasoning;
  const toolCalls = isStreaming ? state.toolCalls : message.toolCalls;
  const toolResults = isStreaming ? state.toolResults : message.toolResults;
  const objectives = isStreaming ? state.objectives : message.objectives;
  // Cross-agent calls: live from the stream state while the turn runs, then
  // from the message once it is persisted with the turn.
  const delegations = isStreaming ? state.delegations : message.delegations;
  // The scaffold and its gate. Live from the stream while the turn runs; on reload
  // they come back through the durable run-event projection, which re-folds the same
  // frames through the same reducer.
  const scaffold = isStreaming ? state.scaffold : (message.scaffold ?? null);
  const pendingApprovals = isStreaming
    ? state.pendingToolApprovals
    : (message.pendingToolApprovals ?? []);
  const resolvedApprovals = isStreaming
    ? state.resolvedApprovals
    : (message.resolvedApprovals ?? {});
  const scaffoldApproval =
    pendingApprovals.find((entry) => entry.toolName.startsWith('paid_scaffold_')) ?? null;
  const scaffoldResolution = scaffoldApproval
    ? (resolvedApprovals[scaffoldApproval.approvalId] ?? null)
    : null;
  const scaffoldDenial =
    (isStreaming ? state.deniedToolOutputs : []).find((entry) =>
      entry.toolName.startsWith('paid_scaffold_'),
    ) ?? null;
  const report = isStreaming ? state.report : message.report;
  const reportV2 = isStreaming ? state.reportV2 : message.reportV2;
  const plan = message.plan;

  const structuredReport = React.useMemo(() => {
    if (!report || ('type' in report && report.type === 'direct_answer')) return null;
    const parsed = frontendCheckpointReportSchema.safeParse(report);
    return parsed.success ? parsed.data : null;
  }, [report]);

  const shouldRenderInlineReport = Boolean(structuredReport && hasReportContent(structuredReport));
  const isStructuredJsonContent = isLikelyStructuredJsonMessage(message.content);
  const hasStructuredChild = Boolean(
    shouldRenderInlineReport || reportV2 || plan || message.pendingClarification,
  );
  const shouldHideMarkdownContent = isStructuredJsonContent && hasStructuredChild;
  const trimmedContent = message.content.trim();

  // Suppress SafeMarkdown when it would just repeat the report's executive summary
  const isRedundantReportContent = Boolean(
    trimmedContent && reportV2?.executive_summary?.trim() === trimmedContent,
  );

  const hasRenderableContent =
    trimmedContent.length > 0 && !shouldHideMarkdownContent && !isRedundantReportContent;

  const structuredFallbackContent = React.useMemo(() => {
    if (shouldRenderInlineReport || reportV2) return null;
    return (
      extractRenderableFallbackFromReport(report ?? null) ??
      (isStructuredJsonContent
        ? extractRenderableFallbackFromStructuredContent(message.content)
        : null)
    );
  }, [isStructuredJsonContent, message.content, report, reportV2, shouldRenderInlineReport]);

  const showStaticFallback =
    !isStreaming &&
    message.role === 'assistant' &&
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
        r.name === 'spawn_worker' && r.ok && !!r.output,
    );
  }, [toolResults]);

  return (
    <ChatMessage id={message.id} role={message.role} anchor={message.role === 'user'}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="group w-full space-y-4"
      >
        {message.role === 'user' ? (
          <>
            <span className="text-sm font-medium whitespace-pre-wrap">
              <MentionifiedText text={message.content} references={message.metadata?.references} />
            </span>
            <ChatMediaGrid
              items={mediaFromPersistedAttachments(message.id, message.metadata?.attachments)}
              lightboxTitle="Attachment"
            />
          </>
        ) : (
          <>
            {hasRenderableContent ? (
              <div className="relative">
                <SafeMarkdown
                  content={normalizeJainaMarkdownTables(message.content)}
                  className="text-base leading-7 text-foreground"
                  mode={isStreaming ? 'streaming' : 'static'}
                  isAnimating={isStreaming}
                />
                {isStreaming && isStreamingPlaceholderMessage(message.content) ? (
                  <motion.span
                    aria-hidden="true"
                    className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] rounded-sm bg-primary"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ) : null}
              </div>
            ) : null}

            {showStaticFallback ? (
              <span className="text-sm text-muted-foreground">Response complete.</span>
            ) : null}

            {structuredFallbackContent ? (
              <SafeMarkdown
                content={normalizeJainaMarkdownTables(structuredFallbackContent)}
                className="text-base leading-7 text-foreground"
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

            {(delegations ?? []).length > 0 ? (
              <div className="flex flex-col gap-2">
                {(delegations ?? []).map((delegation) => (
                  <AgentDelegatedCard key={delegation.callId} data={delegation} />
                ))}
              </div>
            ) : null}

            <ObjectivesQueue objectives={objectives ?? []} isStreaming={isStreaming} />

            {scaffold ? (
              <PaidScaffoldCard
                scaffold={scaffold}
                approval={scaffoldApproval}
                resolution={scaffoldResolution}
                denial={scaffoldDenial}
                optimisticDecision={
                  scaffoldApproval
                    ? (optimisticScaffoldDecisions?.[scaffoldApproval.approvalId] ?? null)
                    : null
                }
                isStreaming={isStreaming}
                {...(onScaffoldDecision ? { onDecide: onScaffoldDecision } : {})}
              />
            ) : null}

            <AudienceGroupApprovalCard
              toolResults={toolResults ?? []}
              isStreaming={isStreaming}
              onApprove={onSuggestionClick}
            />

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

            {!isStreaming && message.status === 'done' ? (
              <MessageActionBar
                content={message.content}
                onRegenerate={
                  onRegenerate && regeneratePrompt
                    ? () => onRegenerate(regeneratePrompt)
                    : undefined
                }
              />
            ) : null}
          </>
        )}
      </motion.div>
    </ChatMessage>
  );
}

/**
 * A streaming turn re-folds state many times a second, and each fold re-renders the transcript.
 * Without this, every prior message re-runs its Markdown parse (Shiki/math/mermaid) and every
 * chart in every earlier report re-renders — for messages that cannot have changed.
 *
 * The memo only bites while the props of a finished message stay referentially equal: the surface
 * keeps each message object's identity across updates, hands non-live items a shared idle stream
 * state, and passes the regenerate prompt as a string rather than a freshly-closed thunk.
 */
export const JainaMessageItem = React.memo(JainaMessageItemImpl);
