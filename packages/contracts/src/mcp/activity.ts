import { z } from 'zod';

// Auditable MCP tool-call activity surfaced by GET /mcp/tool-calls and rendered
// by the personal-side "Activity" data table. Owner-scoped (each row is one of
// the caller's tool calls). Shared so the Frontend validates exactly what the
// Backend returns. snake_case mirrors the plugin_mcp.list_tool_events RPC and the
// sibling connections contract.

export const mcpToolCallStatusSchema = z.enum([
  'ok',
  'error',
  'denied',
  'rate_limited',
  'cancelled',
]);
export type McpToolCallStatus = z.infer<typeof mcpToolCallStatusSchema>;

export const mcpEventKindSchema = z.enum(['tool_call', 'lifecycle']);
export type McpEventKind = z.infer<typeof mcpEventKindSchema>;

export const mcpResultStatusSchema = z.enum(['success', 'failure', 'unknown']);
export type McpResultStatus = z.infer<typeof mcpResultStatusSchema>;

export const mcpSafeDimensionsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const mcpToolCallSchema = z.object({
  // bigint id — coerced to string so large ids never lose precision on the wire.
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  event_id: z.string().uuid(),
  created_at: z.string(),
  email: z.string().nullable(),
  client_id: z.string().nullable(),
  client_name: z.string().nullable(),
  event_kind: mcpEventKindSchema,
  event_name: z.string(),
  tool: z.string().nullable(),
  action: z.string().nullable(),
  status: mcpToolCallStatusSchema,
  result_status: mcpResultStatusSchema,
  error_code: z.string().nullable(),
  duration_ms: z.number().nullable(),
  brand_id: z.string().nullable(),
  session_id: z.string().nullable(),
  transport: z.enum(['legacy', 'sdk']).nullable(),
  client_profile: z.enum(['claude', 'chatgpt']).nullable(),
  request_id: z.string().nullable(),
  dimensions: mcpSafeDimensionsSchema,
  bytes_in: z.number().nullable(),
  bytes_out: z.number().nullable(),
  cache_hit: z.boolean().nullable(),
});
export type McpToolCall = z.infer<typeof mcpToolCallSchema>;

export const mcpToolCallsResponseSchema = z.object({
  items: z.array(mcpToolCallSchema),
  // Keyset cursor: pass back as `before` to fetch the next (older) page; null at end.
  next_cursor: z.string().nullable(),
});
export type McpToolCallsResponse = z.infer<typeof mcpToolCallsResponseSchema>;
