'use client';

import type { Skill } from '@continuum/contracts';
import { RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Suggestion } from '@/components/ai-elements/suggestion';
import { AutomatePromptAction } from '@/components/automations/AutomatePromptAction';
import { AutomationSheets } from '@/components/automations/AutomationSheets';
import type { Attachment } from '@/components/chat/attachments';
import { ChatMarker } from '@/components/chat/ChatMarker';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatTranscript } from '@/components/chat/ChatTranscript';
import { ChatMediaGrid } from '@/components/chat/media/ChatMedia';
import { mediaFromPersistedAttachments } from '@/components/chat/media/media';
import { MentionifiedText } from '@/components/chat/mentionified-text';
import { PromptInput } from '@/components/chat/prompt-input';
import { useChatAttachments } from '@/components/chat/useChatAttachments';
import { useEarlierHistory } from '@/components/chat/useEarlierHistory';
import { useCalendarRunStream } from '@/components/organic/hooks/useCalendarRunStream';
import { useGenerateDraftMedia } from '@/components/organic/hooks/useGenerateDraftMedia';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganicAgentStream } from '@/hooks/useOrganicAgentStream';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { useProjectedRun } from './useProjectedRun';
import { useSession } from '@/hooks/useSession';
import {
  fetchCreativeInsightSuggestions,
  fetchOrganicInsightSuggestions,
  fetchWhatChangedSuggestions,
  filterKpiSuggestions,
  insightFamilySuggestions,
  KPI_COMPUTED_INSIGHTS_FOLDER_KEY,
  KPI_INSIGHTS_FOLDER_KEY,
  KPI_METRICS_FOLDER_KEY,
  KPI_PACKS_FOLDER_KEY,
  KPI_WHAT_CHANGED_FOLDER_KEY,
  KPI_WHATS_WORKING_FOLDER_KEY,
  kpiSubfolderSuggestions,
  metricCatalogToKpiSuggestions,
  type OptimizationPackId,
  optimizationPackFolderSuggestions,
  optimizationPackToSuggestions,
} from '@/lib/agent/kpi-mentions';
import {
  fetchMediaLibraryFolders,
  fetchMediaMentionAssets,
  mediaAssetToMentionSuggestion,
  parseMediaFolderKey,
} from '@/lib/agent/media-mentions';
import { useAgentMentionQueueStore } from '@/lib/agent/mention-queue-store';
import type {
  AgentMentionProvider,
  AgentMentionReference,
  AgentMentionSuggestion,
} from '@/lib/agent-references';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import {
  fetchOrganicSessionMessagePage,
  type OrganicSessionMessage,
} from '@/lib/organic/agent-sessions';
import { useGenerationSummaries } from '@/lib/organic/generationSummaries';
import { useBrandSkills } from '@/lib/organic/skills';
import { useCalendarStore } from '@/lib/organic/store';
import { useStudioStore } from '@/StudioCanvas/stores/useStudioStore';
import type { StudioNode } from '@/StudioCanvas/types';
import { DisabledControl } from '../DisabledControl';
import { describeComposerBlock } from '../disabledReasons';
import { ActiveStagesPanel } from './ActiveStagesPanel';
import { AeoSnapshotCard } from './AeoSnapshotCard';
import { AgentWorkingIndicator } from './AgentWorkingIndicator';
import { AgentButton } from './agentCardKit';
import { BulkPlanCard } from './BulkPlanCard';
import { BulkRunPanel } from './BulkRunPanel';
import { ConceptPlan } from './ConceptPlan';
import { buildCanvasReference, getCanvasPreview } from './canvasMentions';
import { resolveConceptPreviewUrl } from './conceptPreview';
import { deriveOrganicAnchors, milestonesForMessage } from './deriveOrganicAnchors';
import { JobGrid } from './JobGrid';
import { MediaLibrarySearchResults } from './MediaLibrarySearchResults';
import { MessageActions } from './MessageActions';
import { mapPlacementToDraft } from './mapPlacementToDraft';
import { OrganicSessionSidebar } from './OrganicSessionSidebar';
import { OrganicThinkingPanel } from './OrganicThinkingPanel';
import { ToolCallPipelineCards } from './PipelinePlacementGrid';
import { PostContentCardGrid } from './PostContentCardGrid';
import { restoreSessionFromMessages } from './restoreSession';
import { SkillPickerButton } from './SkillPickerButton';
import { SkillProposalCard } from './SkillProposalCard';
import { SkillWizardLauncher } from './SkillWizard/SkillWizardLauncher';
import { ToolApprovalCard } from './ToolApprovalCard';
import { TrendChartCard } from './TrendChartCard';
import type {
  AgentJobState,
  ConversationMessage,
  PipelineCardState,
  PlanApprovalDecision,
  ToolApproval,
  UiCard,
} from './types';
import { initialPanelState, panelReducer } from './useOrganicAgentReducer';
import { useOrganicSessions } from './useOrganicSessions';

/** Top-level @-menu folders (order is display order). Nested children drill via keys. */
const ROOT_MENTION_FOLDERS: Array<{
  key: string;
  label: string;
  type: AgentMentionSuggestion['type'];
  childrenLabel: string;
}> = [
  { key: 'folder:Brain', label: 'Brain', type: 'document', childrenLabel: 'Brand documents' },
  { key: 'folder:Skills', label: 'Skills', type: 'skill', childrenLabel: 'Brand skills & library' },
  {
    key: 'folder:Media',
    label: 'Media',
    type: 'media_asset',
    childrenLabel: 'Canvas & media library',
  },
  // Trends + events + questions share one nest (planner/signal surface).
  {
    key: 'folder:Signals',
    label: 'Signals',
    type: 'trend',
    childrenLabel: 'Trends, events, questions',
  },
  { key: 'folder:Drafts', label: 'Drafts', type: 'draft', childrenLabel: 'Scheduled & backlog' },
  {
    key: 'folder:KPIs',
    label: 'KPIs',
    type: 'kpi',
    childrenLabel: "Metrics, What's Working, insights",
  },
];

const SKILLS_BRAND_FOLDER_KEY = 'folder:Skills:Brand';
const SKILLS_LIBRARY_FOLDER_KEY = 'folder:Skills:Library';
const MEDIA_CANVAS_FOLDER_KEY = 'folder:Media:Canvas';
const MEDIA_LIBRARY_FOLDER_KEY = 'folder:Media:Library';
const SIGNALS_TRENDS_FOLDER_KEY = 'folder:Signals:Trends';
const SIGNALS_EVENTS_FOLDER_KEY = 'folder:Signals:Events';
const SIGNALS_QUESTIONS_FOLDER_KEY = 'folder:Signals:Questions';

type OrganicAgentPanelProps = {
  brandId: string;
  platformAccountIds: Record<string, string>;
  mentionContext?: OrganicAgentMentionContext;
};

export type OrganicAgentMentionContext = {
  generationId?: string;
  weekStartDate?: string;
  trends: Array<{
    id: string;
    title: string;
    description?: string;
    relevanceToBrand?: string;
    source?: string;
    isSelected?: boolean;
  }>;
  events: Array<{
    id: string;
    title: string;
    date?: string;
    description?: string;
    opportunity?: string;
    isSelected?: boolean;
  }>;
  questions: Array<{
    id: string;
    question: string;
    niche?: string;
    socialPlatform?: string;
    contentTypeSuggestion?: string;
    whyRelevant?: string;
    isSelected?: boolean;
  }>;
  documents?: Array<{
    id: string;
    name: string;
    kind: string | null;
    text_excerpt: string | null;
  }>;
};

const STARTER_PROMPTS = [
  "Plan this week's posts",
  'Run an AEO snapshot',
  'Show me trending topics',
  'Draft an Instagram reel',
];

function resolveTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// ISO date (YYYY-MM-DD) of the Monday at or before today, in local time.
function currentWeekStartIso(): string {
  const now = new Date();
  const daysToMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  return monday.toISOString().slice(0, 10);
}

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
    case 'post_list':
      return `post_list:${card.label ?? index}`;
    case 'skill_proposal':
      return `skill_proposal:${card.data.proposalId}`;
    case 'aeo_snapshot':
      return `aeo_snapshot:${card.data.snapshotId}`;
    default:
      return String(index);
  }
}

function matchesMentionQuery(query: string, values: Array<string | null | undefined>) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => value?.toLowerCase().includes(normalized));
}

function createOrganicSuggestion(
  reference: AgentMentionReference,
  options: {
    key: string;
    group: string;
    description?: string;
    badge?: string;
    preview?: AgentMentionSuggestion['preview'];
  },
): AgentMentionSuggestion {
  return {
    key: options.key,
    label: reference.label,
    type: reference.type,
    source: reference.source,
    group: options.group,
    description: options.description,
    badge: options.badge,
    reference,
    preview: options.preview,
  };
}

function skillToMentionSuggestion(skill: Skill, group = 'Skills'): AgentMentionSuggestion {
  return createOrganicSuggestion(
    {
      id: skill.id,
      type: 'skill',
      // The @-mention token renders the stable slug (no spaces); resolution is by
      // skill id (metadata.skillId), never by this label. Template ids resolve
      // server-side via the widened getSkillsByIds (brand OR global template).
      label: skill.slug ?? skill.name,
      source: 'organic',
      metadata: {
        skillId: skill.id,
        kind: skill.kind,
        slug: skill.slug,
      },
    },
    {
      key: `skill:${skill.id}`,
      group,
      description: [
        skill.kind === 'analytic' ? 'analytic' : 'creative direction',
        skill.description,
      ]
        .filter(Boolean)
        .join(' · '),
      badge: 'skill',
    },
  );
}

function canvasNodeToMentionSuggestion(node: StudioNode): AgentMentionSuggestion {
  const preview = getCanvasPreview(node);
  return createOrganicSuggestion(buildCanvasReference(node), {
    key: `canvas:${node.id}`,
    group: 'Canvas',
    description: [node.type, preview?.kind].filter(Boolean).join(' · '),
    badge: 'canvas',
    preview,
  });
}

export function OrganicAgentPanel({
  brandId,
  platformAccountIds,
  mentionContext,
}: OrganicAgentPanelProps) {
  const [state, dispatch] = useReducer(panelReducer, undefined, initialPanelState);
  const { attachRun } = useCalendarRunStream();
  const requestCalendarRefetch = useCalendarStore((s) => s.requestCalendarRefetch);
  const handleCalendarDraftSignal = useCallback(() => {
    // Fetch-all reload pulls in the new draft wherever it landed.
    requestCalendarRefetch();
  }, [requestCalendarRefetch]);
  const { start, startControl, cancel, isStreaming, liveRunId } = useOrganicAgentStream(dispatch, {
    onRunStarted: attachRun,
    onCalendarDraftSignal: handleCalendarDraftSignal,
  });

  // Render a turn that was already in flight when we got here — you sent a message,
  // navigated away, and came back. The app-level store kept tailing the run the whole time;
  // this folds its frames into the transcript. Without it the panel hydrates from history,
  // which has no assistant message yet (that is only persisted when the run ENDS), and shows
  // a question with no answer and no sign anything is happening.
  useProjectedRun({
    sessionId: state.sessionId,
    dispatch,
    isHydrated: state.isHydrated,
    liveRunId,
  });

  // Suppress the completion toast for the conversation the user is actually watching.
  const setViewingSession = useAgentRunStore((s) => s.setViewingSession);
  useEffect(() => {
    setViewingSession(state.sessionId);
    return () => setViewingSession(null);
  }, [state.sessionId, setViewingSession]);
  const { user } = useSession();
  const addDraft = useCalendarStore((s) => s.addDraft);
  const upsertGeneration = useCalendarStore((s) => s.upsertGeneration);
  const clearGenerations = useCalendarStore((s) => s.clearGenerations);
  const calendarDays = useCalendarStore((s) => s.days);
  const backlogDrafts = useCalendarStore((s) => s.backlogDrafts);
  const selectedDraftId = useCalendarStore((s) => s.selectedDraftId);
  const selectedTrendIds = useCalendarStore((s) => s.selectedTrendIds);
  const setViewMode = useCalendarStore((s) => s.setViewMode);
  const setSelectedDraftId = useCalendarStore((s) => s.setSelectedDraftId);
  const canvasNodes = useStudioStore((s) => s.nodes);
  // Chat-side approve-through: the same Stage-2 (expandDrafts) / Stage-3
  // (generateDraftMedia) client fns the planner uses, keyed onto the planner
  // store's feId when the row is hydrated there (optimistic patches then land on
  // the visible card); the backend draft id is a safe no-op fallback otherwise.
  const { generateDraftMedia, expandDrafts } = useGenerateDraftMedia();
  const resolveCalendarFeId = useCallback((backendDraftId: string): string => {
    for (const day of useCalendarStore.getState().days) {
      const hit = day.slots.find(
        (slot) => slot.backendDraftId === backendDraftId || slot.id === backendDraftId,
      );
      if (hit) return hit.id;
    }
    return backendDraftId;
  }, []);
  const handleEnrichDraftFromChat = useCallback(
    (draftId: string) => {
      void expandDrafts(brandId, [{ feId: resolveCalendarFeId(draftId), backendDraftId: draftId }]);
    },
    [brandId, expandDrafts, resolveCalendarFeId],
  );
  const handleGenerateMediaFromChat = useCallback(
    (draftId: string, format: string) => {
      void generateDraftMedia(brandId, [
        { feId: resolveCalendarFeId(draftId), backendDraftId: draftId, format: format || 'post' },
      ]);
    },
    [brandId, generateDraftMedia, resolveCalendarFeId],
  );
  const {
    skills: brandSkills,
    templates: brandSkillTemplates,
    refresh: refreshBrandSkills,
    isError: brandSkillsError,
  } = useBrandSkills(brandId);
  const [queuedMentionSuggestions, setQueuedMentionSuggestions] = useState<
    AgentMentionSuggestion[]
  >([]);
  // Dashboard pin queue (What's Working / KPI strip / packs) drains into the same
  // channel SkillPicker and Media "Use" already use.
  const mentionQueueLength = useAgentMentionQueueStore((s) => s.queue.length);
  useEffect(() => {
    if (mentionQueueLength === 0) return;
    const drained = useAgentMentionQueueStore.getState().consume();
    if (drained.length === 0) return;
    setQueuedMentionSuggestions((current) => {
      const seen = new Set(current.map((s) => s.key));
      const merged = [...current];
      for (const item of drained) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        merged.push(item);
      }
      return merged;
    });
  }, [mentionQueueLength]);
  const syncedJobsRef = useRef(new Set<string>());
  const newSessionIdRef = useRef<string | null>(null);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    sessions,
    isLoadingSessions,
    isLoadingMessages,
    activeSessionId,
    startNewSession,
    selectSession,
    refreshSessions,
    deleteSession,
  } = useOrganicSessions(brandId, user?.id ?? null);

  const attachments = useChatAttachments({ brandId, sessionId: activeSessionId });

  const anchors = useMemo(
    () => deriveOrganicAnchors(state.messages, state.pipeline),
    [state.messages, state.pipeline],
  );

  // A restored page carries more than messages: the cards and bulk runs it replays have to reach
  // the reducer too, whether the page is the first one or an older one paged in behind the cursor.
  const applyRestoredPage = useCallback(
    (messages: OrganicSessionMessage[], into: 'SESSION_SWITCH' | 'PREPEND_MESSAGES') => {
      const restored = restoreSessionFromMessages(messages);
      if (into === 'SESSION_SWITCH') {
        dispatch({
          type: 'SESSION_SWITCH',
          sessionId: activeSessionId ?? '',
          messages: restored.messages,
        });
      } else {
        dispatch({ type: 'PREPEND_MESSAGES', messages: restored.messages });
      }
      restored.pipelineCards.forEach((card) => dispatch({ type: 'PIPELINE_CARD', card }));
      restored.bulkRuns.forEach((run) => dispatch({ type: 'BULK_RUN_START', run }));
    },
    [activeSessionId],
  );

  const { hasEarlier, isLoadingEarlier, loadEarlier, setEarlierCursor } =
    useEarlierHistory<OrganicSessionMessage>({
      fetchPage: useCallback(
        async (cursor) => {
          if (!activeSessionId) return null;
          const page = await fetchOrganicSessionMessagePage(activeSessionId, brandId, cursor);
          return { items: page.messages, nextCursor: page.nextCursor };
        },
        [activeSessionId, brandId],
      ),
      applyPage: useCallback(
        (messages: OrganicSessionMessage[]) => applyRestoredPage(messages, 'PREPEND_MESSAGES'),
        [applyRestoredPage],
      ),
    });

  // Load messages when activeSessionId is set by the hook on initial fetch
  useEffect(() => {
    if (!activeSessionId) return;
    selectSession(activeSessionId).then((page) => {
      applyRestoredPage(page.messages, 'SESSION_SWITCH');
      setEarlierCursor(page.nextCursor);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Converge this session's jobs + inline pipeline cards to the durable job rows.
  // The worker emits its ui.pipeline_card frames minutes after the chat stream
  // closes, so an OPEN chat only converges through this brand-wide summaries feed
  // (React Query cache shared with the ticker; Realtime invalidation + a polling
  // refetch while jobs run keep it fresh). The reducer ignores summaries for jobs
  // this session doesn't know.
  const { summaries: generationSummaries } = useGenerationSummaries(brandId);
  useEffect(() => {
    if (generationSummaries.length === 0) return;
    dispatch({ type: 'SYNC_GENERATION_SUMMARIES', summaries: generationSummaries });
  }, [generationSummaries]);

  // Rehydrate jobs from previous session — skip for new unsaved sessions
  useEffect(() => {
    if (!state.sessionId) return;
    if (state.sessionId === newSessionIdRef.current) return;
    const sessionId = state.sessionId;
    getBrowserAccessToken()
      .then((token) => {
        if (!token) return dispatch({ type: 'HYDRATE_JOBS', jobs: [] });
        return fetch(
          `${getApiBaseUrl()}/api/organic/agent/sessions/${sessionId}/jobs?brand_id=${encodeURIComponent(brandId)}&limit=50`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
          .then((res) => (res.ok ? (res.json() as Promise<unknown>) : ([] as unknown)))
          .then((payload) => {
            const jobs = normalizeHydratedJobs(payload);
            dispatch({ type: 'HYDRATE_JOBS', jobs });
          });
      })
      .catch(() => dispatch({ type: 'HYDRATE_JOBS', jobs: [] }));
  }, [state.sessionId, brandId]);

  // Sync completed jobs into the calendar store
  useEffect(() => {
    for (const job of Object.values(state.jobs)) {
      if (
        job.status === 'completed' &&
        job.placement &&
        job.draftId &&
        !syncedJobsRef.current.has(job.jobId)
      ) {
        syncedJobsRef.current.add(job.jobId);
        addDraft(job.placement.schedule.dayId, mapPlacementToDraft(job.placement, job.draftId));
      }
    }
  }, [state.jobs, addDraft]);

  // Mirror live job + pipeline state into the shared calendar store so the
  // shell-wide GenerationsPopover can render status/progress/preview from any
  // organic tab. The reducer stays the source of truth; this is a projection.
  useEffect(() => {
    for (const job of Object.values(state.jobs)) {
      const pipe = state.pipeline[job.jobId];
      upsertGeneration({
        jobId: job.jobId,
        planItemId: pipe?.planItemId ?? job.placement?.placementId ?? null,
        platform: job.platform ?? pipe?.platform ?? null,
        scheduledAt: job.scheduledAt ?? null,
        status: job.status,
        stage: job.stage ?? pipe?.currentStage ?? null,
        pct: pipe?.pct ?? null,
        previewUrl: resolveConceptPreviewUrl(pipe?.preview),
        quality: typeof pipe?.quality?.overallScore === 'number' ? pipe.quality.overallScore : null,
        draftId: job.draftId ?? pipe?.draftId ?? null,
        error: job.error?.message ?? pipe?.error?.message ?? null,
      });
    }
    // Pipeline cards without a matching job (for example, concept-card copy creation).
    for (const pipe of Object.values(state.pipeline)) {
      if (state.jobs[pipe.jobId]) continue;
      upsertGeneration({
        jobId: pipe.jobId,
        planItemId: pipe.planItemId ?? null,
        platform: pipe.platform ?? null,
        status: pipe.status,
        stage: pipe.currentStage ?? null,
        pct: pipe.pct ?? null,
        previewUrl: resolveConceptPreviewUrl(pipe.preview),
        quality: typeof pipe.quality?.overallScore === 'number' ? pipe.quality.overallScore : null,
        draftId: pipe.draftId ?? null,
        error: pipe.error?.message ?? null,
      });
    }
  }, [state.jobs, state.pipeline, upsertGeneration]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (isStreaming) return;
      clearGenerations();
      dispatch({ type: 'LOAD_MESSAGES_START' });
      const page = await selectSession(sessionId);
      const restored = restoreSessionFromMessages(page.messages);
      dispatch({ type: 'SESSION_SWITCH', sessionId, messages: restored.messages });
      restored.pipelineCards.forEach((card) => dispatch({ type: 'PIPELINE_CARD', card }));
      restored.bulkRuns.forEach((run) => dispatch({ type: 'BULK_RUN_START', run }));
      setEarlierCursor(page.nextCursor);
    },
    [isStreaming, selectSession, clearGenerations],
  );

  const debouncedRefreshSessions = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
      void refreshSessions();
    }, 300);
  }, [refreshSessions]);

  const handleNewSession = useCallback(() => {
    if (isStreaming) return;
    clearGenerations();
    const id = startNewSession();
    newSessionIdRef.current = id;
    dispatch({ type: 'SESSION_SWITCH', sessionId: id, messages: [] });
  }, [isStreaming, startNewSession, clearGenerations]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (isStreaming) return;
      if (
        typeof window !== 'undefined' &&
        !window.confirm('Delete this conversation? This cannot be undone.')
      ) {
        return;
      }
      const wasActive = (state.sessionId ?? activeSessionId) === sessionId;
      try {
        await deleteSession(sessionId);
      } catch {
        if (typeof window !== 'undefined')
          window.alert('Could not delete the conversation. Please try again.');
        return;
      }
      // If the open conversation was removed, reset to a fresh empty session.
      if (wasActive) handleNewSession();
    },
    [isStreaming, state.sessionId, activeSessionId, deleteSession, handleNewSession],
  );

  const handleSubmit = useCallback(
    (
      value: string,
      submittedAttachments: Attachment[] = [],
      references: AgentMentionReference[] = [],
    ) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!value.trim() || !currentSessionId || isStreaming) return;

      const content = value.trim();
      const messageId = crypto.randomUUID();
      const images = submittedAttachments
        .filter((attachment) => attachment.status === 'ready' && attachment.url)
        .map((attachment) => ({
          url: attachment.url as string,
          name: attachment.name,
          mediaType: attachment.type,
          storagePath: attachment.storagePath,
        }));
      // Same shape the backend persists on the user turn, so the live transcript and a resumed one
      // render the attachment identically.
      const metadata =
        references.length > 0 || images.length > 0
          ? { references, ...(images.length > 0 ? { attachments: images } : {}) }
          : undefined;

      dispatch({ type: 'SUBMIT_USER_MESSAGE', content, messageId, metadata });

      start({
        brandId,
        sessionId: currentSessionId,
        messages: [{ id: messageId, role: 'user' as const, content, metadata }],
        references,
        weekStart: currentWeekStartIso(),
        timezone: resolveTimezone(),
        platformAccountIds,
        images,
      })
        .then(() => debouncedRefreshSessions())
        .catch(() => {});
    },
    [
      state.sessionId,
      isStreaming,
      brandId,
      platformAccountIds,
      start,
      activeSessionId,
      debouncedRefreshSessions,
    ],
  );

  const handlePlanDecision = useCallback(
    (decision: PlanApprovalDecision) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!currentSessionId) return;

      if (decision.decision === 'approve') {
        // Optimistically flip every approved card to executing — the group approve
        // (itemIds) and the per-card approve (itemId) both land here.
        const executingIds = decision.itemIds ?? (decision.itemId ? [decision.itemId] : []);
        for (const itemId of executingIds) {
          dispatch({
            type: 'PLAN_STATUS',
            event: { planId: decision.planId, itemId, status: 'executing' },
          });
        }
      }

      const decisionContent =
        decision.decision === 'approve'
          ? decision.itemId
            ? 'Create copy draft'
            : 'Create copy drafts'
          : 'Dismiss plan';

      startControl({
        brandId,
        sessionId: currentSessionId,
        messages: [
          {
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: decisionContent,
            metadata: { references: [], planApproval: decision },
          },
        ],
        weekStart: currentWeekStartIso(),
        timezone: resolveTimezone(),
        platformAccountIds,
      })
        .then(() => debouncedRefreshSessions())
        .catch(() => {});
    },
    [
      state.sessionId,
      brandId,
      platformAccountIds,
      startControl,
      activeSessionId,
      debouncedRefreshSessions,
    ],
  );

  const handleToolApproval = useCallback(
    (approval: ToolApproval, approved: boolean) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!currentSessionId || isStreaming) return;

      dispatch({ type: 'TOOL_APPROVAL_RESOLVE', approvalId: approval.approvalId });

      start({
        brandId,
        sessionId: currentSessionId,
        messages: [],
        approvals: [{ id: approval.approvalId, approved }],
        weekStart: currentWeekStartIso(),
        timezone: resolveTimezone(),
        platformAccountIds,
      })
        .then(() => debouncedRefreshSessions())
        .catch(() => {});
    },
    [
      state.sessionId,
      isStreaming,
      brandId,
      platformAccountIds,
      start,
      activeSessionId,
      debouncedRefreshSessions,
    ],
  );

  // Regenerate a turn (used by the per-message action and the error-state Retry):
  // drop the stale assistant turn and re-run the nearest preceding user message.
  const handleRetryTurn = useCallback(
    (assistantMessageId: string) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!currentSessionId || isStreaming) return;

      const idx = state.messages.findIndex((m) => m.id === assistantMessageId);
      if (idx === -1) return;

      let userMessage: ConversationMessage | undefined;
      for (let i = idx - 1; i >= 0; i--) {
        if (state.messages[i].role === 'user') {
          userMessage = state.messages[i];
          break;
        }
      }
      if (!userMessage) return;

      dispatch({ type: 'RETRY_FROM_ASSISTANT', assistantMessageId });

      const references = userMessage.metadata?.references ?? [];
      start({
        brandId,
        sessionId: currentSessionId,
        messages: [
          {
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: userMessage.content,
            metadata: userMessage.metadata,
          },
        ],
        references,
        weekStart: currentWeekStartIso(),
        timezone: resolveTimezone(),
        platformAccountIds,
      })
        .then(() => debouncedRefreshSessions())
        .catch(() => {});
    },
    [
      state.sessionId,
      state.messages,
      isStreaming,
      brandId,
      platformAccountIds,
      start,
      activeSessionId,
      debouncedRefreshSessions,
    ],
  );

  const handleRetry = useCallback(
    (jobId: string) => {
      handleSubmit(`Please retry the failed post for job ${jobId}`);
    },
    [handleSubmit],
  );

  const handleCancel = useCallback(
    async (jobId: string) => {
      const token = await getBrowserAccessToken();
      if (!token) return;
      fetch(`${getApiBaseUrl()}/api/organic/agent/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brandId }),
      }).catch(() => {});
    },
    [brandId],
  );

  const jobs = Object.values(state.jobs);
  const hasSession = Boolean(state.sessionId || activeSessionId);
  const inputDisabled = isStreaming || !hasSession;
  const composerHint = describeComposerBlock({ isStreaming, hasSession });
  type MentionCatalog = {
    brandSkillSuggestions: AgentMentionSuggestion[];
    librarySkillSuggestions: AgentMentionSuggestion[];
    docSuggestions: AgentMentionSuggestion[];
    scheduledDraftSuggestions: AgentMentionSuggestion[];
    backlogDraftSuggestions: AgentMentionSuggestion[];
    trendSuggestions: AgentMentionSuggestion[];
    eventSuggestions: AgentMentionSuggestion[];
    questionSuggestions: AgentMentionSuggestion[];
    canvasSuggestions: AgentMentionSuggestion[];
    all: AgentMentionSuggestion[];
  };

  const buildAllSuggestions = useCallback(async (): Promise<MentionCatalog> => {
    const scheduledDraftSuggestions = calendarDays.flatMap((day) =>
      day.slots.map((draft) => {
        const description = [
          draft.platforms.join(', '),
          draft.timeLabel,
          day.dateLabel,
          draft.status,
        ]
          .filter(Boolean)
          .join(' · ');
        return createOrganicSuggestion(
          {
            id: draft.id,
            type: 'draft',
            label: draft.title || draft.summary || draft.id,
            source: 'organic',
            metadata: {
              draftId: draft.id,
              backendDraftId: draft.backendDraftId,
              status: draft.status,
              dayId: day.id,
              dateLabel: day.dateLabel,
              timeLabel: draft.timeLabel,
              platforms: draft.platforms,
              seedTrendId: draft.seedTrendId,
              summary: draft.summary,
              title: draft.title,
              captionPreview: draft.captionPreview?.slice(0, 240),
              format: draft.format,
              isSelected: draft.id === selectedDraftId,
            },
          },
          {
            key: `draft:${draft.id}`,
            group: 'Drafts',
            description,
            badge: draft.id === selectedDraftId ? 'selected' : 'draft',
          },
        );
      }),
    );

    const backlogDraftSuggestions = backlogDrafts.map((draft) =>
      createOrganicSuggestion(
        {
          id: draft.id,
          type: 'draft',
          label: draft.title || draft.summary || draft.id,
          source: 'organic',
          metadata: {
            draftId: draft.id,
            backendDraftId: draft.backendDraftId,
            status: draft.status,
            location: 'backlog',
            platforms: draft.platforms,
            seedTrendId: draft.seedTrendId,
            summary: draft.summary,
            title: draft.title,
            captionPreview: draft.captionPreview?.slice(0, 240),
            format: draft.format,
            isSelected: draft.id === selectedDraftId,
          },
        },
        {
          key: `draft:${draft.id}`,
          group: 'Drafts',
          description: ['Backlog', draft.platforms.join(', '), draft.status]
            .filter(Boolean)
            .join(' · '),
          badge: 'draft',
        },
      ),
    );

    const trendSuggestions = (mentionContext?.trends ?? []).map((trend) =>
      createOrganicSuggestion(
        {
          id: trend.id,
          type: 'trend',
          label: trend.title,
          source: 'organic',
          metadata: {
            generationId: mentionContext?.generationId,
            weekStart: mentionContext?.weekStartDate,
            source: trend.source,
            description: trend.description,
            relevanceToBrand: trend.relevanceToBrand,
            // Selection is single-sourced from the Zustand store so the planner
            // selection and the agent mention context can never diverge. The
            // server-provided trend.isSelected is intentionally not consulted.
            isSelected: selectedTrendIds.includes(trend.id),
          },
        },
        {
          key: `trend:${trend.id}`,
          group: 'Trends',
          description: trend.description ?? trend.relevanceToBrand,
          badge: selectedTrendIds.includes(trend.id) ? 'selected' : 'trend',
        },
      ),
    );

    const eventSuggestions = (mentionContext?.events ?? []).map((event) =>
      createOrganicSuggestion(
        {
          id: event.id,
          type: 'event',
          label: event.title,
          source: 'organic',
          metadata: {
            generationId: mentionContext?.generationId,
            weekStart: mentionContext?.weekStartDate,
            date: event.date,
            description: event.description,
            opportunity: event.opportunity,
            isSelected: event.isSelected,
          },
        },
        {
          key: `event:${event.id}`,
          group: 'Events',
          description: [event.date, event.description ?? event.opportunity]
            .filter(Boolean)
            .join(' · '),
          badge: 'event',
        },
      ),
    );

    const questionSuggestions = (mentionContext?.questions ?? []).map((question) =>
      createOrganicSuggestion(
        {
          id: question.id,
          type: 'question',
          label: question.question,
          source: 'organic',
          metadata: {
            generationId: mentionContext?.generationId,
            weekStart: mentionContext?.weekStartDate,
            niche: question.niche,
            socialPlatform: question.socialPlatform,
            contentTypeSuggestion: question.contentTypeSuggestion,
            whyRelevant: question.whyRelevant,
            isSelected: question.isSelected,
          },
        },
        {
          key: `question:${question.id}`,
          group: 'Questions',
          description: [question.niche, question.socialPlatform, question.whyRelevant]
            .filter(Boolean)
            .join(' · '),
          badge: 'question',
        },
      ),
    );

    const canvasSuggestions = canvasNodes.map(canvasNodeToMentionSuggestion);
    const brandSkillSuggestions = brandSkills.map((s) => skillToMentionSuggestion(s, 'Skills'));
    const librarySkillSuggestions = brandSkillTemplates.map((s) =>
      skillToMentionSuggestion(s, 'Library'),
    );
    const docSuggestions = (mentionContext?.documents ?? []).map((doc) =>
      createOrganicSuggestion(
        {
          id: doc.id,
          type: 'document',
          label: doc.name,
          source: 'organic',
          metadata: {
            kind: doc.kind ?? 'unknown',
            textExcerpt: doc.text_excerpt?.slice(0, 240) ?? null,
          },
        },
        {
          key: `document:${doc.id}`,
          group: 'Brain',
          description: doc.text_excerpt?.slice(0, 80) ?? undefined,
          badge: doc.kind?.toUpperCase() ?? 'DOC',
        },
      ),
    );

    return {
      brandSkillSuggestions,
      librarySkillSuggestions,
      docSuggestions,
      scheduledDraftSuggestions,
      backlogDraftSuggestions,
      trendSuggestions,
      eventSuggestions,
      questionSuggestions,
      canvasSuggestions,
      all: [
        ...brandSkillSuggestions,
        ...librarySkillSuggestions,
        ...docSuggestions,
        ...scheduledDraftSuggestions,
        ...backlogDraftSuggestions,
        ...trendSuggestions,
        ...eventSuggestions,
        ...questionSuggestions,
        ...canvasSuggestions,
      ],
    };
  }, [
    backlogDrafts,
    calendarDays,
    canvasNodes,
    brandSkills,
    brandSkillTemplates,
    mentionContext,
    selectedDraftId,
    selectedTrendIds,
  ]);

  const mentionPlatformOptions = useMemo(() => {
    const order = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'] as const;
    const labels: Record<(typeof order)[number], string> = {
      instagram: 'Instagram',
      facebook: 'Facebook',
      tiktok: 'TikTok',
      youtube: 'YouTube',
      linkedin: 'LinkedIn',
    };
    return order
      .filter((platform) => Boolean(platformAccountIds[platform]))
      .map((platform) => ({ id: platform, label: labels[platform] }));
  }, [platformAccountIds]);

  const defaultMentionPlatform = mentionPlatformOptions[0]?.id ?? null;
  const [mentionPlatform, setMentionPlatform] = useState<string | null>(null);
  const activeMentionPlatform = mentionPlatform ?? defaultMentionPlatform;

  const primaryInsightsAccount = useMemo(() => {
    if (activeMentionPlatform && platformAccountIds[activeMentionPlatform]) {
      return {
        platform: activeMentionPlatform as
          | 'instagram'
          | 'facebook'
          | 'tiktok'
          | 'youtube'
          | 'linkedin',
        integrationAccountId: platformAccountIds[activeMentionPlatform],
      };
    }
    const preferred = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'] as const;
    for (const platform of preferred) {
      const id = platformAccountIds[platform];
      if (id) return { platform, integrationAccountId: id };
    }
    return null;
  }, [activeMentionPlatform, platformAccountIds]);

  const mentionProviderObj = useMemo<AgentMentionProvider>(() => {
    const filter = (items: AgentMentionSuggestion[], query: string) =>
      query
        ? items.filter((s) =>
            matchesMentionQuery(query, [s.label, s.description, s.group, s.badge]),
          )
        : items;

    // Insights/What Changed edge only supports IG / FB / TikTok.
    const insightsAccount =
      primaryInsightsAccount &&
      (primaryInsightsAccount.platform === 'instagram' ||
        primaryInsightsAccount.platform === 'facebook' ||
        primaryInsightsAccount.platform === 'tiktok')
        ? {
            platform: primaryInsightsAccount.platform as 'instagram' | 'facebook' | 'tiktok',
            integrationAccountId: primaryInsightsAccount.integrationAccountId,
          }
        : null;

    const analyticsPlatform =
      primaryInsightsAccount?.platform === 'instagram' ||
      primaryInsightsAccount?.platform === 'facebook' ||
      primaryInsightsAccount?.platform === 'tiktok' ||
      primaryInsightsAccount?.platform === 'youtube' ||
      primaryInsightsAccount?.platform === 'linkedin'
        ? primaryInsightsAccount.platform
        : null;

    return {
      getSuggestions: async ({ query }) => {
        if (!query) {
          return ROOT_MENTION_FOLDERS.map((folder) => ({
            key: folder.key,
            label: folder.label,
            type: folder.type,
            source: 'organic' as const,
            childrenLabel: folder.childrenLabel,
            isFolder: true,
          }));
        }
        // Free-text search flattens across all nested surfaces (including live media).
        const catalog = await buildAllSuggestions();
        const metricSuggestions = metricCatalogToKpiSuggestions({
          platform: analyticsPlatform,
        });
        const [mediaSuggestions, creativeInsights, organicInsights, whatChanged] =
          await Promise.all([
            fetchMediaMentionAssets({ brandId, query, limit: 6 }).catch(
              () => [] as AgentMentionSuggestion[],
            ),
            fetchCreativeInsightSuggestions({ brandId }).catch(
              () => [] as AgentMentionSuggestion[],
            ),
            insightsAccount
              ? fetchOrganicInsightSuggestions({
                  brandId,
                  integrationAccountId: insightsAccount.integrationAccountId,
                  platform: insightsAccount.platform,
                }).catch(() => [] as AgentMentionSuggestion[])
              : Promise.resolve([] as AgentMentionSuggestion[]),
            insightsAccount
              ? fetchWhatChangedSuggestions({
                  brandId,
                  integrationAccountId: insightsAccount.integrationAccountId,
                  platform: insightsAccount.platform,
                }).catch(() => [] as AgentMentionSuggestion[])
              : Promise.resolve([] as AgentMentionSuggestion[]),
          ]);
        return [
          ...catalog.all,
          ...mediaSuggestions,
          ...filterKpiSuggestions(metricSuggestions, query),
          ...filterKpiSuggestions(creativeInsights, query),
          ...filterKpiSuggestions(organicInsights, query),
          ...filterKpiSuggestions(whatChanged, query),
        ].filter((s) => matchesMentionQuery(query, [s.label, s.description, s.group, s.badge]));
      },
      getChildSuggestions: async (parent, query) => {
        const catalog = await buildAllSuggestions();

        // ── Skills ──────────────────────────────────────────────────────────
        if (parent.key === 'folder:Skills') {
          return [
            {
              key: SKILLS_BRAND_FOLDER_KEY,
              label: 'Brand skills',
              type: 'skill' as const,
              source: 'organic' as const,
              childrenLabel: 'Your brand skills',
              isFolder: true,
            },
            {
              key: SKILLS_LIBRARY_FOLDER_KEY,
              label: 'Library',
              type: 'skill' as const,
              source: 'organic' as const,
              childrenLabel: 'First-party skill templates',
              isFolder: true,
            },
          ];
        }
        if (parent.key === SKILLS_BRAND_FOLDER_KEY) {
          return filter(catalog.brandSkillSuggestions, query);
        }
        if (parent.key === SKILLS_LIBRARY_FOLDER_KEY) {
          return filter(catalog.librarySkillSuggestions, query);
        }

        // ── Media (Canvas + Media library) ──────────────────────────────────
        if (parent.key === 'folder:Media') {
          return [
            {
              key: MEDIA_CANVAS_FOLDER_KEY,
              label: 'Canvas',
              type: 'canvas_node' as const,
              source: 'organic' as const,
              childrenLabel: 'Studio canvas nodes',
              isFolder: true,
            },
            {
              key: MEDIA_LIBRARY_FOLDER_KEY,
              label: 'Media library',
              type: 'media_asset' as const,
              source: 'organic' as const,
              childrenLabel: 'Sources & collections',
              isFolder: true,
            },
          ];
        }
        if (parent.key === MEDIA_CANVAS_FOLDER_KEY) {
          return filter(catalog.canvasSuggestions, query);
        }
        if (parent.key === MEDIA_LIBRARY_FOLDER_KEY) {
          return query.trim().length >= 2
            ? fetchMediaMentionAssets({ brandId, query, limit: 12 }).catch(() => [])
            : fetchMediaLibraryFolders(brandId).catch(() => []);
        }
        const mediaFolder = parseMediaFolderKey(parent.key);
        if (mediaFolder) {
          return fetchMediaMentionAssets({ brandId, query, limit: 24, ...mediaFolder }).catch(
            () => [],
          );
        }

        // ── Brain / Drafts ──────────────────────────────────────────────────
        if (parent.key === 'folder:Brain') return filter(catalog.docSuggestions, query);
        if (parent.key === 'folder:Drafts') {
          // Prefer drafts that target the selected platform (still show untagged ones).
          const drafts = [
            ...catalog.scheduledDraftSuggestions,
            ...catalog.backlogDraftSuggestions,
          ].filter((s) => {
            if (!activeMentionPlatform) return true;
            const plats = s.reference?.metadata?.platforms;
            if (!Array.isArray(plats) || plats.length === 0) return true;
            return plats.some(
              (p) => String(p).toLowerCase() === activeMentionPlatform.toLowerCase(),
            );
          });
          return filter(drafts, query);
        }

        // ── Signals (Trends + Events + Questions) ───────────────────────────
        if (parent.key === 'folder:Signals') {
          return [
            {
              key: SIGNALS_TRENDS_FOLDER_KEY,
              label: 'Trends',
              type: 'trend' as const,
              source: 'organic' as const,
              childrenLabel: 'Active trends',
              isFolder: true,
            },
            {
              key: SIGNALS_EVENTS_FOLDER_KEY,
              label: 'Events',
              type: 'event' as const,
              source: 'organic' as const,
              childrenLabel: 'Events',
              isFolder: true,
            },
            {
              key: SIGNALS_QUESTIONS_FOLDER_KEY,
              label: 'Questions',
              type: 'question' as const,
              source: 'organic' as const,
              childrenLabel: 'Questions',
              isFolder: true,
            },
          ];
        }
        if (parent.key === SIGNALS_TRENDS_FOLDER_KEY) {
          return filter(catalog.trendSuggestions, query);
        }
        if (parent.key === SIGNALS_EVENTS_FOLDER_KEY) {
          return filter(catalog.eventSuggestions, query);
        }
        if (parent.key === SIGNALS_QUESTIONS_FOLDER_KEY) {
          return filter(catalog.questionSuggestions, query);
        }

        // ── KPIs (Metrics + What's Working + Insights) ──────────────────────
        if (parent.key === 'folder:KPIs') {
          return kpiSubfolderSuggestions();
        }
        if (parent.key === KPI_METRICS_FOLDER_KEY) {
          // Concrete account KPIs with compact live value + Δ when analytics is available.
          let liveValues: Record<
            string,
            { value?: number | null; previous?: number | null; percentageChange?: number | null }
          > | null = null;
          if (primaryInsightsAccount && analyticsPlatform) {
            try {
              const { fetchOrganicAnalytics } = await import('@/lib/api/organicAnalytics.client');
              const data = await fetchOrganicAnalytics({
                brandId,
                integrationAccountId: primaryInsightsAccount.integrationAccountId,
                platform: analyticsPlatform,
                range: { preset: 'last_7d' },
                scope: 'kpis',
              });
              const metrics = (data.metrics ?? {}) as Record<string, number | undefined>;
              const comparison = (data.comparison ?? {}) as Record<
                string,
                { current?: number; previous?: number; percentageChange?: number }
              >;
              liveValues = {};
              for (const [key, value] of Object.entries(metrics)) {
                const c = comparison[key];
                liveValues[key] = {
                  value: c?.current ?? value ?? null,
                  previous: c?.previous ?? null,
                  percentageChange: c?.percentageChange ?? null,
                };
              }
            } catch {
              liveValues = null;
            }
          }
          return filterKpiSuggestions(
            metricCatalogToKpiSuggestions({
              platform: analyticsPlatform,
              rangePreset: 'last_7d',
              liveValues,
            }),
            query,
          );
        }
        if (parent.key === KPI_PACKS_FOLDER_KEY) {
          return filterKpiSuggestions(optimizationPackFolderSuggestions(), query);
        }
        if (parent.key === KPI_WHATS_WORKING_FOLDER_KEY) {
          const rows = await fetchCreativeInsightSuggestions({ brandId }).catch(() => []);
          return filterKpiSuggestions(rows, query);
        }
        if (parent.key === KPI_INSIGHTS_FOLDER_KEY) {
          // Insights family: What Changed (AI-Awareness) + computed dashboard insights.
          // Not the same as What's Working (creative strategy).
          return insightFamilySuggestions();
        }
        if (parent.key === KPI_WHAT_CHANGED_FOLDER_KEY) {
          if (!insightsAccount) return [];
          const rows = await fetchWhatChangedSuggestions({
            brandId,
            integrationAccountId: insightsAccount.integrationAccountId,
            platform: insightsAccount.platform,
          }).catch(() => []);
          return filterKpiSuggestions(rows, query);
        }
        if (parent.key === KPI_COMPUTED_INSIGHTS_FOLDER_KEY) {
          if (!insightsAccount) return [];
          const rows = await fetchOrganicInsightSuggestions({
            brandId,
            integrationAccountId: insightsAccount.integrationAccountId,
            platform: insightsAccount.platform,
          }).catch(() => []);
          return filterKpiSuggestions(rows, query);
        }

        return [];
      },
    };
  }, [activeMentionPlatform, buildAllSuggestions, brandId, primaryInsightsAccount]);

  const expandPackSuggestion = useCallback(
    (suggestion: AgentMentionSuggestion): AgentMentionSuggestion[] | null => {
      const packId = suggestion.reference?.metadata?.packId;
      if (typeof packId !== 'string') return null;
      if (
        packId !== 'grow_followers' &&
        packId !== 'improve_retention' &&
        packId !== 'boost_engagement'
      ) {
        return null;
      }
      const expanded = optimizationPackToSuggestions(packId as OptimizationPackId, {
        platform: primaryInsightsAccount?.platform ?? null,
      });
      return expanded.length > 0 ? expanded : null;
    },
    [primaryInsightsAccount],
  );

  const activeStages = useMemo(() => {
    if (!state.streamingMessageId) return [];
    const cards = Object.values(state.pipeline);
    const card = cards.find((c) => c.status === 'running') ?? cards[cards.length - 1];
    return card?.stages.filter((s) => s.status !== 'pending') ?? [];
  }, [state.pipeline, state.streamingMessageId]);

  // Pipeline cards grouped by the dispatching tool call (generatePosts threads
  // its toolCallId onto the worker frames) so each card renders inline under the
  // tool call in the transcript instead of in a separate track.
  const pipelineCardsByToolCallId = useMemo(() => {
    const byToolCallId = new Map<string, PipelineCardState[]>();
    for (const card of Object.values(state.pipeline)) {
      if (!card.toolCallId) continue;
      const cards = byToolCallId.get(card.toolCallId) ?? [];
      cards.push(card);
      byToolCallId.set(card.toolCallId, cards);
    }
    return byToolCallId;
  }, [state.pipeline]);

  return (
    <div data-tour-id="organic-agent-panel" className="flex h-full min-h-0">
      <OrganicSessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        isLoading={isLoadingSessions}
        isInteractionDisabled={isStreaming}
        brandId={brandId}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
      />
      <AutomationSheets agent="organic" brandId={brandId} />

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {jobs.length > 0 && (
          <div className="max-h-52 shrink-0 overflow-y-auto">
            <JobGrid jobs={jobs} onRetryAction={handleRetry} onCancelAction={handleCancel} />
          </div>
        )}

        <ChatTranscript
          anchors={anchors}
          isStreaming={isStreaming}
          hasEarlier={hasEarlier}
          isLoadingEarlier={isLoadingEarlier}
          onLoadEarlier={loadEarlier}
          className="min-h-0 flex-1"
          contentClassName="gap-3 p-1"
        >
          {isLoadingMessages ? (
            <div className="space-y-3 p-3">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : state.messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
              <p className="max-w-[220px] text-center text-sm text-muted-foreground/70 text-pretty">
                Your AI marketing strategist. Start by describing what you need.
              </p>
              <DisabledControl hint={composerHint}>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {STARTER_PROMPTS.map((s) => (
                    <Suggestion
                      key={s}
                      suggestion={s}
                      disabled={inputDisabled}
                      onClick={(text) => handleSubmit(text)}
                      className="h-auto px-3 py-1 text-sm font-normal text-muted-foreground"
                    />
                  ))}
                </div>
              </DisabledControl>
              {composerHint ? (
                <p className="max-w-[240px] text-center text-xs text-muted-foreground/80 text-pretty">
                  {composerHint.reason}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              {state.messages.map((msg) => (
                <Fragment key={msg.id}>
                  <ChatMessage id={msg.id} role={msg.role} anchor={msg.role === 'user'}>
                    <div className="space-y-2">
                      {msg.role === 'assistant' ? (
                        msg.content ? (
                          <SafeMarkdown
                            content={msg.content}
                            className="text-base leading-7 text-foreground text-pretty"
                            mode={msg.id === state.streamingMessageId ? 'streaming' : 'static'}
                            isAnimating={msg.id === state.streamingMessageId}
                          />
                        ) : msg.id === state.streamingMessageId &&
                          (msg.toolCalls?.length ?? 0) === 0 &&
                          !msg.error ? (
                          <AgentWorkingIndicator />
                        ) : null
                      ) : (
                        <>
                          <p className="group whitespace-pre-wrap text-base leading-relaxed">
                            <MentionifiedText
                              text={msg.content}
                              references={msg.metadata?.references}
                            />
                            <AutomatePromptAction
                              agent="organic"
                              prompt={msg.content}
                              className="ml-1 size-6 align-middle opacity-0 transition-opacity group-hover:opacity-100"
                            />
                          </p>
                          <ChatMediaGrid
                            items={mediaFromPersistedAttachments(msg.id, msg.metadata?.attachments)}
                            lightboxTitle="Attachment"
                          />
                        </>
                      )}
                      <OrganicThinkingPanel
                        toolCalls={msg.toolCalls ?? []}
                        isStreaming={msg.id === state.streamingMessageId}
                      />
                      <ToolCallPipelineCards
                        toolCalls={msg.toolCalls ?? []}
                        cardsByToolCallId={pipelineCardsByToolCallId}
                        onEnrichDraft={handleEnrichDraftFromChat}
                        onGenerateMedia={handleGenerateMediaFromChat}
                      />
                      <ActiveStagesPanel
                        stages={msg.id === state.streamingMessageId ? activeStages : []}
                        isStreaming={msg.id === state.streamingMessageId}
                      />
                      {msg.mediaSearchResults && msg.mediaSearchResults.length > 0 && (
                        <div className="space-y-2">
                          {msg.mediaSearchResults.map((frame, i) => (
                            <MediaLibrarySearchResults
                              key={`media:${i}:${typeof frame.data?.query === 'string' ? frame.data.query : ''}`}
                              frame={frame}
                              disabled={inputDisabled}
                              onUseAsset={(item) =>
                                setQueuedMentionSuggestions((current) => [
                                  ...current,
                                  mediaAssetToMentionSuggestion(item.asset),
                                ])
                              }
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
                                const pipelineCards = Object.values(state.pipeline).filter(
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
                                      planItemStatus={state.planItemStatus}
                                      pipeline={pipelineCards}
                                      onGenerateItemAction={(itemId, clientKey) =>
                                        handlePlanDecision({
                                          decision: 'approve',
                                          planId,
                                          itemId,
                                          clientKey,
                                        })
                                      }
                                      onGenerateAllAction={(itemIds) =>
                                        handlePlanDecision({ decision: 'approve', planId, itemIds })
                                      }
                                      onRejectAction={() =>
                                        handlePlanDecision({ decision: 'reject', planId })
                                      }
                                      onViewDraftAction={(draftId, target) => {
                                        setSelectedDraftId(draftId);
                                        setViewMode(target === 'calendar' ? 'month' : 'list');
                                      }}
                                      onEnrichDraftAction={handleEnrichDraftFromChat}
                                      onGenerateMediaAction={handleGenerateMediaFromChat}
                                    />
                                  </motion.div>
                                );
                              }
                              if (card.type === 'bulk_plan_card') {
                                const planId = card.data.planId;
                                const runId = `run_${planId}`;
                                const run = state.bulkRuns[runId];
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
                                        dispatch({
                                          type: 'BULK_RUN_START',
                                          run: {
                                            runId,
                                            planId,
                                            total: card.data.placements.length,
                                          },
                                        });
                                        handlePlanDecision({ decision: 'approve', planId });
                                      }}
                                      onRejectAction={() =>
                                        handlePlanDecision({ decision: 'reject', planId })
                                      }
                                    />
                                    {run && (
                                      <BulkRunPanel
                                        runId={run.runId}
                                        total={run.total}
                                        brandId={brandId}
                                      />
                                    )}
                                  </motion.div>
                                );
                              }
                              if (card.type === 'post_list') {
                                return (
                                  <motion.div
                                    key={cardKey(card, i)}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.08, duration: 0.18, ease }}
                                  >
                                    <PostContentCardGrid posts={card.data} label={card.label} />
                                  </motion.div>
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
                                      onSavedAction={() => {
                                        void refreshBrandSkills();
                                      }}
                                    />
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
                      {msg.role === 'assistant' && msg.error ? (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                          <span className="min-w-0 text-sm text-destructive">{msg.error}</span>
                          <AgentButton
                            variant="ghost"
                            disabled={isStreaming}
                            onClick={() => handleRetryTurn(msg.id)}
                          >
                            <RefreshCw className="size-3.5" />
                            Retry
                          </AgentButton>
                        </div>
                      ) : null}
                      {msg.role === 'assistant' &&
                      !msg.error &&
                      msg.content &&
                      msg.id !== state.streamingMessageId ? (
                        <MessageActions
                          content={msg.content}
                          onRegenerate={() => handleRetryTurn(msg.id)}
                          disabled={isStreaming}
                        />
                      ) : null}
                    </div>
                  </ChatMessage>
                  {milestonesForMessage(msg, state.pipeline).map((milestone) => (
                    <ChatMarker
                      key={milestone.id}
                      id={milestone.id}
                      kind="milestone"
                      label={milestone.label}
                    />
                  ))}
                </Fragment>
              ))}
              {state.pendingToolApprovals.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-1 pl-1">
                  {state.pendingToolApprovals.map((approval) => (
                    <ToolApprovalCard
                      key={approval.approvalId}
                      approval={approval}
                      disabled={isStreaming}
                      onApproveAction={() => handleToolApproval(approval, true)}
                      onDenyAction={() => handleToolApproval(approval, false)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </ChatTranscript>

        <div className="relative shrink-0">
          {brandId && (
            <div className="absolute bottom-full right-2 z-50 mb-2">
              <SkillWizardLauncher
                brandId={brandId}
                skills={brandSkills}
                templates={brandSkillTemplates}
                onChangedAction={() => void refreshBrandSkills()}
              />
            </div>
          )}
          {state.mediaResolution && state.mediaResolution.failed.length > 0 ? (
            <div
              role="status"
              className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    Couldn&apos;t fully load {state.mediaResolution.failed.length} grabbed{' '}
                    {state.mediaResolution.failed.length === 1 ? 'item' : 'items'}
                  </p>
                  <ul className="mt-1 list-inside list-disc text-amber-900/80 dark:text-amber-100/80">
                    {state.mediaResolution.failed.slice(0, 4).map((fail) => (
                      <li key={`${fail.refId}:${fail.reason}`}>
                        {fail.type}: {fail.reason.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-amber-900/70 dark:text-amber-100/70">
                    Resolved {state.mediaResolution.resolvedImages} image
                    {state.mediaResolution.resolvedImages === 1 ? '' : 's'}
                    {state.mediaResolution.resolvedVideos > 0
                      ? ` · ${state.mediaResolution.resolvedVideos} video text`
                      : ''}
                    . The turn continued with the rest of your context.
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded px-1.5 py-0.5 text-2xs uppercase tracking-wide hover:bg-amber-500/20"
                  onClick={() => dispatch({ type: 'CLEAR_MEDIA_RESOLUTION' })}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          <PromptInput
            onSubmit={(value, submitted, references) => handleSubmit(value, submitted, references)}
            attachments={attachments}
            disabled={inputDisabled}
            isStreaming={isStreaming}
            onStop={cancel}
            ariaLabel="Message the organic agent"
            className="px-0"
            mentionProvider={mentionProviderObj}
            queuedMentionSuggestions={queuedMentionSuggestions}
            onQueuedMentionSuggestionsConsumed={() => setQueuedMentionSuggestions([])}
            expandPackSuggestion={expandPackSuggestion}
            mentionAnalytics={{
              brandId,
              integrationAccountId: primaryInsightsAccount?.integrationAccountId ?? null,
              platform:
                primaryInsightsAccount?.platform === 'instagram' ||
                primaryInsightsAccount?.platform === 'facebook' ||
                primaryInsightsAccount?.platform === 'tiktok' ||
                primaryInsightsAccount?.platform === 'youtube' ||
                primaryInsightsAccount?.platform === 'linkedin'
                  ? primaryInsightsAccount.platform
                  : null,
            }}
            mentionPlatforms={mentionPlatformOptions}
            mentionPlatform={activeMentionPlatform}
            onMentionPlatformChange={setMentionPlatform}
            actions={
              <SkillPickerButton
                skills={brandSkills}
                templates={brandSkillTemplates}
                isError={brandSkillsError}
                onPickAction={(skill) =>
                  setQueuedMentionSuggestions((current) => [
                    ...current,
                    skillToMentionSuggestion(skill),
                  ])
                }
              />
            }
            placeholder="Plan me 3 posts this week on the beauty trend…"
          />
          {composerHint ? (
            <p className="mt-1 px-1 text-xs text-muted-foreground/80 text-pretty">
              {composerHint.reason}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function normalizeHydratedJobs(payload: unknown): AgentJobState[] {
  if (Array.isArray(payload)) return payload as AgentJobState[];
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.jobs)) return record.jobs as AgentJobState[];
  if (Array.isArray(record.data)) return record.data as AgentJobState[];
  return [];
}
