"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { Message } from "@/components/ai-elements/message";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import { getApiBaseUrl } from "@/lib/api/config";
import { useCalendarStore } from "@/lib/organic/store";
import { useOrganicAgentStream } from "@/hooks/useOrganicAgentStream";
import { useCalendarRunStream } from "@/components/organic/hooks/useCalendarRunStream";
import { initialPanelState, panelReducer } from "./useOrganicAgentReducer";
import { mapPlacementToDraft } from "./mapPlacementToDraft";
import type { AgentJobState } from "./types";
import { JobGrid } from "./JobGrid";
import { OrganicThinkingPanel } from "./OrganicThinkingPanel";
import { ActiveStagesPanel } from "./ActiveStagesPanel";
import { TrendChartCard } from "./TrendChartCard";
import { PlanCard } from "./PlanCard";
import { PipelinePlacementGrid } from "./PipelinePlacementGrid";
import { BulkPlanCard } from "./BulkPlanCard";
import { BulkRunPanel } from "./BulkRunPanel";
import { ToolApprovalCard } from "./ToolApprovalCard";
import type { PlanApprovalDecision, ToolApproval } from "./types";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import { useOrganicSessions } from "./useOrganicSessions";
import { useSession } from "@/hooks/useSession";
import { OrganicSessionSidebar } from "./OrganicSessionSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AgentMentionProvider,
  AgentMentionReference,
  AgentMentionSuggestion,
} from "@/lib/agent-references";

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
  };
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
  const syncedJobsRef = useRef(new Set<string>());
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      dispatch({
        type: "SESSION_SWITCH",
        sessionId: activeSessionId,
        messages: msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, metadata: m.metadata })),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Rehydrate jobs from previous session
  useEffect(() => {
    if (!state.sessionId) return;
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
      dispatch({
        type: "SESSION_SWITCH",
        sessionId,
        messages: msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, metadata: m.metadata })),
      });
    },
    [isStreaming, selectSession]
  );

  const handleNewSession = useCallback(() => {
    if (isStreaming) return;
    const id = startNewSession();
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
      }).then(() => refreshSessions()).catch(() => {});
    },
    [state.sessionId, state.messages, isStreaming, brandId, platformAccountIds, start, activeSessionId, refreshSessions]
  );

  const handlePlanDecision = useCallback(
    (decision: PlanApprovalDecision) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!currentSessionId || isStreaming) return;

      const content = decision.decision === "approve" ? "Approve plan" : "Reject plan";
      const messageId = crypto.randomUUID();
      dispatch({ type: "SUBMIT_USER_MESSAGE", content, messageId });

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
        messages: [
          ...existingMessages,
          { id: messageId, role: "user" as const, content, metadata: { references: [], planApproval: decision } },
        ],
        weekStart,
        timezone,
        platformAccountIds,
      })
        .then(() => refreshSessions())
        .catch(() => {});
    },
    [state.sessionId, state.messages, isStreaming, brandId, platformAccountIds, start, activeSessionId, refreshSessions]
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
        .then(() => refreshSessions())
        .catch(() => {});
    },
    [state.sessionId, state.messages, isStreaming, brandId, platformAccountIds, start, activeSessionId, refreshSessions]
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
    ({ query }) => {
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

      return [
        ...scheduledDraftSuggestions,
        ...backlogDraftSuggestions,
        ...trendSuggestions,
        ...eventSuggestions,
        ...questionSuggestions,
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

      {state.pendingToolApprovals.length > 0 && (
        <div className="shrink-0 space-y-2">
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

      <div className="min-h-0 flex-1 overflow-y-auto space-y-3 pr-1">
        {isLoadingMessages ? (
          <div className="space-y-3 p-1">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        ) : state.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Ask the agent to schedule posts, explore trends, or plan your week.
            </p>
          </div>
        ) : (
          state.messages.map((msg) => (
            <Message key={msg.id} role={msg.role}>
              <div className="space-y-2">
                {msg.role === "assistant" ? (
                  <SafeMarkdown
                    content={msg.content}
                    className="text-[15px] leading-7 text-foreground"
                    mode={msg.id === state.streamingMessageId ? "streaming" : "static"}
                    isAnimating={msg.id === state.streamingMessageId}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
                )}
                <OrganicThinkingPanel
                  toolCalls={msg.toolCalls ?? []}
                  isStreaming={msg.id === state.streamingMessageId}
                />
                <ActiveStagesPanel
                  stages={msg.id === state.streamingMessageId ? activeStages : []}
                  isStreaming={msg.id === state.streamingMessageId}
                />
                {msg.uiCards && msg.uiCards.length > 0 && (
                  <div className="space-y-2">
                    {msg.uiCards.map((card, i) => {
                      if (card.type === "trend_chart") {
                        return <TrendChartCard key={i} chart={card.data} />;
                      }
                      if (card.type === "plan_card") {
                        const planId = card.data.planId;
                        const pipelineCards = Object.values(state.pipeline).filter(
                          (p) => p.planId === planId
                        );
                        return (
                          <div key={i} className="space-y-2">
                            <PlanCard
                              plan={card.data}
                              planItemStatus={state.planItemStatus}
                              onApproveAction={() =>
                                handlePlanDecision({ decision: "approve", planId })
                              }
                              onRejectAction={() =>
                                handlePlanDecision({ decision: "reject", planId })
                              }
                            />
                            <PipelinePlacementGrid cards={pipelineCards} />
                          </div>
                        );
                      }
                      if (card.type === "bulk_plan_card") {
                        const planId = card.data.planId;
                        const runId = `run_${planId}`;
                        const run = state.bulkRuns[runId];
                        return (
                          <div key={i} className="space-y-2">
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
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </Message>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0">
        <PromptInput
          onSubmit={(value, _attachments, references) => handleSubmit(value, references)}
          disabled={inputDisabled}
          mentionProvider={{ getSuggestions: mentionProvider }}
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
