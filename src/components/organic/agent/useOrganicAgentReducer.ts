import type { AgentJobState, ConversationMessage, ToolCallEvent, UiCard } from "./types"

export type PanelState = {
  sessionId: string | null
  messages: ConversationMessage[]
  inputValue: string
  isHydrated: boolean
  jobs: Record<string, AgentJobState>
  streamingMessageId: string | null
}

export type PanelAction =
  | { type: "SESSION_INIT"; sessionId: string }
  | { type: "HYDRATE_JOBS"; jobs: AgentJobState[] }
  | { type: "SET_INPUT"; value: string }
  | { type: "SUBMIT_USER_MESSAGE"; content: string; messageId: string }
  | { type: "STREAM_DELTA"; delta: string }
  | { type: "STREAM_TOOL_CALL"; event: ToolCallEvent }
  | { type: "STREAM_TOOL_RESULT"; toolCallId: string; result: unknown }
  | { type: "STREAM_COMPLETE" }
  | { type: "STREAM_ERROR"; error: string }
  | { type: "STREAM_UI_CARD"; card: UiCard }
  | { type: "JOB_UPDATE"; job: Partial<AgentJobState> & { jobId: string } }
  | { type: "SESSION_SWITCH"; sessionId: string; messages: ConversationMessage[] }
  | { type: "LOAD_MESSAGES_START" }

export function initialPanelState(): PanelState {
  return {
    sessionId: null,
    messages: [],
    inputValue: "",
    isHydrated: false,
    jobs: {},
    streamingMessageId: null,
  }
}

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "SESSION_INIT":
      return { ...state, sessionId: action.sessionId }

    case "HYDRATE_JOBS": {
      const merged = { ...state.jobs }
      const jobs = Array.isArray(action.jobs) ? action.jobs : []
      for (const job of jobs) {
        if (!job || typeof job.jobId !== "string") continue
        merged[job.jobId] = job
      }
      return { ...state, jobs: merged, isHydrated: true }
    }

    case "SET_INPUT":
      return { ...state, inputValue: action.value }

    case "SUBMIT_USER_MESSAGE": {
      const streamingId = `msg-${Date.now()}-assistant`
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: action.messageId, role: "user", content: action.content },
          { id: streamingId, role: "assistant", content: "" },
        ],
        streamingMessageId: streamingId,
        inputValue: "",
      }
    }

    case "STREAM_DELTA":
      if (!state.streamingMessageId) return state
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, content: m.content + action.delta }
            : m
        ),
      }

    case "STREAM_TOOL_CALL":
      if (!state.streamingMessageId) return state
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), action.event] }
            : m
        ),
      }

    case "STREAM_TOOL_RESULT":
      if (!state.streamingMessageId) return state
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? {
                ...m,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.toolCallId === action.toolCallId
                    ? { ...tc, result: action.result }
                    : tc
                ),
              }
            : m
        ),
      }

    case "STREAM_UI_CARD":
      if (!state.streamingMessageId) return state
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, uiCards: [...(m.uiCards ?? []), action.card] }
            : m
        ),
      }

    case "STREAM_COMPLETE":
      return { ...state, streamingMessageId: null }

    case "STREAM_ERROR":
      return {
        ...state,
        streamingMessageId: null,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, content: m.content || `Error: ${action.error}` }
            : m
        ),
      }

    case "JOB_UPDATE":
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.job.jobId]: {
            ...(state.jobs[action.job.jobId] ?? {}),
            ...action.job,
          } as AgentJobState,
        },
      }

    case "LOAD_MESSAGES_START":
      return {
        ...state,
        messages: [],
        jobs: {},
        streamingMessageId: null,
        isHydrated: false,
      }

    case "SESSION_SWITCH":
      return {
        ...initialPanelState(),
        sessionId: action.sessionId,
        messages: action.messages,
        isHydrated: true,
      }

    default:
      return state
  }
}
