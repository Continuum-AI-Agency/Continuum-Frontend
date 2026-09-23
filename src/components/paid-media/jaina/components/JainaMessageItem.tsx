'use client';

import type { JainaToolApprovalRequiredPayload } from '@continuum/contracts';
import { motion } from 'motion/react';
import * as React from 'react';
import { AgentDelegatedCard } from '@/components/agents/AgentDelegatedCard';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatMediaGrid } from '@/components/chat/media/ChatMedia';
import { mediaFromPersistedAttachments } from '@/components/chat/media/media';
import { MentionifiedText } from '@/components/chat/mentionified-text';
import { JainaOptimizerCitations } from '@/components/paid-media/jaina/blocks/JainaOptimizerCitations';
import { JainaOptimizerHyperframes } from '@/components/paid-media/jaina/blocks/JainaOptimizerHyperframes';
import { PaidScaffoldCard } from '@/components/paid-media/jaina/scaffold/PaidScaffoldCard';
import {
  type CreativeArtifact,
  frontendCheckpointReportSchema,
  hasReportContent,
  type ToolResultEventData,
} from '@/lib/jaina/schemas';
import { JainaProse } from '../blocks/prose';
import {
  extractRenderableFallbackFromReport,
  extractRenderableFallbackFromStructuredContent,
  isStreamingPlaceholderMessage,
  normalizeJainaMarkdownTables,
} from '../jainaUtils';
import type { JainaChatMessage } from '../types';
import { ClarificationBanner } from './ClarificationBanner';
import { CreativesSection } from './CreativesSection';
import { JainaInlineReport } from './JainaInlineReport';
import { JainaReportV2 } from './JainaReportV2';
import { JainaToolApprovalCard, type ToolApprovalDecision } from './JainaToolApprovalCard';
import { MessageActionBar } from './MessageActionBar';
import { ObjectivesQueue } from './ObjectivesQueue';
import { PaidCreativeRenderStatus } from './PaidCreativeRenderStatus';
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
  /**
   * The ONE source for everything this turn renders, streaming or finished.
   *
   * There used to be a second: a raw `JainaStreamState` prop, read through fourteen
   * `isStreaming ? state.X : message.X` ternaries. Two sources for one turn is what let a
   * persisted snapshot overwrite a live answer. `toJainaChatMessage` now projects the SDK's
   * `message.parts` into this shape, so a streaming turn and a reloaded one are the same object.
   */
  message: JainaChatMessage;
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
  onApprovalDecision?: (
    approval: JainaToolApprovalRequiredPayload,
    decision: ToolApprovalDecision,
  ) => void;
  /** Decisions submitted but not yet echoed back by a tool.approval_resolved frame. */
  optimisticApprovalDecisions?: Record<string, ToolApprovalDecision>;
  /**
   * Opens the optimizer's account read — what a cited optimizer figure points at.
   *
   * Only the shell that owns the paid-media tabs can honour it, so it arrives from there rather
   * than being hand-rolled here: the tab is React state on that shell and where to land inside
   * the optimizer is URL state, and both have to move for the chip to reach anything.
   */
  onOpenAccountRead?: (readId: string) => void;
};

function JainaMessageItemImpl({
  message,
  onSuggestionClick,
  onPlanFeedback,
  onRegenerate,
  regeneratePrompt,
  onFocusInput,
  onApprovalDecision,
  optimisticApprovalDecisions,
  onOpenAccountRead,
}: JainaMessageItemProps) {
  const isStreaming = message.status === 'streaming';

  const reasoning = message.reasoning;
  const toolCalls = message.toolCalls;
  const toolResults = message.toolResults;
  const objectives = message.objectives;
  const delegations = message.delegations;
  const scaffold = message.scaffold ?? null;
  const pendingApprovals = message.pendingToolApprovals ?? [];
  const resolvedApprovals = message.resolvedApprovals ?? {};
  const scaffoldApproval =
    pendingApprovals.find((entry) => entry.toolName.startsWith('paid_scaffold_')) ?? null;
  // Every OTHER gated tool. The scaffold keeps its own card because it has a tree to
  // render; these are answered from the proposed arguments alone.
  const toolApprovals = pendingApprovals.filter(
    (entry) => !entry.toolName.startsWith('paid_scaffold_'),
  );
  // Once answered, the approval leaves `pending`, so the decision is read back from the
  // resolved map — otherwise a denied gate would lose its "Declined" the moment it was clicked.
  const scaffoldResolution = scaffoldApproval
    ? (resolvedApprovals[scaffoldApproval.approvalId] ?? null)
    : (Object.values(resolvedApprovals).find((entry) =>
        entry.toolName?.startsWith('paid_scaffold_'),
      ) ?? null);
  const scaffoldDenial =
    (message.deniedToolOutputs ?? []).find((entry) =>
      entry.toolName.startsWith('paid_scaffold_'),
    ) ?? null;
  const report = message.report;
  const reportV2 = message.reportV2;
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

  const artifacts = message.artifacts;
  const optimizerCitations = message.optimizerCitations ?? [];
  const optimizerHyperframes = message.optimizerHyperframes ?? [];
  const paidCreativeRenders = message.paidCreativeRenders ?? [];
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
    <ChatMessage id={message.id} role={message.role}>
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
                <JainaProse
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
              <span className="text-sm text-muted-foreground">
                {message.status === 'error'
                  ? 'Jaina could not finish this response.'
                  : 'Response complete.'}
              </span>
            ) : null}

            {structuredFallbackContent ? (
              <JainaProse
                content={normalizeJainaMarkdownTables(structuredFallbackContent)}
                className="text-base leading-7 text-foreground"
                mode="static"
                isAnimating={false}
              />
            ) : null}

            {/* Directly under the prose it supports. It used to render last in the turn —
             *  after the plan, the report and the creatives — so the evidence for the first
             *  sentence sat below content that had nothing to do with it. */}
            {optimizerCitations.length > 0 ? (
              <JainaOptimizerCitations
                citations={optimizerCitations}
                onOpenRead={onOpenAccountRead}
              />
            ) : null}

            {/* A compiled card is evidence for the same sentence, so it sits with the cited
             *  ones rather than at the end of the turn. */}
            {optimizerHyperframes.length > 0 ? (
              <JainaOptimizerHyperframes sets={optimizerHyperframes} />
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
                    ? (optimisticApprovalDecisions?.[scaffoldApproval.approvalId] ?? null)
                    : null
                }
                isStreaming={isStreaming}
                {...(onApprovalDecision ? { onDecide: onApprovalDecision } : {})}
              />
            ) : null}

            {toolApprovals.map((approval) => (
              <JainaToolApprovalCard
                key={approval.approvalId}
                approval={approval}
                optimisticDecision={optimisticApprovalDecisions?.[approval.approvalId] ?? null}
                isStreaming={isStreaming}
                {...(onApprovalDecision ? { onDecide: onApprovalDecision } : {})}
              />
            ))}

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
                  runId={message.runId}
                  deliverySource={message.deliverySource}
                  sourcePrompt={regeneratePrompt}
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

            {paidCreativeRenders.map((render) => (
              <PaidCreativeRenderStatus key={render.render_job_id} render={render} />
            ))}

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
 * The memo only bites while the props of a finished message stay referentially equal, so the
 * surface must memoize `toJainaChatMessage` per message rather than re-project the whole
 * transcript each frame. The projection is pure, so that memo is sound; the regenerate prompt is
 * passed as a string rather than a freshly-closed thunk for the same reason.
 */
export const JainaMessageItem = React.memo(JainaMessageItemImpl);
