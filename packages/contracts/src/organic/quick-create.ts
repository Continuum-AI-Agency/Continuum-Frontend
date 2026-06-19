/**
 * HTTP envelope for the calendar "Create with AI" single-post fast path.
 *
 * The Frontend composer (direction + optionally tagged library creatives +
 * optionally tagged trends) POSTs this to the Backend, which enqueues ONE
 * durable `post_generation` job via the same `enqueueApprovedPlan` engine the
 * agent's `quickCreatePost` tool uses. Two or more tagged creatives make the
 * post a carousel; all tagged trends are carried end-to-end in the job payload.
 */

import { z } from "zod";

import { creativeRefSchema } from "../media/attach";
import { organicPostFormatEnum } from "../streaming/organic";

export const quickCreatePlatformEnum = z.enum([
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
]);
export type QuickCreatePlatform = z.infer<typeof quickCreatePlatformEnum>;

export const quickCreateObjectiveEnum = z.enum([
  "follow",
  "save",
  "click",
  "comment",
  "dm",
  "share",
]);
export type QuickCreateObjective = z.infer<typeof quickCreateObjectiveEnum>;

export const quickCreatePostRequestSchema = z
  .object({
    brandId: z.string().min(1),
    // One-line creative direction (the hook / message / concept).
    angle: z.string().min(1),
    // Optional extra guidance (tone, CTA hints).
    guidancePrompt: z.string().nullable().optional(),
    // All trends to anchor/ground the post. The first is the durable job's trend
    // anchor; the full set rides the job payload for generation grounding.
    trendIds: z.array(z.string().uuid()).default([]),
    // Tagged library creatives. >1 ⇒ carousel (selection order = slide order).
    userSuppliedMedia: z.array(creativeRefSchema).default([]),
    platform: quickCreatePlatformEnum.optional(),
    scheduledAt: z.string().optional(),
    // HyperFrame is not selectable — see organicPostFormatEnum.
    format: organicPostFormatEnum.nullable().optional(),
    objective: quickCreateObjectiveEnum.optional(),
    // Scheduling context (parity with the chat/runs routes). Server defaults apply
    // when absent: weekStart → next Monday, timezone → UTC, accounts → {}.
    weekStart: z.string().optional(),
    timezone: z.string().optional(),
    platformAccountIds: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type QuickCreatePostRequest = z.infer<typeof quickCreatePostRequestSchema>;

export const quickCreatePostResponseSchema = z
  .object({
    status: z.literal("queued"),
    jobId: z.string().min(1),
    planId: z.string().min(1),
    planItemId: z.string().min(1),
    platform: z.string().min(1),
    scheduledAt: z.string().min(1),
    // Unknown at enqueue; the draft surfaces later via realtime / job polling.
    draftId: z.string().nullable().optional(),
  })
  .strict();
export type QuickCreatePostResponse = z.infer<typeof quickCreatePostResponseSchema>;
