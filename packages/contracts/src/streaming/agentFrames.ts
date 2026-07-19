import { z } from 'zod';

// The frame shapes every Continuum tool-loop agent emits, regardless of domain:
// the response lifecycle and the tool-call lifecycle. Domain unions (organic,
// ai-studio, …) compose these with their own `ui.*` frames rather than each
// re-declaring `tool.call` slightly differently — that drift is exactly what the
// shared-contracts rule exists to prevent.
//
// Note the deliberate SDK->wire rename on the tool frames: the AI SDK calls them
// `input`/`output`, the wire calls them `args`/`result`. Frontend interpreters key
// on the wire names.

export const responseCreatedSchema = z.object({
  type: z.literal('response.created'),
  data: z.object({ responseId: z.string().optional() }).loose(),
});

export const responseOutputTextDeltaSchema = z.object({
  type: z.literal('response.output_text.delta'),
  data: z.object({ delta: z.string() }).loose(),
});

export const responseOutputTextDoneSchema = z.object({
  type: z.literal('response.output_text.done'),
  data: z.record(z.string(), z.unknown()),
});

export const responseDoneSchema = z.object({
  type: z.literal('response.done'),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const responseErrorSchema = z.object({
  type: z.literal('response.error'),
  data: z.object({ message: z.string() }).loose(),
});

export const toolCallSchema = z.object({
  type: z.literal('tool.call'),
  data: z
    .object({
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      args: z.unknown(),
    })
    .loose(),
});

export const toolResultSchema = z.object({
  type: z.literal('tool.result'),
  data: z
    .object({
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      // `ok` is derived from the tool envelope status on the Backend — a tool that
      // returns an `error` envelope without throwing reports ok:false here rather
      // than a hardcoded success.
      ok: z.boolean(),
      status: z.enum(['success', 'warning', 'error']).optional(),
      code: z.string().optional(),
      reason: z.string().optional(),
      result: z.unknown().optional(),
      error: z.unknown().optional(),
    })
    .loose(),
});

export const toolErrorSchema = z.object({
  type: z.literal('tool.error'),
  data: z
    .object({
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      error: z.string(),
    })
    .loose(),
});

export type AgentToolCallFrame = z.infer<typeof toolCallSchema>;
export type AgentToolResultFrame = z.infer<typeof toolResultSchema>;
export type AgentResponseErrorFrame = z.infer<typeof responseErrorSchema>;
