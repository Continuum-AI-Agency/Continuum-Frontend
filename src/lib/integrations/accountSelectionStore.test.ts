import { describe, it, expect, beforeEach } from "bun:test";
import { useAccountSelectionStore } from "./accountSelectionStore";

beforeEach(() => {
  useAccountSelectionStore.setState({ selections: {} });
});

describe("useAccountSelectionStore", () => {
  it("returns null for an unset selection", () => {
    const { getSelection } = useAccountSelectionStore.getState();
    expect(getSelection("brand-1", "instagram")).toBeNull();
  });

  it("persists and retrieves a selection", () => {
    const { setSelection, getSelection } = useAccountSelectionStore.getState();
    setSelection("brand-1", "instagram", "acc-abc");
    expect(getSelection("brand-1", "instagram")).toBe("acc-abc");
  });

  it("scopes selections per brand", () => {
    const { setSelection, getSelection } = useAccountSelectionStore.getState();
    setSelection("brand-1", "instagram", "acc-1");
    setSelection("brand-2", "instagram", "acc-2");
    expect(getSelection("brand-1", "instagram")).toBe("acc-1");
    expect(getSelection("brand-2", "instagram")).toBe("acc-2");
  });

  it("scopes selections per platform within the same brand", () => {
    const { setSelection, getSelection } = useAccountSelectionStore.getState();
    setSelection("brand-1", "instagram", "acc-ig");
    setSelection("brand-1", "facebook", "acc-fb");
    expect(getSelection("brand-1", "instagram")).toBe("acc-ig");
    expect(getSelection("brand-1", "facebook")).toBe("acc-fb");
  });

  it("overwrites an existing selection", () => {
    const { setSelection, getSelection } = useAccountSelectionStore.getState();
    setSelection("brand-1", "instagram", "acc-old");
    setSelection("brand-1", "instagram", "acc-new");
    expect(getSelection("brand-1", "instagram")).toBe("acc-new");
  });

  it("does not affect unrelated brand/platform combinations when updating", () => {
    const { setSelection, getSelection } = useAccountSelectionStore.getState();
    setSelection("brand-1", "instagram", "acc-1");
    setSelection("brand-1", "facebook", "acc-fb");
    setSelection("brand-1", "instagram", "acc-2");
    expect(getSelection("brand-1", "facebook")).toBe("acc-fb");
  });
});
