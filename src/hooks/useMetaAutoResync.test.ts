import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";

// Controllable stand-in for the react-query mutation so the hook can be driven
// without a QueryClientProvider or a live backend.
let mutateResult: () => Promise<unknown> = async () => ({ updated: [], failed: [] });
const mutateAsync = mock(async (_arg?: string) => mutateResult());

mock.module("@/lib/api/integrations", () => ({
  useResyncMeta: () => ({ mutateAsync }),
}));

const { useMetaAutoResync } = await import("./useMetaAutoResync");

describe("useMetaAutoResync", () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    mutateResult = async () => ({ updated: [], failed: [] });
    try {
      window.sessionStorage.clear();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("auto-triggers a debounced resync when Meta is connected-but-empty", async () => {
    let resynced = 0;
    renderHook(() =>
      useMetaAutoResync({ enabled: true, isMetaEmpty: true, onResynced: () => { resynced += 1; } })
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await waitFor(() => expect(resynced).toBe(1), { timeout: 2000 });
  });

  it("does not auto-trigger when Meta is not empty", async () => {
    renderHook(() => useMetaAutoResync({ enabled: true, isMetaEmpty: false }));
    // Wait past the debounce window without a call.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("surfaces an error and keeps isResyncing false after a failed manual resync", async () => {
    mutateResult = async () => {
      throw new Error("resync boom");
    };
    const { result } = renderHook(() =>
      useMetaAutoResync({ enabled: false, isMetaEmpty: false })
    );

    await act(async () => {
      result.current.triggerResync();
    });

    await waitFor(() => expect(result.current.resyncError).toBe("resync boom"), { timeout: 2000 });
    expect(result.current.isResyncing).toBe(false);
  });
});
