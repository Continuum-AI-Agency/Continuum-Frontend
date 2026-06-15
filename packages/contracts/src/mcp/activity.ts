import { z } from "zod";

// Auditable MCP tool-call activity surfaced by GET /mcp/tool-calls and rendered
// by the personal-side "Activity" data table. Owner-scoped (each row is one of
// the caller's tool calls). Shared so the Frontend validates exactly what the
// Backend returns. snake_case mirrors the plugin_mcp.list_tool_events RPC and the
// sibling connections contract.

export const mcpToolCallStatusSchema = z.enum(["ok", "error", "denied", "rate_limited"]);
export type McpToolCallStatus = z.infer<typeof mcpToolCallStatusSchema>;

export const mcpToolCallSchema = z.object({
  // bigint id — coerced to string so large ids never lose precision on the wire.
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  created_at: z.string(),
  email: z.string().nullable(),
  client_id: z.string().nullable(),
  client_name: z.string().nullable(),
  tool: z.string(),
  status: mcpToolCallStatusSchema,
  error_code: z.string().nullable(),
  duration_ms: z.number(),
  brand_id: z.string().nullable(),
  session_id: z.string().nullable(),
});
export type McpToolCall = z.infer<typeof mcpToolCallSchema>;

export const mcpToolCallsResponseSchema = z.object({
  items: z.array(mcpToolCallSchema),
  // Keyset cursor: pass back as `before` to fetch the next (older) page; null at end.
  next_cursor: z.string().nullable(),
});
export type McpToolCallsResponse = z.infer<typeof mcpToolCallsResponseSchema>;
