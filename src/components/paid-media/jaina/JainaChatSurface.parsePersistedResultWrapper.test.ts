import { describe, expect, it } from "bun:test";
import { parsePersistedResultWrapper } from "./JainaChatSurface";

describe("parsePersistedResultWrapper", () => {
  it("parses a plan_ready wrapper into a structured plan", () => {
    const payload = JSON.stringify({
      type: "plan_ready",
      plan: {
        plan_id: "fallback_uqc00d",
        chat_title: "Recommend Budget Reallocations For This Week BY Campaign",
        date_preset: "last_7d",
        objectives: [
          {
            task: "Analyze campaign-level efficiency and identify budget shifts.",
            description: "Use CPA and ROAS trend evidence to recommend reallocations.",
          },
        ],
      },
    });

    const parsed = parsePersistedResultWrapper(payload);

    expect(parsed).not.toBeNull();
    expect(parsed?.text).toBe("");
    expect(parsed?.plan).toBeDefined();
    expect(parsed?.plan?.id).toBe("fallback_uqc00d");
    expect(parsed?.plan?.title).toBe(
      "Recommend Budget Reallocations For This Week BY Campaign"
    );
    expect(parsed?.plan?.description).toBe("Scope: last_7d");
    expect(parsed?.plan?.description).not.toBe("Plan captured from previous session.");
    expect(parsed?.plan?.steps).toHaveLength(1);
    expect(parsed?.plan?.steps[0]?.title).toBe(
      "Analyze campaign-level efficiency and identify budget shifts."
    );
    expect(parsed?.plan?.steps[0]?.description).toBe(
      "Use CPA and ROAS trend evidence to recommend reallocations."
    );
  });

  it("falls back to a derived title and default description when plan fields are sparse", () => {
    const payload = JSON.stringify({
      type: "plan_ready",
      plan: {
        plan_id: "plan_123",
        intent: "analysis",
      },
    });

    const parsed = parsePersistedResultWrapper(payload, "Session fallback title");

    expect(parsed).not.toBeNull();
    expect(parsed?.plan).toBeDefined();
    expect(parsed?.plan?.id).toBe("plan_123");
    expect(parsed?.plan?.title).toBe("Session fallback title");
    expect(parsed?.plan?.description).toBe("Review this execution plan.");
    expect(parsed?.plan?.steps).toEqual([]);
  });

  it("parses response.plan_ready wrappers with nested data.plan payloads", () => {
    const payload = JSON.stringify({
      type: "response.plan_ready",
      data: {
        item_id: "item_123",
        part_id: "part_123",
        plan: {
          plan_id: "fallback_nested_123",
          chat_title: "Give me a 7-day campaign health brief with risks",
          date_preset: "last_7d",
          objectives: [
            {
              task: "Analyze campaign risk and budget shifts",
            },
          ],
        },
      },
    });

    const parsed = parsePersistedResultWrapper(payload);

    expect(parsed?.plan?.id).toBe("fallback_nested_123");
    expect(parsed?.plan?.title).toBe("Give me a 7-day campaign health brief with risks");
    expect(parsed?.plan?.description).toBe("Scope: last_7d");
    expect(parsed?.plan?.steps).toHaveLength(1);
  });
});
