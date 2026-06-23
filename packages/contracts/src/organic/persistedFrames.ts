// Canonical persistence allowlist + typed frame shapes for the organic-agent
// chat transcript. Shared by the Backend persist side (App/organic/agent/src/
// agents/agent.ts — which frames to embed on a message and how to dedupe them)
// and the Frontend restore side (src/components/organic/agent/restoreSession.ts —
// what to replay on load). Defining the allowlist + dedupe identity here once is
// what keeps "what the Backend persisted" and "what the Frontend replays" from
// drifting: a persisted frame is, by contract, a member of organicStreamFrameSchema
// re-rendered on reload through the same parser used for the live stream.
//
// ui.plan_status and draft.blueprint_ready are in the card set so a reloaded plan
// card shows per-item status and a reloaded media card shows its storyboard
// previews — progressive signals that were previously emitted live-only and lost
// on reload.

import { z } from "zod";
import { organicStreamFrameSchema } from "../streaming/organic";

/**
 * Frame types embedded as cards on the assistant message so the transcript
 * survives reload. Keyed (latest-wins) by persistedCardKey so a frame re-emitted
 * across a turn (a pipeline card per stage, a plan_status per item update)
 * collapses to its latest state instead of accumulating.
 */
export const PERSISTED_CARD_FRAME_TYPES = [
  "ui.plan_card",
  "ui.trend_chart",
  "ui.bulk_run",
  "ui.pipeline_card",
  "ui.post_card",
  "ui.skill_proposal",
  "ui.plan_status",
  "draft.blueprint_ready",
] as const;

/**
 * Non-card frames also replayed on load so the reloaded thinking panel and media
 * results match the live stream. tool.call / tool.result are kept under DISTINCT
 * keys (the call creates the trace entry, the result fills it); media frames are
 * kept per-emission.
 */
export const PERSISTED_AUX_FRAME_TYPES = [
  "tool.call",
  "tool.result",
  "media.search_results",
] as const;

const PERSISTED_CARD_FRAME_TYPE_SET: ReadonlySet<string> = new Set(PERSISTED_CARD_FRAME_TYPES);
const PERSISTED_AUX_FRAME_TYPE_SET: ReadonlySet<string> = new Set(PERSISTED_AUX_FRAME_TYPES);

/** The raw frame shape the Backend builds and embeds on a message. */
export const persistedCardFrameSchema = z.object({
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});
export type PersistedCardFrame = z.infer<typeof persistedCardFrameSchema>;

/**
 * Read-side schema for a persisted frame: a known organic stream frame, or a
 * forward-compatible { type, data } fallback so a frame type a peer doesn't know
 * yet still round-trips through reload instead of dropping the message row. This
 * fallback arm is the resilience mechanism — there is intentionally no strict
 * membership check against the persisted allowlist on read.
 */
export const persistedOrganicFrameSchema = z.union([
  organicStreamFrameSchema,
  z.object({ type: z.string().min(1), data: z.unknown() }).loose(),
]);
export type PersistedOrganicFrame = z.infer<typeof persistedOrganicFrameSchema>;

const readString = (data: Record<string, unknown>, key: string): string =>
  typeof data[key] === "string" ? (data[key] as string) : "";

/**
 * Stable identity for a persisted card frame (latest-wins dedupe). plan_status is
 * keyed by itemId (one status per plan item, not per plan) so every item's latest
 * status survives; blueprint is keyed by its draftId.
 */
export const persistedCardKey = (type: string, data: Record<string, unknown>): string => {
  switch (type) {
    case "ui.plan_card":
      return `plan:${readString(data, "planId")}`;
    case "ui.bulk_run":
      return `bulk:${readString(data, "planId")}`;
    case "ui.pipeline_card":
      return `pipeline:${readString(data, "jobId")}`;
    case "ui.post_card":
      return `post:${readString(data, "draftId")}`;
    case "ui.trend_chart":
      return `trend:${readString(data, "title")}`;
    case "ui.skill_proposal":
      return `skill_proposal:${readString(data, "proposalId")}`;
    case "ui.plan_status":
      return `plan_status:${readString(data, "itemId")}`;
    case "draft.blueprint_ready":
      return `blueprint:${readString(data, "draftId")}`;
    default:
      return `${type}:${readString(data, "id")}`;
  }
};

/**
 * Persistence identity for any frame, or null if the frame is not persisted. Card
 * frames dedupe by their stable key; aux frames keep call/result distinct and
 * media per-emission (seq).
 */
export const persistedFrameKey = (
  type: string,
  data: Record<string, unknown>,
  seq: number,
): string | null => {
  if (PERSISTED_CARD_FRAME_TYPE_SET.has(type)) return persistedCardKey(type, data);
  if (!PERSISTED_AUX_FRAME_TYPE_SET.has(type)) return null;
  switch (type) {
    case "tool.call":
      return `toolcall:${readString(data, "toolCallId")}`;
    case "tool.result":
      return `toolresult:${readString(data, "toolCallId")}`;
    default:
      return `media:${seq}`;
  }
};
