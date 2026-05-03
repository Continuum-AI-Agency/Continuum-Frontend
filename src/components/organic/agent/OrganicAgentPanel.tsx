"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { Message } from "@/components/ai-elements/message";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import { getApiBaseUrl } from "@/lib/api/config";
import { useCalendarStore } from "@/lib/organic/store";
import { useOrganicAgentStream } from "@/hooks/useOrganicAgentStream";
import { initialPanelState, panelReducer } from "./useOrganicAgentReducer";
import { mapPlacementToDraft } from "./mapPlacementToDraft";
import type { AgentJobState } from "./types";
import { JobGrid } from "./JobGrid";
import { OrganicThinkingPanel } from "./OrganicThinkingPanel";
import { TrendChartCard } from "./TrendChartCard";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import { useOrganicSessions } from "./useOrganicSessions";
import { OrganicSessionSidebar } from "./OrganicSessionSidebar";
import { Skeleton } from "@/components/ui/skeleton";

type OrganicAgentPanelProps = {
  brandId: string;
  platformAccountIds: Record<string, string>;
};

export function OrganicAgentPanel({ brandId, platformAccountIds }: OrganicAgentPanelProps) {
  const [state, dispatch] = useReducer(panelReducer, undefined, initialPanelState);
  const { start, isStreaming } = useOrganicAgentStream(dispatch);
  const addDraft = useCalendarStore((s) => s.addDraft);
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
  } = useOrganicSessions(brandId);

  // Load messages when activeSessionId is set by the hook on initial fetch
  useEffect(() => {
    if (!activeSessionId) return;
    selectSession(activeSessionId).then((msgs) => {
      dispatch({
        type: "SESSION_SWITCH",
        sessionId: activeSessionId,
        messages: msgs.map((m) => ({ id: m.id, role: m.role, content: m.content })),
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
        messages: msgs.map((m) => ({ id: m.id, role: m.role, content: m.content })),
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
    (value: string) => {
      const currentSessionId = state.sessionId ?? activeSessionId;
      if (!value.trim() || !currentSessionId || isStreaming) return;

      const content = value.trim();
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
      }));

      start({
        brandId,
        sessionId: currentSessionId,
        messages: [...existingMessages, { id: messageId, role: "user" as const, content }],
        weekStart,
        timezone,
        platformAccountIds,
      }).then(() => refreshSessions()).catch(() => {});
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

  return (
    <div className="flex h-full min-h-0">
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
                {msg.uiCards && msg.uiCards.length > 0 && (
                  <div className="space-y-2">
                    {msg.uiCards.map((card, i) =>
                      card.type === "trend_chart" ? (
                        <TrendChartCard key={i} chart={card.data} />
                      ) : null
                    )}
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
          onSubmit={(value) => handleSubmit(value)}
          disabled={inputDisabled}
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
