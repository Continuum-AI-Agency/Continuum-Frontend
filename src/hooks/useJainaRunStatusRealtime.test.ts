import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act, cleanup } from "@testing-library/react";

import {
  useJainaRunStatusRealtime,
  isTerminalRunStatus,
} from "./useJainaRunStatusRealtime";

let capturedHandler: ((payload: any) => void) | null = null;

const mockChannel = {
  on: mock((_event: string, _config: any, handler: (payload: any) => void) => {
    capturedHandler = handler;
    return mockChannel;
  }),
  subscribe: mock(() => mockChannel),
  unsubscribe: mock(() => {}),
};

const mockSupabase: any = {
  channel: mock(() => mockChannel),
  removeChannel: mock(() => {}),
};

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => mockSupabase,
}));

describe("isTerminalRunStatus", () => {
  it("treats completed and failed as terminal", () => {
    expect(isTerminalRunStatus("completed")).toBe(true);
    expect(isTerminalRunStatus("failed")).toBe(true);
  });

  it("treats pending and running as non-terminal", () => {
    expect(isTerminalRunStatus("pending")).toBe(false);
    expect(isTerminalRunStatus("running")).toBe(false);
  });
});

describe("useJainaRunStatusRealtime", () => {
  beforeEach(() => {
    capturedHandler = null;
    mockSupabase.channel.mockClear();
    mockChannel.on.mockClear();
    mockChannel.subscribe.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("subscribes to the jaina run-status channel", async () => {
    await act(async () => {
      renderHook(() => useJainaRunStatusRealtime({ onRunStatus: () => {} }));
    });
    expect(mockSupabase.channel).toHaveBeenCalledWith("jaina:run-status", expect.any(Object));
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it("maps a terminal row change to a normalized callback", async () => {
    const onRunStatus = mock(() => {});
    await act(async () => {
      renderHook(() => useJainaRunStatusRealtime({ onRunStatus }));
    });
    expect(capturedHandler).not.toBeNull();

    act(() => {
      capturedHandler?.({
        new: {
          run_id: "run_abc",
          session_id: "chat_1",
          status: "completed",
          result_type: "checkpoint_report",
          error_message: null,
        },
      });
    });

    expect(onRunStatus).toHaveBeenCalledWith({
      runId: "run_abc",
      sessionId: "chat_1",
      status: "completed",
      resultType: "checkpoint_report",
      errorMessage: null,
    });
  });

  it("ignores payloads missing run_id or status", async () => {
    const onRunStatus = mock(() => {});
    await act(async () => {
      renderHook(() => useJainaRunStatusRealtime({ onRunStatus }));
    });

    act(() => {
      capturedHandler?.({ new: { session_id: "chat_1" } });
    });

    expect(onRunStatus).not.toHaveBeenCalled();
  });

  it("does not subscribe when disabled", async () => {
    await act(async () => {
      renderHook(() => useJainaRunStatusRealtime({ enabled: false, onRunStatus: () => {} }));
    });
    expect(mockSupabase.channel).not.toHaveBeenCalled();
  });
});
