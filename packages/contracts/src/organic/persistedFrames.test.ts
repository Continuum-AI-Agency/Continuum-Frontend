import { describe, expect, it } from "bun:test";

import {
  PERSISTED_AUX_FRAME_TYPES,
  PERSISTED_CARD_FRAME_TYPES,
  persistedCardKey,
  persistedFrameKey,
  persistedOrganicFrameSchema,
} from "./persistedFrames";

describe("PERSISTED_*_FRAME_TYPES", () => {
  it("includes the reload-gap closers in the card set", () => {
    expect(PERSISTED_CARD_FRAME_TYPES).toContain("ui.plan_status");
    expect(PERSISTED_CARD_FRAME_TYPES).toContain("draft.blueprint_ready");
  });

  it("includes the brand-report-craft cards so the loop survives reload", () => {
    expect(PERSISTED_CARD_FRAME_TYPES).toContain("ui.brand_book");
    expect(PERSISTED_CARD_FRAME_TYPES).toContain("ui.readiness_scorecard");
    expect(PERSISTED_CARD_FRAME_TYPES).toContain("ui.brand_book_proposal");
    expect(PERSISTED_CARD_FRAME_TYPES).toContain("ui.brand_book_applied");
  });

  it("keeps tool + media frames in the aux set", () => {
    expect(PERSISTED_AUX_FRAME_TYPES).toEqual(["tool.call", "tool.result", "media.search_results"]);
  });
});

describe("persistedOrganicFrameSchema", () => {
  it("parses a known organic stream frame", () => {
    const result = persistedOrganicFrameSchema.safeParse({
      type: "ui.plan_status",
      data: { planId: "plan_1", itemId: "item_1", status: "executing" },
    });
    expect(result.success).toBe(true);
  });

  it("round-trips an unknown future frame via the forward-compatible arm", () => {
    const frame = { type: "future.frame", data: { anything: true } };
    const result = persistedOrganicFrameSchema.safeParse(frame);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ type: "future.frame" });
  });

  it("rejects an element with no string type", () => {
    expect(persistedOrganicFrameSchema.safeParse({ data: {} }).success).toBe(false);
  });
});

describe("persistedFrameKey", () => {
  it("keys plan_status by itemId so every item's latest status survives", () => {
    expect(persistedFrameKey("ui.plan_status", { planId: "p1", itemId: "item_9" }, 0)).toBe(
      "plan_status:item_9",
    );
  });

  it("keys draft.blueprint_ready by draftId", () => {
    expect(persistedFrameKey("draft.blueprint_ready", { draftId: "d7" }, 0)).toBe("blueprint:d7");
  });

  it("keys the brand-report-craft cards (brand_book/scorecard/applied by brandId, proposal by proposalId)", () => {
    expect(persistedFrameKey("ui.brand_book", { brandId: "b1" }, 0)).toBe("brandbook:b1");
    expect(persistedFrameKey("ui.readiness_scorecard", { brandId: "b1" }, 0)).toBe("scorecard:b1");
    expect(persistedFrameKey("ui.brand_book_proposal", { proposalId: "prop_3" }, 0)).toBe(
      "brandbook_proposal:prop_3",
    );
    expect(persistedFrameKey("ui.brand_book_applied", { brandId: "b1" }, 0)).toBe("brandbook_applied:b1");
  });

  it("keeps tool.call and tool.result under distinct keys", () => {
    expect(persistedFrameKey("tool.call", { toolCallId: "tc1" }, 0)).toBe("toolcall:tc1");
    expect(persistedFrameKey("tool.result", { toolCallId: "tc1" }, 0)).toBe("toolresult:tc1");
  });

  it("keys media frames per-emission by seq", () => {
    expect(persistedFrameKey("media.search_results", {}, 4)).toBe("media:4");
  });

  it("returns null for a non-persisted frame type", () => {
    expect(persistedFrameKey("response.output_text.delta", { delta: "hi" }, 0)).toBeNull();
  });

  it("matches persistedCardKey for card frames", () => {
    expect(persistedFrameKey("ui.pipeline_card", { jobId: "j1" }, 0)).toBe(
      persistedCardKey("ui.pipeline_card", { jobId: "j1" }),
    );
  });
});
