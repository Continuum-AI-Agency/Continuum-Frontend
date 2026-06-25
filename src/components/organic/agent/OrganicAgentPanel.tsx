"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Message } from "@/components/ai-elements/message";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { Conversation } from "@/components/ai-elements/conversation";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { MentionifiedText } from "@/components/ai-elements/mentionified-text";
import { RefreshCw } from "lucide-react";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import { getApiBaseUrl } from "@/lib/api/config";
import { useCalendarStore } from "@/lib/organic/store";
import { useOrganicAgentStream } from "@/hooks/useOrganicAgentStream";
import { useCalendarRunStream } from "@/components/organic/hooks/useCalendarRunStream";
import { initialPanelState, panelReducer } from "./useOrganicAgentReducer";
import { mapPlacementToDraft } from "./mapPlacementToDraft";
import { resolveConceptPreviewUrl } from "./conceptPreview";
import { restoreSessionFromMessages } from "./restoreSession";
import type { AgentJobState, ConversationMessage, UiCard } from "./types";
import { JobGrid } from "./JobGrid";
import { OrganicThinkingPanel } from "./OrganicThinkingPanel";
import { ActiveStagesPanel } from "./ActiveStagesPanel";
import { TrendChartCard } from "./TrendChartCard";
import { ConceptPlan } from "./ConceptPlan";
import { BulkPlanCard } from "./BulkPlanCard";
import { BulkRunPanel } from "./BulkRunPanel";
import { ToolApprovalCard } from "./ToolApprovalCard";
import type { PlanApprovalDecision, ToolApproval } from "./types";
import { MediaLibrarySearchResults } from "./MediaLibrarySearchResults";
import { PostContentCardGrid } from "./PostContentCardGrid";
import { SkillProposalCard } from "./SkillProposalCard";
import { SkillPickerButton } from "./SkillPickerButton";
import { SkillWizardLauncher } from "./SkillWizard/SkillWizardLauncher";
import { MessageActions } from "./MessageActions";
import { AgentWorkingIndicator } from "./AgentWorkingIndicator";
import { AgentButton } from "./agentCardKit";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import { useOrganicSessions } from "./useOrganicSessions";
import { useSession } from "@/hooks/useSession";
import { OrganicSessionSidebar } from "./OrganicSessionSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudioStore } from "@/StudioCanvas/stores/useStudioStore";
import type { StudioNode } from "@/StudioCanvas/types";
import type {
  AgentMentionProvider,
  AgentMentionReference,
  AgentMentionSuggestion,
} from "@/lib/agent-references";
import type { Skill } from "@continuum/contracts";
import { useBrandSkills } from "@/lib/organic/skills";
import {
  fetchMediaLibraryFolders,
  fetchMediaMentionAssets,
  mediaAssetToMentionSuggestion,
  parseMediaFolderKey,
} from "@/lib/agent/media-mentions";
import { buildCanvasReference, getCanvasPreview } from "./canvasMentions";

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

const STARTER_PROMPTS = ["Plan this week's posts", "Show me trending topics", "Draft an Instagram reel"];

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
    case "plan_card":
      return `plan_card:${card.data.planId}`;
    case "bulk_plan_card":
      return `bulk_plan_card:${card.data.planId}`;
    case "trend_chart":
      return `trend_chart:${card.data.title || index}`;
    case "post_list":
      return `post_list:${card.label ?? index}`;
    case "skill_proposal":
      return `skill_proposal:${card.data.proposalId}`;
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
    preview?: AgentMentionSuggestion["preview"];
  }
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

function skillToMentionSuggestion(skill: Skill, group = "Skills"): AgentMentionSuggestion {
  return createOrganicSuggestion(
    {
      id: skill.id,
      type: "skill",
      // The @-mention token renders the stable slug (no spaces); resolution is by
      // skill id (metadata.skillId), never by this label. Template ids resolve
      // server-side via the widened getSkillsByIds (brand OR global template).
      label: skill.slug ?? skill.name,
      source: "organic",
      metadata: {
        skillId: skill.id,
        kind: skill.kind,
        slug: skill.slug,
      },
    },
    {
      key: `skill:${skill.id}`,
      group,
      description: [skill.kind === "analytic" ? "analytic" : "creative direction", skill.description]
        .filter(Boolean)
        .join(" · "),
      badge: "skill",
    }
  );
}

function canvasNodeToMentionSuggestion(node: StudioNode): AgentMentionSuggestion {
  const preview = getCanvasPreview(node);
  return createOrganicSuggestion(buildCanvasReference(node), {
    key: `canvas:${node.id}`,
    group: "Canvas",
    description: [node.type, preview?.kind].filter(Boolean).join(" · "),
    badge: "canvas",
    preview,
  });
}

export function OrganicAgentPanel({ brandId, platformAccountIds, mentionContext }: OrganicAgentPanelProps) {
  const [state, dispatch] = useReducer(panelReducer, undefined, initialPanelState);
  const { attachRun } = useCalendarRunStream();
  const requestCalendarRefetch = useCalendarStore((s) => s.requestCalendarRefetch);
  const handleCalendarDraftSignal = useCallback(() => {
    // Fetch-all reload pulls in the new draft wherever it landed.
    requestCalendarRefetch();
  }, [requestCalendarRefetch]);
  const { start, startControl, cancel, isStreaming } = useOrganicAgentStream(dispatch, {
    onRunStarted: attachRun,
    onCalendarDraftSignal: handleCalendarDraftSignal,
  });
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
  const {
    skills: brandSkills,
    templates: brandSkillTemplates,
    refresh: refreshBrandSkills,
    isError: brandSkillsError,
  } = useBrandSkills(brandId);
  const [queuedMentionSuggestions, setQueuedMentionSuggestions] = useState<AgentMentionSuggestion[]>([]);
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

  // Load messages when activeSessionId is set by the hook on initial fetch
  useEffect(() => {
    if (!activeSessionId) return;
    selectSession(activeSessionId).then((msgs) => {
      const restored = restoreSessionFromMessages(msgs);
      dispatch({ type: "SESSION_SWITCH", sessionId: activeSessionId, messages: restored.messages });
      restored.pipelineCards.forEach((card) => dispatch({ type: "PIPELINE_CARD", card }));
      restored.bulkRuns.forEach((run) => dispatch({ type: "BULK_RUN_START", run }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Rehydrate jobs from previous session — skip for new unsaved sessions
  useEffect(() => {
    if (!state.sessionId) return;
    if (state.sessionId === newSessionIdRef.current) return;
    const sessionId = state.sessionId;
    getBrowserAccessToken()
      .then((token) => {
        if (!token) return dispatch({ type: "HYDRATE_JOBS", jobs: [] });
        return fetch(
          `${getApiBaseUrl()}/api/organic/agent/sessions/${sessionId}/jobs?brand_id=${encodeURIComponent(brandId)}&limit=50`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
          .then((res) => (res.ok ? (res.json() as Promise<unknown>) : ([] as unknown)))
          .then((payload) => {
            const jobs = normalizeHydratedJobs(payload);
            dispatch({ type: "HYDRATE_JOBS", jobs });
          });
      })
      .catch(() => dispatch({ type: "HYDRATE_JOBS", jobs: [] }));
  }, [state.sessionId, brandId]);

  // Sync completed jobs into the calendar store
  useEffect(() => {
    for (const job of Object.values(state.jobs)) {
      if (
        job.status === "completed" &&
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
        quality: typeof pipe?.quality?.overallScore === "number" ? pipe.quality.overallScore : null,
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
        quality: typeof pipe.quality?.overallScore === "number" ? pipe.quality.overallScore : null,
        draftId: pipe.draftId ?? null,
        error: pipe.error?.message ?? null,
      });
    }
  }, [state.jobs, state.pipeline, upsertGeneration]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (isStreaming) return;
      clearGenerations();
      dispatch({ type: "LOAD_MESSAGES_START" });
      const msgs = await selectSession(sessionId);
      const restored = restoreSessionFromMessages(msgs);
      dispatch({ type: "SESSION_SWITCH", sessionId, messages: restored.messages });
      restored.pipelineCards.forEach((card) => dispatch({ type: "PIPELINE_CARD", card }));
      restored.bulkRuns.forEach((run) => dispatch({ type: "BULK_RUN_START", run }));
    },
    [isStreaming, selectSession, clearGenerations]
  );

  const debouncedRefreshSessions = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => { void refreshSessions(); }, 300);
  }, [refreshSessions]);

  const handleNewSession = useCallback(() => {
    if (isStreaming) return;
    clearGenerations();
    const id = startNewSession();
    newSessionIdRef.current = id;
    dispatch({ type: "SESSION_SWITCH", sessionId: id, messages: [] });
  }, [isStreaming, startNewSession, clearGenerations]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (isStreaming) return;
      if (typeof window !== "undefined" && !window.confirm("Delete this conversation? This cannot be undone.")) {
        return;
      }
      const wasActive = (state.sessionId ?? activeSessionId) === sessionId;
      try {
        await deleteSession(sessionId);
      } catch {
        if (typeof window !== "undefined") window.alert("Could not delete the conversation. Please try again.");
        return;
      }
      // If the open conversation was removed, reset to a fresh empty session.
      if (wasActive) handleNewSession();
    },
    [isStreaming, state.sessionId, activeSessionId, deleteSession, handleNewSession]
  );

  const handleSubmit = useCallback(
    (value: string, references: AgentMentionReference[] = []) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!value.trim() || !currentSessionId || isStreaming) return;

      const content = value.trim();
      const messageId = crypto.randomUUID();
      const metadata = references.length > 0 ? { references } : undefined;
      dispatch({ type: "SUBMIT_USER_MESSAGE", content, messageId, metadata });

      start({
        brandId,
        sessionId: currentSessionId,
        messages: [{ id: messageId, role: "user" as const, content, metadata }],
        references,
        weekStart: currentWeekStartIso(),
        timezone: resolveTimezone(),
        platformAccountIds,
      }).then(() => debouncedRefreshSessions()).catch(() => {});
    },
    [state.sessionId, isStreaming, brandId, platformAccountIds, start, activeSessionId, debouncedRefreshSessions]
  );

  const handlePlanDecision = useCallback(
    (decision: PlanApprovalDecision) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!currentSessionId) return;

      if (decision.decision === "approve" && decision.itemId) {
        dispatch({
          type: "PLAN_STATUS",
          event: { planId: decision.planId, itemId: decision.itemId, status: "executing" },
        });
      }

      const decisionContent =
        decision.decision === "approve"
          ? decision.itemId
            ? "Create copy draft"
            : "Create copy drafts"
          : "Dismiss plan";

      startControl({
        brandId,
        sessionId: currentSessionId,
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user" as const,
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
    [state.sessionId, brandId, platformAccountIds, startControl, activeSessionId, debouncedRefreshSessions]
  );

  const handleToolApproval = useCallback(
    (approval: ToolApproval, approved: boolean) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!currentSessionId || isStreaming) return;

      dispatch({ type: "TOOL_APPROVAL_RESOLVE", approvalId: approval.approvalId });

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
    [state.sessionId, isStreaming, brandId, platformAccountIds, start, activeSessionId, debouncedRefreshSessions]
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
        if (state.messages[i].role === "user") {
          userMessage = state.messages[i];
          break;
        }
      }
      if (!userMessage) return;

      dispatch({ type: "RETRY_FROM_ASSISTANT", assistantMessageId });

      const references = userMessage.metadata?.references ?? [];
      start({
        brandId,
        sessionId: currentSessionId,
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user" as const,
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
    [state.sessionId, state.messages, isStreaming, brandId, platformAccountIds, start, activeSessionId, debouncedRefreshSessions]
  );

  const handleRetry = useCallback(
    (jobId: string) => {
      handleSubmit(`Please retry the failed post for job ${jobId}`);
    },
    [handleSubmit]
  );

  const handleCancel = useCallback(
    async (jobId: string) => {
      const token = await getBrowserAccessToken();
      if (!token) return;
      fetch(`${getApiBaseUrl()}/api/organic/agent/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brandId }),
      }).catch(() => {});
    },
    [brandId]
  );

  const jobs = Object.values(state.jobs);
  const inputDisabled = isStreaming || (!state.sessionId && !activeSessionId);
  const buildAllSuggestions = useCallback(async (): Promise<AgentMentionSuggestion[]> => {
    const scheduledDraftSuggestions = calendarDays.flatMap((day) =>
      day.slots.map((draft) => {
        const description = [
          draft.platforms.join(", "),
          draft.timeLabel,
          day.dateLabel,
          draft.status,
        ]
          .filter(Boolean)
          .join(" · ");
        return createOrganicSuggestion(
          {
            id: draft.id,
            type: "draft",
            label: draft.title || draft.summary || draft.id,
            source: "organic",
            metadata: {
              draftId: draft.id,
              backendDraftId: draft.backendDraftId,
              status: draft.status,
              dayId: day.id,
              dateLabel: day.dateLabel,
              timeLabel: draft.timeLabel,
              platforms: draft.platforms,
              seedTrendId: draft.seedTrendId,
              isSelected: draft.id === selectedDraftId,
            },
          },
          {
            key: `draft:${draft.id}`,
            group: "Drafts",
            description,
            badge: draft.id === selectedDraftId ? "selected" : "draft",
          }
        );
      })
    );

    const backlogDraftSuggestions = backlogDrafts.map((draft) =>
      createOrganicSuggestion(
        {
          id: draft.id,
          type: "draft",
          label: draft.title || draft.summary || draft.id,
          source: "organic",
          metadata: {
            draftId: draft.id,
            backendDraftId: draft.backendDraftId,
            status: draft.status,
            location: "backlog",
            platforms: draft.platforms,
            seedTrendId: draft.seedTrendId,
            isSelected: draft.id === selectedDraftId,
          },
        },
        {
          key: `draft:${draft.id}`,
          group: "Drafts",
          description: ["Backlog", draft.platforms.join(", "), draft.status].filter(Boolean).join(" · "),
          badge: "draft",
        }
      )
    );

    const trendSuggestions = (mentionContext?.trends ?? []).map((trend) =>
      createOrganicSuggestion(
        {
          id: trend.id,
          type: "trend",
          label: trend.title,
          source: "organic",
          metadata: {
            generationId: mentionContext?.generationId,
            weekStart: mentionContext?.weekStartDate,
            source: trend.source,
            // Selection is single-sourced from the Zustand store so the planner
            // selection and the agent mention context can never diverge. The
            // server-provided trend.isSelected is intentionally not consulted.
            isSelected: selectedTrendIds.includes(trend.id),
          },
        },
        {
          key: `trend:${trend.id}`,
          group: "Trends",
          description: trend.description ?? trend.relevanceToBrand,
          badge: selectedTrendIds.includes(trend.id) ? "selected" : "trend",
        }
      )
    );

    const eventSuggestions = (mentionContext?.events ?? []).map((event) =>
      createOrganicSuggestion(
        {
          id: event.id,
          type: "event",
          label: event.title,
          source: "organic",
          metadata: {
            generationId: mentionContext?.generationId,
            weekStart: mentionContext?.weekStartDate,
            date: event.date,
            isSelected: event.isSelected,
          },
        },
        {
          key: `event:${event.id}`,
          group: "Events",
          description: [event.date, event.description ?? event.opportunity].filter(Boolean).join(" · "),
          badge: "event",
        }
      )
    );

    const questionSuggestions = (mentionContext?.questions ?? []).map((question) =>
      createOrganicSuggestion(
        {
          id: question.id,
          type: "question",
          label: question.question,
          source: "organic",
          metadata: {
            generationId: mentionContext?.generationId,
            weekStart: mentionContext?.weekStartDate,
            niche: question.niche,
            socialPlatform: question.socialPlatform,
            contentTypeSuggestion: question.contentTypeSuggestion,
            isSelected: question.isSelected,
          },
        },
        {
          key: `question:${question.id}`,
          group: "Questions",
          description: [question.niche, question.socialPlatform, question.whyRelevant].filter(Boolean).join(" · "),
          badge: "question",
        }
      )
    );

    const canvasSuggestions = canvasNodes.map(canvasNodeToMentionSuggestion);
    const skillSuggestions = [
      ...brandSkills.map((s) => skillToMentionSuggestion(s, "Skills")),
      ...brandSkillTemplates.map((s) => skillToMentionSuggestion(s, "Library")),
    ];
    const docSuggestions = (mentionContext?.documents ?? []).map((doc) =>
      createOrganicSuggestion(
        {
          id: doc.id,
          type: "document",
          label: doc.name,
          source: "organic",
          metadata: { kind: doc.kind ?? "unknown" },
        },
        {
          key: `document:${doc.id}`,
          group: "Brain",
          description: doc.text_excerpt?.slice(0, 80) ?? undefined,
          badge: doc.kind?.toUpperCase() ?? "DOC",
        }
      )
    );

    return [
      ...skillSuggestions,
      ...docSuggestions,
      ...scheduledDraftSuggestions,
      ...backlogDraftSuggestions,
      ...trendSuggestions,
      ...eventSuggestions,
      ...questionSuggestions,
      ...canvasSuggestions,
    ];
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

  const mentionProviderObj = useMemo<AgentMentionProvider>(() => {
    type FolderMeta = { type: AgentMentionSuggestion["type"]; childrenLabel: string };
    const FOLDER_META: Record<string, FolderMeta> = {
      Skills:           { type: "skill",       childrenLabel: "Brand skills" },
      Library:          { type: "skill",       childrenLabel: "First-party skills" },
      Brain:            { type: "document",    childrenLabel: "Brand documents" },
      Drafts:           { type: "draft",        childrenLabel: "Scheduled & backlog" },
      Trends:           { type: "trend",        childrenLabel: "Active trends" },
      Events:           { type: "event",        childrenLabel: "Events" },
      Questions:        { type: "question",     childrenLabel: "Questions" },
      Canvas:           { type: "canvas_node",  childrenLabel: "Canvas nodes" },
      "Media library":  { type: "media_asset",  childrenLabel: "Sources & collections" },
    };

    return {
      getSuggestions: async ({ query }) => {
        if (!query) {
          const all = await buildAllSuggestions();
          const groupsSeen = new Set(all.map((s) => s.group).filter(Boolean) as string[]);
          groupsSeen.add("Media library");
          return [...groupsSeen]
            .filter((g) => Boolean(FOLDER_META[g]))
            .map((g) => ({
              key: `folder:${g}`,
              label: g,
              type: FOLDER_META[g].type,
              source: "organic" as const,
              childrenLabel: FOLDER_META[g].childrenLabel,
              isFolder: true,
            }));
        }
        const [all, mediaSuggestions] = await Promise.all([
          buildAllSuggestions(),
          fetchMediaMentionAssets({ brandId, query, limit: 6 }).catch(() => [] as AgentMentionSuggestion[]),
        ]);
        return [...all, ...mediaSuggestions].filter((s) =>
          matchesMentionQuery(query, [s.label, s.description, s.group, s.badge])
        );
      },
      getChildSuggestions: async (parent, query) => {
        // Media library drills two levels: root -> source/collection subfolders
        // -> assets. A typed query at the root searches across all sources; a
        // query inside a subfolder scopes the search to it.
        if (parent.key === "folder:Media library") {
          return query.trim().length >= 2
            ? fetchMediaMentionAssets({ brandId, query, limit: 12 }).catch(() => [])
            : fetchMediaLibraryFolders(brandId).catch(() => []);
        }
        const mediaFolder = parseMediaFolderKey(parent.key);
        if (mediaFolder) {
          return fetchMediaMentionAssets({ brandId, query, limit: 24, ...mediaFolder }).catch(() => []);
        }
        const all = await buildAllSuggestions();
        const children = all.filter((s) => s.group === parent.label);
        return query
          ? children.filter((s) => matchesMentionQuery(query, [s.label, s.description, s.badge]))
          : children;
      },
    };
  }, [buildAllSuggestions, brandId]);

  const activeStages = useMemo(() => {
    if (!state.streamingMessageId) return [];
    const cards = Object.values(state.pipeline);
    const card = cards.find((c) => c.status === "running") ?? cards[cards.length - 1];
    return card?.stages.filter((s) => s.status !== "pending") ?? [];
  }, [state.pipeline, state.streamingMessageId]);

  return (
    <div data-tour-id="organic-agent-panel" className="flex h-full min-h-0">
      <OrganicSessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        isLoading={isLoadingSessions}
        isInteractionDisabled={isStreaming}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      {jobs.length > 0 && (
        <div className="max-h-52 shrink-0 overflow-y-auto">
          <JobGrid jobs={jobs} onRetryAction={handleRetry} onCancelAction={handleCancel} />
        </div>
      )}

      <Conversation className="min-h-0 flex-1">
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
          </div>
        ) : (
          <div className="space-y-3 p-1 pr-1.5">
          <AnimatePresence initial={false}>
          {state.messages.map((msg) => (
            <Message key={msg.id} role={msg.role}>
              <div className="space-y-2">
                {msg.role === "assistant" ? (
                  msg.content ? (
                    <SafeMarkdown
                      content={msg.content}
                      className="text-base leading-7 text-foreground text-pretty"
                      mode={msg.id === state.streamingMessageId ? "streaming" : "static"}
                      isAnimating={msg.id === state.streamingMessageId}
                    />
                  ) : msg.id === state.streamingMessageId &&
                    (msg.toolCalls?.length ?? 0) === 0 &&
                    !msg.error ? (
                    <AgentWorkingIndicator />
                  ) : null
                ) : (
                  <p className="whitespace-pre-wrap text-base leading-relaxed"><MentionifiedText text={msg.content} references={msg.metadata?.references} /></p>
                )}
                <OrganicThinkingPanel
                  toolCalls={msg.toolCalls ?? []}
                  isStreaming={msg.id === state.streamingMessageId}
                />
                <ActiveStagesPanel
                  stages={msg.id === state.streamingMessageId ? activeStages : []}
                  isStreaming={msg.id === state.streamingMessageId}
                />
                {msg.mediaSearchResults && msg.mediaSearchResults.length > 0 && (
                  <div className="space-y-2">
                    {msg.mediaSearchResults.map((frame, i) => (
                      <MediaLibrarySearchResults
                        key={`media:${i}:${typeof frame.data?.query === "string" ? frame.data.query : ""}`}
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
                      if (card.type === "trend_chart") {
                        return (
                          <motion.div key={cardKey(card, i)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.18, ease }}>
                            <TrendChartCard chart={card.data} />
                          </motion.div>
                        );
                      }
                      if (card.type === "plan_card") {
                        const planId = card.data.planId;
                        const pipelineCards = Object.values(state.pipeline).filter(
                          (p) => p.planId === planId
                        );
                        return (
                          <motion.div key={cardKey(card, i)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.18, ease }}>
                            <ConceptPlan
                              plan={card.data}
                              planItemStatus={state.planItemStatus}
                              pipeline={pipelineCards}
                              onGenerateItemAction={(itemId) =>
                                handlePlanDecision({ decision: "approve", planId, itemId })
                              }
                              onGenerateAllAction={() =>
                                handlePlanDecision({ decision: "approve", planId })
                              }
                              onRejectAction={() =>
                                handlePlanDecision({ decision: "reject", planId })
                              }
                              onViewDraftAction={(draftId, target) => {
                                setSelectedDraftId(draftId);
                                setViewMode(target === "calendar" ? "month" : "list");
                              }}
                            />
                          </motion.div>
                        );
                      }
                      if (card.type === "bulk_plan_card") {
                        const planId = card.data.planId;
                        const runId = `run_${planId}`;
                        const run = state.bulkRuns[runId];
                        return (
                          <motion.div key={cardKey(card, i)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.18, ease }} className="space-y-2">
                            <BulkPlanCard
                              plan={card.data}
                              onApproveAction={() => {
                                dispatch({
                                  type: "BULK_RUN_START",
                                  run: { runId, planId, total: card.data.placements.length },
                                });
                                handlePlanDecision({ decision: "approve", planId });
                              }}
                              onRejectAction={() => handlePlanDecision({ decision: "reject", planId })}
                            />
                            {run && <BulkRunPanel runId={run.runId} total={run.total} />}
                          </motion.div>
                        );
                      }
                      if (card.type === "post_list") {
                        return (
                          <motion.div key={cardKey(card, i)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.18, ease }}>
                            <PostContentCardGrid posts={card.data} label={card.label} />
                          </motion.div>
                        );
                      }
                      if (card.type === "skill_proposal") {
                        return (
                          <motion.div key={cardKey(card, i)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.18, ease }}>
                            <SkillProposalCard
                              proposal={card.data}
                              onSavedAction={() => {
                                void refreshBrandSkills();
                              }}
                            />
                          </motion.div>
                        );
                      }
                      return null;
                    })}
                    </AnimatePresence>
                  </div>
                )}
                {msg.role === "assistant" && msg.error ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                    <span className="min-w-0 text-sm text-destructive">{msg.error}</span>
                    <AgentButton variant="ghost" disabled={isStreaming} onClick={() => handleRetryTurn(msg.id)}>
                      <RefreshCw className="size-3.5" />
                      Retry
                    </AgentButton>
                  </div>
                ) : null}
                {msg.role === "assistant" && !msg.error && msg.content && msg.id !== state.streamingMessageId ? (
                  <MessageActions
                    content={msg.content}
                    onRegenerate={() => handleRetryTurn(msg.id)}
                    disabled={isStreaming}
                  />
                ) : null}
              </div>
            </Message>
          ))}
          </AnimatePresence>
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
          </div>
        )}
      </Conversation>

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
        <PromptInput
          onSubmit={(value, _attachments, references) => handleSubmit(value, references)}
          disabled={inputDisabled}
          isStreaming={isStreaming}
          onStop={cancel}
          ariaLabel="Message the organic agent"
          className="px-0"
          mentionProvider={mentionProviderObj}
          queuedMentionSuggestions={queuedMentionSuggestions}
          onQueuedMentionSuggestionsConsumed={() => setQueuedMentionSuggestions([])}
          actions={
            <SkillPickerButton
              skills={brandSkills}
              templates={brandSkillTemplates}
              isError={brandSkillsError}
              onPickAction={(skill) =>
                setQueuedMentionSuggestions((current) => [...current, skillToMentionSuggestion(skill)])
              }
            />
          }
          placeholder="Plan me 3 posts this week on the beauty trend…"
        />
      </div>
      </div>
    </div>
  );
}

function normalizeHydratedJobs(payload: unknown): AgentJobState[] {
  if (Array.isArray(payload)) return payload as AgentJobState[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.jobs)) return record.jobs as AgentJobState[];
  if (Array.isArray(record.data)) return record.data as AgentJobState[];
  return [];
}
