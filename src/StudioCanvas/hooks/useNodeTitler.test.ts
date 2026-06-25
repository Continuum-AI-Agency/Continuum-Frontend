import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useNodeTitler } from "./useNodeTitler";

const mockInvoke = mock(async () => ({ data: { title: "Ocean Dawn Haiku" }, error: null }));
const mockUpdateNodeData = mock(() => {});
const mockTriggerSave = mock(() => {});

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ functions: { invoke: mockInvoke } }),
}));

const mockState = {
  updateNodeData: mockUpdateNodeData,
  triggerSave: mockTriggerSave,
};

mock.module("../stores/useStudioStore", () => ({
  useStudioStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  mockInvoke.mockClear();
  mockUpdateNodeData.mockClear();
  mockTriggerSave.mockClear();
});

afterEach(() => cleanup());

describe("useNodeTitler", () => {
  it("does not request a title while the node is executing", async () => {
    renderHook(() =>
      useNodeTitler({ id: "n1", value: "Write a haiku about the ocean", isExecuting: true }),
    );
    await act(async () => {
      await wait(1200);
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("does not request a title for prompts shorter than the minimum", async () => {
    renderHook(() => useNodeTitler({ id: "n1", value: "hi there", isExecuting: false }));
    await act(async () => {
      await wait(1200);
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("invokes the edge function once the prompt settles and writes the title to the node label", async () => {
    const prompt = "Write a haiku about the ocean at dawn";
    renderHook(() => useNodeTitler({ id: "n1", value: prompt, isExecuting: false }));
    await act(async () => {
      await wait(1200);
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][0]).toBe("prompt-title");
    expect(mockInvoke.mock.calls[0][1]).toMatchObject({ body: { prompt } });
    expect(mockUpdateNodeData).toHaveBeenCalledWith("n1", { label: "Ocean Dawn Haiku" });
    expect(mockTriggerSave).toHaveBeenCalledTimes(1);
  });
});
