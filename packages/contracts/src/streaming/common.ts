import { z } from "zod";

export const toolCallFrameSchema = z.object({
  type: z.literal("tool.call"),
  data: z.object({
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    args: z.unknown(),
  }).loose(),
});

export const toolResultFrameSchema = z.object({
  type: z.literal("tool.result"),
  data: z.object({
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
  }).loose(),
});

export const toolErrorFrameSchema = z.object({
  type: z.literal("tool.error"),
  data: z.object({
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    error: z.string(),
  }).loose(),
});

export const responseCreatedFrameSchema = z.object({
  type: z.literal("response.created"),
  data: z.record(z.string(), z.unknown()),
});

export const responseOutputTextDeltaFrameSchema = z.object({
  type: z.literal("response.output_text.delta"),
  data: z.object({
    delta: z.string(),
  }).loose(),
});

export const responseDoneFrameSchema = z.object({
  type: z.literal("response.done"),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const responseErrorFrameSchema = z.object({
  type: z.literal("response.error"),
  data: z.object({
    message: z.string(),
  }).loose(),
});

export type ToolCallFrame = z.infer<typeof toolCallFrameSchema>;
export type ToolResultFrame = z.infer<typeof toolResultFrameSchema>;
export type ToolErrorFrame = z.infer<typeof toolErrorFrameSchema>;
export type ResponseCreatedFrame = z.infer<typeof responseCreatedFrameSchema>;
export type ResponseOutputTextDeltaFrame = z.infer<typeof responseOutputTextDeltaFrameSchema>;
export type ResponseDoneFrame = z.infer<typeof responseDoneFrameSchema>;
export type ResponseErrorFrame = z.infer<typeof responseErrorFrameSchema>;
