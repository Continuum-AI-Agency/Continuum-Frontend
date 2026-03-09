import { describe, expect, it } from "bun:test";
import {
  mapConversationMessageRow,
  mapConversationSessionRow,
  normalizeTimestamp,
  toConversationPreview,
} from "./conversations";

describe("toConversationPreview", () => {
  it("normalizes whitespace and truncates long content", () => {
    const preview = toConversationPreview(
      "  This   is   a long\n\nmessage that should be trimmed.  ",
      24
    );
    expect(preview).toBe("This is a long message…");
  });

  it("returns full content when below max length", () => {
    expect(toConversationPreview("short message", 24)).toBe("short message");
  });
});

describe("conversation row mapping", () => {
  it("maps session rows to camelCase", () => {
    const mapped = mapConversationSessionRow({
      session_id: "session-1",
      user_email: "analyst@example.com",
      brand_id: "brand-1",
      ad_account_id: "act-1",
      conversation_title: "Android Campaign Performance Audit",
      last_message_role: "assistant",
      last_message_preview: "Latest message",
      last_message_at: "2026-03-06T10:00:00.000Z",
      created_at: "2026-03-06T09:00:00.000Z",
      updated_at: "2026-03-06T10:00:00.000Z",
    });

    expect(mapped).toEqual({
      sessionId: "session-1",
      brandId: "brand-1",
      adAccountId: "act-1",
      title: "Android Campaign Performance Audit",
      lastMessageRole: "assistant",
      lastMessagePreview: "Latest message",
      lastMessageAt: "2026-03-06T10:00:00.000Z",
      createdAt: "2026-03-06T09:00:00.000Z",
      updatedAt: "2026-03-06T10:00:00.000Z",
    });
  });

  it("maps message rows to camelCase", () => {
    const mapped = mapConversationMessageRow({
      id: 9,
      session_id: "session-1",
      user_email: "analyst@example.com",
      brand_id: null,
      ad_account_id: null,
      role: "user",
      content: "How are campaigns doing?",
      created_at: "2026-03-06T10:10:00.000Z",
    });

    expect(mapped).toEqual({
      id: 9,
      sessionId: "session-1",
      brandId: null,
      adAccountId: null,
      role: "user",
      content: "How are campaigns doing?",
      createdAt: "2026-03-06T10:10:00.000Z",
    });
  });

  it("maps persisted assistant metadata when present", () => {
    const mapped = mapConversationMessageRow({
      id: 10,
      session_id: "session-1",
      user_email: "analyst@example.com",
      brand_id: "brand-1",
      ad_account_id: "act-1",
      role: "assistant",
      content: "Checkpoint report generated: Synthesis summary unavailable.",
      report: {
        language: "en",
        executive_summary: "Recovered from metadata.",
        performance_snapshot: [],
        sections: [],
        strategic_recommendations: [],
        follow_up_questions: [],
        handoff_trace: [],
        execution_objectives: [],
        cached_sources: [],
        graphs: [],
      },
      render_as_report: true,
      final_thought: "done",
      reasoning: [{ stage: "thinking", detail: "..." }],
      created_at: "2026-03-06T10:12:00.000Z",
    });

    expect(mapped.report).toBeDefined();
    expect(mapped.renderAsReport).toBe(true);
    expect(mapped.finalThought).toBe("done");
    expect(Array.isArray(mapped.reasoning)).toBe(true);
  });
});

describe("normalizeTimestamp", () => {
  it("returns fallback for invalid values", () => {
    expect(normalizeTimestamp("not-a-date", "2026-03-06T10:00:00.000Z")).toBe(
      "2026-03-06T10:00:00.000Z"
    );
    expect(normalizeTimestamp(undefined, "2026-03-06T10:00:00.000Z")).toBe(
      "2026-03-06T10:00:00.000Z"
    );
  });

  it("normalizes valid timestamps to ISO", () => {
    expect(normalizeTimestamp("2026-03-06T10:00:00-08:00", "fallback")).toBe(
      "2026-03-06T18:00:00.000Z"
    );
  });
});
