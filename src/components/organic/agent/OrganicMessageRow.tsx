'use client';

import type { MediaSearchResultsFrame } from '@continuum/contracts';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { AgentDelegatedCard } from '@/components/agents/AgentDelegatedCard';
import { ChatMarker } from '@/components/chat/ChatMarker';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatMediaGrid } from '@/components/chat/media/ChatMedia';
import { MediaStrip } from '@/components/chat/media/MediaStrip';
import { mediaFromPersistedAttachments } from '@/components/chat/media/media';
import { MentionifiedText } from '@/components/chat/mentionified-text';
import { AgentButton } from '@/components/shared/agent-cards/agentCardKit';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { ActiveStagesPanel } from './ActiveStagesPanel';
import { AeoSnapshotCard } from './AeoSnapshotCard';
import { AgentWorkingIndicator } from './AgentWorkingIndicator';
import { BulkPlanCard } from './BulkPlanCard';
import { BulkRunPanel } from './BulkRunPanel';
import { ConceptPlan } from './ConceptPlan';
import { milestonesForMessage } from './deriveOrganicAnchors';
import { MediaLibrarySearchResults } from './MediaLibrarySearchResults';
import { MessageActions } from './MessageActions';
import { OrganicThinkingPanel } from './OrganicThinkingPanel';
import { ToolCallPipelineCards } from './PipelinePlacementGrid';
import { presentAgentMessage } from './presentAgentMessage';
import { SkillProposalCard } from './SkillProposalCard';
import { TrendChartCard } from './TrendChartCard';
import type {
  AgentJobState,
  ConversationMessage,
  PipelineCardState,
  PipelineStageNode,
  PlanApprovalDecision,
  PlanItemStatus,
  UiCard,
} from './types';
import { useAssetMediaRecovery } from './useAssetMediaRecovery';
import type { BulkRunRef } from './useOrganicAgentReducer';

// Wide children a markdown answer can legitimately contain — a code block, a data table —
// scroll inside their own box. Anything else and the bubble either clips the answer or the
// answer pushes the whole transcript sideways.
const ASSISTANT_MARKDOWN_CLASS =
  'text-base leading-7 text-foreground text-pretty [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_a]:break-words [&_code]:break-words';

export const NO_ACTIVE_STAGES: PipelineStageNode[] = [];

/**
 * ONE actions object for every transcript row, for the life of the panel, forwarding to
 * the latest handlers. Several handlers close over `state.messages`, so handing rows the
 * handlers themselves would re-render every memoized row on every stream delta.
 */
export function useStableRowActions(actions: OrganicMessageRowActions): OrganicMessageRowActions {
  const latest = useRef(actions);
  useLayoutEffect(() => {
    latest.current = actions;
  });
  return useMemo(
    () => ({
      onEnrichDraft: (...args) => latest.current.onEnrichDraft(...args),
      onGenerateMedia: (...args) => latest.current.onGenerateMedia(...args),
      onRetryJob: (...args) => latest.current.onRetryJob(...args),
      onPlanDecision: (...args) => latest.current.onPlanDecision(...args),
      onStartBulkRun: (...args) => latest.current.onStartBulkRun(...args),
      onOpenDraftIn: (...args) => latest.current.onOpenDraftIn(...args),
      onViewDraft: (...args) => latest.current.onViewDraft(...args),
      onUseAsset: (...args) => latest.current.onUseAsset(...args),
      onSkillSaved: () => latest.current.onSkillSaved(),
      onRetryTurn: (...args) => latest.current.onRetryTurn(...args),
    }),
    [],
  );
}

// What each strip-producing tool found, as the strip's caption. A tool not listed gets none.
const MEDIA_STRIP_LABELS: Record<string, string> = {
  searchMediaLibrary: 'Library',
  listDrafts: 'Drafts',
  getDraft: 'Draft',
  listOwnInstagramMedia: 'Recent media',
  getTopPosts: 'Top posts',
  getMediaDetails: 'Media',
  getCalendarPostedContent: 'Posted content',
  getCompetitorInstagramTopPosts: 'Competitor posts',
  listCompetitorInstagramPosts: 'Competitor posts',
  listCompetitorAds: 'Competitor ads',
  headlessStillCreate: 'New stills',
  headlessGuidedCreate: 'New stills',
  headlessReelCreate: 'Opening frames',
  generateReelVideos: 'New reels',
  unsplashSearch: 'Unsplash',
  getFacebookPostDetail: 'Facebook post',
  getTikTokPostDetail: 'TikTok post',
  getFacebookOrganicAnalytics: 'Facebook posts',
  getTikTokOrganicAnalytics: 'TikTok posts',
  getYouTubeOrganicAnalytics: 'YouTube videos',
  getOrganicAwarenessReport: 'Top posts',
  correlateTrendsToPosts: 'Matched posts',
};

// Stable identity per rendered card so React reconciliation and enter-animations
// key off the card's own id instead of its array index (which shifts as cards
// interleave during a turn).
function cardKey(card: UiCard, index: number): string {
  switch (card.type) {
    case 'plan_card':
      return `plan_card:${card.data.planId}`;
    case 'bulk_plan_card':
      return `bulk_plan_card:${card.data.planId}`;
    case 'trend_chart':
      return `trend_chart:${card.data.title || index}`;
    case 'media_strip':
      return `media_strip:${card.data.toolCallId}`;
    case 'skill_proposal':
      return `skill_proposal:${card.data.proposalId}`;
    case 'aeo_snapshot':
      return `aeo_snapshot:${card.data.snapshotId}`;
    case 'agent_delegated':
      return `agent_delegated:${card.data.callId}`;
    default:
      return String(index);
  }
}

/**
 * Everything a row can ask the panel to do. The panel hands over ONE object whose
 * identity never changes (each entry forwards to the latest handler), so a handler
 * closing over `state.messages` cannot re-render every row on every stream delta.
 */
export type OrganicMessageRowActions = {
  onEnrichDraft: (draftId: string) => void;
  onGenerateMedia: (draftId: string, format: string, previewRevision: string) => void;
  onRetryJob: (jobId: string) => void;
  onPlanDecision: (decision: PlanApprovalDecision) => void;
  onStartBulkRun: (run: BulkRunRef) => void;
  onOpenDraftIn: (draftId: string, target: 'calendar' | 'list') => void;
  onViewDraft: (draftId: string) => void;
  onUseAsset: (item: MediaSearchResultsFrame['data']['items'][number]) => void;
  onSkillSaved: () => void;
  onRetryTurn: (messageId: string) => void;
};

export type OrganicMessageRowProps = {
  msg: ConversationMessage;
  brandId: string;
  /** This row is the one the stream is writing into. */
  isStreamingRow: boolean;
  /** Live stage strip; the panel passes NO_ACTIVE_STAGES to every other row. */
  activeStages: PipelineStageNode[];
  autoRetryPending: boolean;
  /** A turn is streaming somewhere in the session (disables retry/regenerate). */
  isStreaming: boolean;
  inputDisabled: boolean;
  pipeline: Record<string, PipelineCardState>;
  pipelineCardsByToolCallId: Map<string, PipelineCardState[]>;
  planItemStatus: Record<string, PlanItemStatus>;
  bulkRuns: Record<string, BulkRunRef>;
  jobs: Record<string, AgentJobState>;
  actions: OrganicMessageRowActions;
};

/** The run-state slices a row reads. They change on pipeline and job frames. */
export type OrganicRowRunState = Pick<
  OrganicMessageRowProps,
  'pipeline' | 'pipelineCardsByToolCallId' | 'planItemStatus' | 'bulkRuns' | 'jobs'
>;

const NO_RUN_STATE: OrganicRowRunState = {
  pipeline: {},
  pipelineCardsByToolCallId: new Map(),
  planItemStatus: {},
  bulkRuns: {},
  jobs: {},
};

/**
 * Only an assistant turn with tool calls or cards reads run state. Every other row gets
 * frozen empties, so a pipeline or job frame skips it the way a text delta does.
 */
export function rowRunState(
  msg: ConversationMessage,
  live: OrganicRowRunState,
): OrganicRowRunState {
  const readsRunState =
    msg.role === 'assistant' &&
    ((msg.toolCalls?.length ?? 0) > 0 || (msg.uiCards?.length ?? 0) > 0);
  return readsRunState ? live : NO_RUN_STATE;
}

/**
 * One transcript turn. Memoized on shallow props: a text delta replaces only the
 * streaming message object (the reducer keeps every other message's identity), so
 * only the streaming row re-renders. Long threads stay cheap off-screen through the
 * `content-visibility: auto` every ChatMessage carries (MessageScrollerItem).
 */
export const OrganicMessageRow = memo(function OrganicMessageRow({
  msg,
  brandId,
  isStreamingRow,
  activeStages,
  autoRetryPending,
  isStreaming,
  inputDisabled,
  pipeline,
  pipelineCardsByToolCallId,
  planItemStatus,
  bulkRuns,
  jobs,
  actions,
}: OrganicMessageRowProps) {
  // Composer uploads persist a 1h signed URL with their asset id: a failed tile re-signs.
  const { recover: recoverAttachment, resolve } = useAssetMediaRecovery(brandId);
  const attachments = useMemo(
    () => mediaFromPersistedAttachments(msg.id, msg.metadata?.attachments).map(resolve),
    [msg.id, msg.metadata?.attachments, resolve],
  );

  return (
    <>
      <ChatMessage id={msg.id} role={msg.role}>
        <div className="space-y-2">
          {msg.role === 'assistant' ? (
            msg.content ? (
              <SafeMarkdown
                content={presentAgentMessage(msg.content)}
                className={ASSISTANT_MARKDOWN_CLASS}
                mode={isStreamingRow ? 'streaming' : 'static'}
                isAnimating={isStreamingRow}
              />
            ) : isStreamingRow && (msg.toolCalls?.length ?? 0) === 0 && !msg.error ? (
              <AgentWorkingIndicator />
            ) : null
          ) : (
            <>
              <p className="group whitespace-pre-wrap text-base leading-relaxed">
                <MentionifiedText
                  text={msg.content}
                  references={msg.metadata?.references}
                  brandId={brandId}
                />
              </p>
              <ChatMediaGrid
                items={attachments}
                lightboxTitle="Attachment"
                onRecoverItem={recoverAttachment}
              />
            </>
          )}
          <OrganicThinkingPanel toolCalls={msg.toolCalls ?? []} isStreaming={isStreamingRow} />
          <ToolCallPipelineCards
            toolCalls={msg.toolCalls ?? []}
            cardsByToolCallId={pipelineCardsByToolCallId}
            onEnrichDraft={actions.onEnrichDraft}
            onGenerateMedia={actions.onGenerateMedia}
          />
          <ActiveStagesPanel stages={activeStages} isStreaming={isStreamingRow} />
          {msg.mediaSearchResults && msg.mediaSearchResults.length > 0 && (
            <div className="space-y-2">
              {msg.mediaSearchResults.map((frame, i) => (
                <MediaLibrarySearchResults
                  key={`media:${i}:${typeof frame.data?.query === 'string' ? frame.data.query : ''}`}
                  frame={frame}
                  disabled={inputDisabled}
                  onUseAsset={actions.onUseAsset}
                />
              ))}
            </div>
          )}
          {msg.uiCards && msg.uiCards.length > 0 && (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {msg.uiCards.map((card, i) => {
                  const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];
                  if (card.type === 'trend_chart') {
                    return (
                      <motion.div
                        key={cardKey(card, i)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.18, ease }}
                      >
                        <TrendChartCard chart={card.data} />
                      </motion.div>
                    );
                  }
                  if (card.type === 'plan_card') {
                    const planId = card.data.planId;
                    const pipelineCards = Object.values(pipeline).filter(
                      (p) => p.planId === planId,
                    );
                    return (
                      <motion.div
                        key={cardKey(card, i)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.18, ease }}
                      >
                        <ConceptPlan
                          plan={card.data}
                          planItemStatus={planItemStatus}
                          pipeline={pipelineCards}
                          onGenerateItemAction={(itemId, clientKey) =>
                            actions.onPlanDecision({
                              decision: 'approve',
                              planId,
                              itemId,
                              clientKey,
                            })
                          }
                          onGenerateAllAction={(itemIds) =>
                            actions.onPlanDecision({ decision: 'approve', planId, itemIds })
                          }
                          onRejectAction={() =>
                            actions.onPlanDecision({ decision: 'reject', planId })
                          }
                          onViewDraftAction={actions.onOpenDraftIn}
                          onEnrichDraftAction={actions.onEnrichDraft}
                          onGenerateMediaAction={actions.onGenerateMedia}
                          onRetryJobAction={actions.onRetryJob}
                        />
                      </motion.div>
                    );
                  }
                  if (card.type === 'bulk_plan_card') {
                    const planId = card.data.planId;
                    const runId = `run_${planId}`;
                    const run = bulkRuns[runId];
                    return (
                      <motion.div
                        key={cardKey(card, i)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.18, ease }}
                        className="space-y-2"
                      >
                        <BulkPlanCard
                          plan={card.data}
                          onApproveAction={() => {
                            actions.onStartBulkRun({
                              runId,
                              planId,
                              total: card.data.placements.length,
                            });
                            actions.onPlanDecision({ decision: 'approve', planId });
                          }}
                          onRejectAction={() =>
                            actions.onPlanDecision({ decision: 'reject', planId })
                          }
                        />
                        {run && (
                          <BulkRunPanel runId={run.runId} total={run.total} brandId={brandId} />
                        )}
                      </motion.div>
                    );
                  }
                  if (card.type === 'media_strip') {
                    // No entrance animation: the tiles' fixed boxes are the reveal, and an
                    // opacity ramp would hold the first thumbnail back from the paint.
                    return (
                      <MediaStrip
                        key={cardKey(card, i)}
                        brandId={brandId}
                        items={card.data.items}
                        total={card.data.total}
                        label={MEDIA_STRIP_LABELS[card.data.toolName]}
                        stripId={card.data.toolCallId}
                      />
                    );
                  }
                  if (card.type === 'skill_proposal') {
                    return (
                      <motion.div
                        key={cardKey(card, i)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.18, ease }}
                      >
                        <SkillProposalCard
                          proposal={card.data}
                          onSavedAction={actions.onSkillSaved}
                        />
                      </motion.div>
                    );
                  }
                  if (card.type === 'agent_delegated') {
                    return (
                      <motion.div
                        key={cardKey(card, i)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.18, ease }}
                      >
                        <AgentDelegatedCard data={card.data} />
                      </motion.div>
                    );
                  }
                  if (card.type === 'aeo_snapshot') {
                    return (
                      <motion.div
                        key={cardKey(card, i)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.18, ease }}
                      >
                        <AeoSnapshotCard snapshot={card.data} />
                      </motion.div>
                    );
                  }
                  return null;
                })}
              </AnimatePresence>
            </div>
          )}
          {msg.role === 'assistant' && !msg.error ? (
            <MessageDraftLinks
              message={msg}
              pipelineCardsByToolCallId={pipelineCardsByToolCallId}
              jobs={jobs}
              onViewDraft={actions.onViewDraft}
            />
          ) : null}
          {msg.role === 'assistant' && msg.error && !autoRetryPending ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <span className="min-w-0 text-sm text-destructive">{msg.error}</span>
              <AgentButton
                variant="ghost"
                disabled={isStreaming}
                onClick={() => actions.onRetryTurn(msg.id)}
              >
                <RefreshCw className="size-3.5" />
                Retry
              </AgentButton>
            </div>
          ) : null}
          {msg.role === 'assistant' && !msg.error && msg.content && !isStreamingRow ? (
            <MessageActions
              content={msg.content}
              onRegenerate={() => actions.onRetryTurn(msg.id)}
              disabled={isStreaming}
            />
          ) : null}
        </div>
      </ChatMessage>
      {milestonesForMessage(msg, pipeline).map((milestone) => (
        <ChatMarker key={milestone.id} id={milestone.id} kind="milestone" label={milestone.label} />
      ))}
    </>
  );
});

// The planner draft(s) an assistant turn produced, resolved from the same
// tool-call linkage the transcript already uses to render pipeline cards inline:
// message tool call -> pipeline card / durable job -> draftId. Purely derived, so
// it works for live turns and restored sessions alike without any new plumbing.
function draftIdsForMessage(
  message: ConversationMessage,
  pipelineCardsByToolCallId: ReadonlyMap<string, PipelineCardState[]>,
  jobs: Readonly<Record<string, AgentJobState>>,
): string[] {
  if (message.role !== 'assistant') return [];
  const toolCallIds = new Set((message.toolCalls ?? []).map((call) => call.toolCallId));
  if (toolCallIds.size === 0) return [];

  const draftIds = new Set<string>();
  for (const toolCallId of toolCallIds) {
    for (const card of pipelineCardsByToolCallId.get(toolCallId) ?? []) {
      if (card.draftId) draftIds.add(card.draftId);
    }
  }
  for (const job of Object.values(jobs)) {
    if (job.toolCallId && toolCallIds.has(job.toolCallId) && job.draftId) {
      draftIds.add(job.draftId);
    }
  }
  return Array.from(draftIds);
}

// Persistent "View post" CTA(s) on an assistant turn that produced a draft, so the
// ready post is always one obvious click away from the chat — the old text-based
// linkifier never fired because the backend does not emit a "Draft ID:" line.
function MessageDraftLinks({
  message,
  pipelineCardsByToolCallId,
  jobs,
  onViewDraft,
}: {
  message: ConversationMessage;
  pipelineCardsByToolCallId: ReadonlyMap<string, PipelineCardState[]>;
  jobs: Readonly<Record<string, AgentJobState>>;
  onViewDraft: (draftId: string) => void;
}) {
  const draftIds = draftIdsForMessage(message, pipelineCardsByToolCallId, jobs);
  if (draftIds.length === 0) return null;
  const multiple = draftIds.length > 1;

  return (
    <div className="flex flex-wrap gap-2 pt-0.5">
      {draftIds.map((draftId, index) => (
        <button
          key={draftId}
          type="button"
          onClick={() => onViewDraft(draftId)}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-primary/40 bg-brand-primary/5 px-3 py-1 text-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/10"
        >
          {multiple ? `View post ${index + 1}` : 'View post'}
          <ArrowRight className="size-3" />
        </button>
      ))}
    </div>
  );
}
