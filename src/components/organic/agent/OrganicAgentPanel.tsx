"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Message } from "@/components/ai-elements/message";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { LinkifiedText } from "@/components/ai-elements/linkified-text";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import { getApiBaseUrl } from "@/lib/api/config";
import { useCalendarStore } from "@/lib/organic/store";
import { useOrganicAgentStream } from "@/hooks/useOrganicAgentStream";
import { useCalendarRunStream } from "@/components/organic/hooks/useCalendarRunStream";
import { initialPanelState, panelReducer } from "./useOrganicAgentReducer";
import { mapPlacementToDraft } from "./mapPlacementToDraft";
import { restoreSessionFromMessages } from "./restoreSession";
import type { AgentJobState } from "./types";
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
import type { MediaSearchResultItem, Skill } from "@continuum/contracts";
import { useBrandSkills } from "@/lib/organic/skills";

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
};

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

function readStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function inferCanvasOutputKind(node: StudioNode): "image" | "video" | "canvas" {
  const data = node.data as Record<string, unknown>;
  if (readStringField(data, "generatedVideoUrl") ?? readStringField(data, "generatedVideo")) return "video";
  if (readStringField(data, "video") ?? readStringField(data, "sourceUrl")) {
    return node.type === "video" ? "video" : "canvas";
  }
  if (
    readStringField(data, "generatedImageUrl") ??
    readStringField(data, "generatedImage") ??
    readStringField(data, "image")
  ) {
    return "image";
  }
  return "canvas";
}

function getCanvasPreview(node: StudioNode): AgentMentionSuggestion["preview"] {
  const data = node.data as Record<string, unknown>;
  const kind = inferCanvasOutputKind(node);
  const url =
    kind === "video"
      ? readStringField(data, "generatedVideoUrl") ??
        readStringField(data, "generatedVideo") ??
        readStringField(data, "video") ??
        readStringField(data, "sourceUrl")
      : readStringField(data, "generatedImageUrl") ??
        readStringField(data, "generatedImage") ??
        readStringField(data, "image") ??
        readStringField(data, "sourceUrl");
  return { url, kind, label: readStringField(data, "label") ?? node.type ?? node.id };
}

function mediaAssetToMentionSuggestion(item: MediaSearchResultItem): AgentMentionSuggestion {
  const asset = item.asset;
  return createOrganicSuggestion(
    {
      id: asset.id,
      type: "media_asset",
      label: asset.title ?? asset.storagePath.split("/").pop() ?? asset.id,
      source: "organic",
      metadata: {
        assetId: asset.id,
        kind: asset.kind,
        title: asset.title,
        description: asset.description,
        tags: asset.tags,
        mimeType: asset.mimeType,
        source: asset.source,
      },
    },
    {
      key: `media:${asset.id}`,
      group: "Media library",
      description: [asset.kind, asset.description].filter(Boolean).join(" · "),
      badge: asset.kind,
      preview: {
        url: asset.signedUrl ?? asset.thumbnailUrl,
        kind: asset.kind,
        label: asset.title ?? asset.id,
      },
    }
  );
}

function skillToMentionSuggestion(skill: Skill): AgentMentionSuggestion {
  return createOrganicSuggestion(
    {
      id: skill.id,
      type: "skill",
      label: skill.name,
      source: "organic",
      metadata: {
        skillId: skill.id,
        kind: skill.kind,
        slug: skill.slug,
      },
    },
    {
      key: `skill:${skill.id}`,
      group: "Skills",
      description: [skill.kind === "analytic" ? "analytic" : "creative direction", skill.description]
        .filter(Boolean)
        .join(" · "),
      badge: "skill",
    }
  );
}

function canvasNodeToMentionSuggestion(node: StudioNode): AgentMentionSuggestion {
  const data = node.data as Record<string, unknown>;
  const label = readStringField(data, "label") ?? node.type ?? node.id;
  const preview = getCanvasPreview(node);
  return createOrganicSuggestion(
    {
      id: node.id,
      type: "canvas_node",
      label,
      source: "organic",
      metadata: {
        nodeId: node.id,
        nodeType: node.type,
        outputKind: preview?.kind ?? "canvas",
        label,
      },
    },
    {
      key: `canvas:${node.id}`,
      group: "Canvas",
      description: [node.type, preview?.kind].filter(Boolean).join(" · "),
      badge: "canvas",
      preview,
    }
  );
}

async function searchMediaMentionSuggestions(
  brandId: string,
  query: string,
): Promise<AgentMentionSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const response = await fetch("/api/library/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId,
      mode: "text",
      query: trimmed,
      limit: 6,
    }),
  });

  if (!response.ok) return [];
  const payload = (await response.json()) as { items?: MediaSearchResultItem[] };
  return (payload.items ?? []).map(mediaAssetToMentionSuggestion);
}

export function OrganicAgentPanel({ brandId, platformAccountIds, mentionContext }: OrganicAgentPanelProps) {
  const [state, dispatch] = useReducer(panelReducer, undefined, initialPanelState);
  const { attachRun } = useCalendarRunStream();
  const { start, isStreaming } = useOrganicAgentStream(dispatch, { onRunStarted: attachRun });
  const { user } = useSession();
  const addDraft = useCalendarStore((s) => s.addDraft);
  const calendarDays = useCalendarStore((s) => s.days);
  const backlogDrafts = useCalendarStore((s) => s.backlogDrafts);
  const selectedDraftId = useCalendarStore((s) => s.selectedDraftId);
  const selectedTrendIds = useCalendarStore((s) => s.selectedTrendIds);
  const setViewMode = useCalendarStore((s) => s.setViewMode);
  const setSelectedDraftId = useCalendarStore((s) => s.setSelectedDraftId);
  const canvasNodes = useStudioStore((s) => s.nodes);
  const { skills: brandSkills, refresh: refreshBrandSkills } = useBrandSkills(brandId);
  const [queuedMentionSuggestions, setQueuedMentionSuggestions] = useState<AgentMentionSuggestion[]>([]);
  const syncedJobsRef = useRef(new Set<string>());
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (isStreaming) return;
      dispatch({ type: "LOAD_MESSAGES_START" });
      const msgs = await selectSession(sessionId);
      const restored = restoreSessionFromMessages(msgs);
      dispatch({ type: "SESSION_SWITCH", sessionId, messages: restored.messages });
      restored.pipelineCards.forEach((card) => dispatch({ type: "PIPELINE_CARD", card }));
      restored.bulkRuns.forEach((run) => dispatch({ type: "BULK_RUN_START", run }));
    },
    [isStreaming, selectSession]
  );

  const debouncedRefreshSessions = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => { void refreshSessions(); }, 300);
  }, [refreshSessions]);

  const handleNewSession = useCallback(() => {
    if (isStreaming) return;
    const id = startNewSession();
    newSessionIdRef.current = id;
    dispatch({ type: "SESSION_SWITCH", sessionId: id, messages: [] });
  }, [isStreaming, startNewSession]);

  const handleSubmit = useCallback(
    (value: string, references: AgentMentionReference[] = []) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!value.trim() || !currentSessionId || isStreaming) return;

      const content = value.trim();
      const messageId = crypto.randomUUID();
      const metadata = references.length > 0 ? { references } : undefined;
      dispatch({ type: "SUBMIT_USER_MESSAGE", content, messageId, metadata });

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const now = new Date();
      const daysToMonday = (now.getDay() + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysToMonday);
      const weekStart = monday.toISOString().slice(0, 10);

      const existingMessages = state.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
      }));

      start({
        brandId,
        sessionId: currentSessionId,
        messages: [...existingMessages, { id: messageId, role: "user" as const, content, metadata }],
        references,
        weekStart,
        timezone,
        platformAccountIds,
      }).then(() => debouncedRefreshSessions()).catch(() => {});
    },
    [state.sessionId, state.messages, isStreaming, brandId, platformAccountIds, start, activeSessionId, debouncedRefreshSessions]
  );

  const handlePlanDecision = useCallback(
    (decision: PlanApprovalDecision) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!currentSessionId || isStreaming) return;

      dispatch({ type: "BEGIN_STREAMING" });

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const now = new Date();
      const daysToMonday = (now.getDay() + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysToMonday);
      const weekStart = monday.toISOString().slice(0, 10);

      const existingMessages = state.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
      }));

      const decisionContent =
        decision.decision === "approve"
          ? decision.itemId
            ? "Generate this post"
            : "Generate all posts"
          : "Dismiss plan";

      start({
        brandId,
        sessionId: currentSessionId,
        messages: [
          ...existingMessages,
          {
            id: crypto.randomUUID(),
            role: "user" as const,
            content: decisionContent,
            metadata: { references: [], planApproval: decision },
          },
        ],
        weekStart,
        timezone,
        platformAccountIds,
      })
        .then(() => debouncedRefreshSessions())
        .catch(() => {});
    },
    [state.sessionId, state.messages, isStreaming, brandId, platformAccountIds, start, activeSessionId, debouncedRefreshSessions]
  );

  const handleToolApproval = useCallback(
    (approval: ToolApproval, approved: boolean) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!currentSessionId || isStreaming) return;

      dispatch({ type: "TOOL_APPROVAL_RESOLVE", approvalId: approval.approvalId });

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const now = new Date();
      const daysToMonday = (now.getDay() + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysToMonday);
      const weekStart = monday.toISOString().slice(0, 10);

      const existingMessages = state.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
      }));

      start({
        brandId,
        sessionId: currentSessionId,
        messages: existingMessages,
        approvals: [{ id: approval.approvalId, approved }],
        weekStart,
        timezone,
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
  const mentionProvider = useCallback<AgentMentionProvider["getSuggestions"]>(
    async ({ query }) => {
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
      const skillSuggestions = brandSkills.map(skillToMentionSuggestion);
      const mediaSuggestions = await searchMediaMentionSuggestions(brandId, query).catch(() => []);

      return [
        ...skillSuggestions,
        ...scheduledDraftSuggestions,
        ...backlogDraftSuggestions,
        ...trendSuggestions,
        ...eventSuggestions,
        ...questionSuggestions,
        ...canvasSuggestions,
        ...mediaSuggestions,
      ].filter((suggestion) =>
        matchesMentionQuery(query, [
          suggestion.label,
          suggestion.description,
          suggestion.group,
          suggestion.badge,
        ])
      );
    },
    [
      backlogDrafts,
      calendarDays,
      canvasNodes,
      brandSkills,
      brandId,
      mentionContext,
      selectedDraftId,
      selectedTrendIds,
    ]
  );

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
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      {jobs.length > 0 && (
        <div className="max-h-52 shrink-0 overflow-y-auto">
          <JobGrid jobs={jobs} onRetryAction={handleRetry} onCancelAction={handleCancel} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto space-y-3 pr-1">
        {isLoadingMessages ? (
          <div className="space-y-3 p-1">
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
              {["Plan this week's posts", "Show me trending topics", "Draft an Instagram reel"].map((s) => (
                <span key={s} className="rounded-full border border-border/50 px-3 py-1 text-[11.5px] text-muted-foreground/60 select-none">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
          {state.messages.map((msg) => (
            <Message key={msg.id} role={msg.role}>
              <div className="space-y-2">
                {msg.role === "assistant" ? (
                  <SafeMarkdown
                    content={msg.content}
                    className="text-[15px] leading-7 text-foreground text-pretty"
                    mode={msg.id === state.streamingMessageId ? "streaming" : "static"}
                    isAnimating={msg.id === state.streamingMessageId}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed"><LinkifiedText text={msg.content} /></p>
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
                        key={`${frame.type}:${i}`}
                        frame={frame}
                        disabled={inputDisabled}
                        onUseAsset={(item) =>
                          setQueuedMentionSuggestions((current) => [
                            ...current,
                            mediaAssetToMentionSuggestion(item),
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
                          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.18, ease }}>
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
                          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.18, ease }}>
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
                          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.18, ease }} className="space-y-2">
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
                          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.18, ease }}>
                            <PostContentCardGrid posts={card.data} label={card.label} />
                          </motion.div>
                        );
                      }
                      if (card.type === "skill_proposal") {
                        return (
                          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.18, ease }}>
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
              </div>
            </Message>
          ))}
          </AnimatePresence>
        )}
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
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0">
        <PromptInput
          onSubmit={(value, _attachments, references) => handleSubmit(value, references)}
          disabled={inputDisabled}
          className="px-0"
          mentionProvider={{ getSuggestions: mentionProvider }}
          queuedMentionSuggestions={queuedMentionSuggestions}
          onQueuedMentionSuggestionsConsumed={() => setQueuedMentionSuggestions([])}
          actions={
            brandSkills.length > 0 ? (
              <SkillPickerButton
                skills={brandSkills}
                onPickAction={(skill) =>
                  setQueuedMentionSuggestions((current) => [...current, skillToMentionSuggestion(skill)])
                }
              />
            ) : undefined
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
