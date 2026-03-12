import { describe, expect, it } from "vitest";

import { isPointerInDeepSidebarZone } from "./sidebarHoverIntent";

describe("isPointerInDeepSidebarZone", () => {
  it("returns false when pointer is outside sidebar bounds", () => {
    expect(
      isPointerInDeepSidebarZone({
        pointerClientX: 10,
        sidebarLeft: 100,
        sidebarWidth: 88,
      })
    ).toBe(false);
  });

  it("returns false when pointer is inside sidebar but not deep enough", () => {
    expect(
      isPointerInDeepSidebarZone({
        pointerClientX: 130,
        sidebarLeft: 100,
        sidebarWidth: 88,
      })
    ).toBe(false);
  });

  it("returns true when pointer reaches deep hover zone", () => {
    expect(
      isPointerInDeepSidebarZone({
        pointerClientX: 160,
        sidebarLeft: 100,
        sidebarWidth: 88,
      })
    ).toBe(true);
  });

  it("returns false for invalid geometry values", () => {
    expect(
      isPointerInDeepSidebarZone({
        pointerClientX: Number.NaN,
        sidebarLeft: 100,
        sidebarWidth: 88,
      })
    ).toBe(false);
    expect(
      isPointerInDeepSidebarZone({
        pointerClientX: 100,
        sidebarLeft: 100,
        sidebarWidth: 0,
      })
    ).toBe(false);
  });
});

