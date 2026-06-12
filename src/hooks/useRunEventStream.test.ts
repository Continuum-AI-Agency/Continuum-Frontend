import { describe, it, expect } from "bun:test";

import { resolveWatchdogStatus } from "./useRunEventStream";

describe("resolveWatchdogStatus", () => {
  it("resolves as completed when at least one event was received before the timeout", () => {
    expect(resolveWatchdogStatus(true)).toBe("completed");
  });

  it("resolves as timed_out for a genuinely empty run (no events received)", () => {
    expect(resolveWatchdogStatus(false)).toBe("timed_out");
  });
});
