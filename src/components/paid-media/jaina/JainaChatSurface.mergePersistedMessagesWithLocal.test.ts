import { describe, expect, it } from "bun:test";
import { mergePersistedMessagesWithLocal } from "./JainaChatSurface";
import type { JainaChatMessage } from "./types";

const baseUserMessage: JainaChatMessage = {
  id: "persisted-user",
  role: "user",
  content: "Give me a 7-day campaign health brief.",
  createdAt: "2026-04-17T09:20:00.000Z",
};

describe("mergePersistedMessagesWithLocal", () => {
  it("preserves pending local assistant when only the user message is persisted", () => {
    const persisted: JainaChatMessage[] = [
      {
        id: "persisted-user-old",
        role: "user",
        content: "How did campaigns perform last week?",
        createdAt: "2026-04-17T09:19:00.000Z",
      },
      {
        id: "persisted-assistant-old",
        role: "assistant",
        content: "Campaign performance looked stable.",
        createdAt: "2026-04-17T09:19:03.000Z",
      },
      {
        id: "persisted-user-new",
        role: "user",
        content: "Give me a 7-day campaign health brief.",
        createdAt: "2026-04-17T09:20:00.000Z",
      },
    ];

    const local: JainaChatMessage[] = [
      {
        ...persisted[0],
      },
      {
        ...persisted[1],
      },
      {
        id: "local-user-new",
        role: "user",
        content: "Give me a 7-day campaign health brief.",
        createdAt: "2026-04-17T09:20:00.000Z",
      },
      {
        id: "local-assistant-new",
        role: "assistant",
        content: "Plan is ready with campaign-level actions.",
        createdAt: "2026-04-17T09:20:04.000Z",
        plan: {
          id: "fallback_uqc00d",
          title: "Recommend Budget Reallocations For This Week BY Campaign",
          description: "Scope: last_7d",
          status: "pending",
          steps: [
            {
              title: "Resolve campaign IDs and collect evidence",
              status: "pending",
            },
          ],
        },
        reasoning: [
          {
            stage: "thinking",
            at: "2026-04-17T09:20:02.000Z",
            detail: "Gathering campaign evidence",
            data: { stage: "thinking" },
          },
        ],
      },
    ];

    const merged = mergePersistedMessagesWithLocal(persisted, local);
    const lastMessage = merged[merged.length - 1];

    expect(lastMessage.id).toBe("local-assistant-new");
    expect(lastMessage.role).toBe("assistant");
    expect(lastMessage.plan?.id).toBe("fallback_uqc00d");
    expect(lastMessage.reasoning?.length).toBe(1);
  });

  it("keeps richer local assistant state when persisted assistant is plan-only", () => {
    const persisted: JainaChatMessage[] = [
      baseUserMessage,
      {
        id: "persisted-assistant",
        role: "assistant",
        content: "",
        createdAt: "2026-04-17T09:20:05.000Z",
        plan: {
          id: "fallback_plan",
          title: "Campaign Health Brief",
          description: "Review this execution plan.",
          status: "pending",
          steps: [],
        },
      },
    ];

    const local: JainaChatMessage[] = [
      {
        ...baseUserMessage,
        id: "local-user",
      },
      {
        id: "local-assistant",
        role: "assistant",
        content: "Campaign health brief plan ready.",
        createdAt: "2026-04-17T09:20:05.000Z",
        plan: {
          id: "fallback_plan",
          title: "Campaign Health Brief",
          description: "Scope: last_7d",
          status: "pending",
          steps: [
            {
              title: "Assess campaign risk and opportunity.",
              status: "pending",
            },
          ],
        },
        reasoning: [
          {
            stage: "analysis",
            at: "2026-04-17T09:20:04.000Z",
            detail: "Gathering context",
            data: { stage: "analysis" },
          },
        ],
      },
    ];

    const merged = mergePersistedMessagesWithLocal(persisted, local);
    const assistant = merged[merged.length - 1];

    expect(assistant.content).toBe("Campaign health brief plan ready.");
    expect(assistant.plan?.description).toBe("Scope: last_7d");
    expect(assistant.plan?.steps).toHaveLength(1);
    expect(assistant.reasoning?.length).toBe(1);
  });

  it("keeps persisted assistant when it already has meaningful content", () => {
    const persisted: JainaChatMessage[] = [
      baseUserMessage,
      {
        id: "persisted-assistant",
        role: "assistant",
        content: "Final analysis summary from persisted history.",
        createdAt: "2026-04-17T09:20:05.000Z",
      },
    ];

    const local: JainaChatMessage[] = [
      {
        ...baseUserMessage,
        id: "local-user",
      },
      {
        id: "local-assistant",
        role: "assistant",
        content: "Temporary local content.",
        createdAt: "2026-04-17T09:20:05.000Z",
      },
    ];

    const merged = mergePersistedMessagesWithLocal(persisted, local);
    const assistant = merged[merged.length - 1];

    expect(assistant.content).toBe("Final analysis summary from persisted history.");
  });
});
