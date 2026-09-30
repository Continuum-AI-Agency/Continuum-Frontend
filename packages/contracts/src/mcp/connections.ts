import { z } from "zod";

// Connector registration records surfaced by the MCP backend REST endpoints
// (GET /mcp/connections, POST /mcp/connections/confirm|:id/revoke) and rendered
// by the in-app "Connected to Claude" surface. Shared so the Frontend validates
// exactly what the Backend returns.

export const mcpConnectionStatusSchema = z.enum(["pending", "connected", "revoked"]);
export type McpConnectionStatus = z.infer<typeof mcpConnectionStatusSchema>;

export const mcpClientRegistrationSchema = z.object({
  id: z.string(),
  brand_id: z.string().nullable(),
  client_id: z.string(),
  client_name: z.string().nullable(),
  scope: z.string().nullable(),
  status: mcpConnectionStatusSchema,
  authorized_at: z.string(),
  last_seen_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
export type McpClientRegistration = z.infer<typeof mcpClientRegistrationSchema>;

export const mcpConnectionsResponseSchema = z.object({
  connections: z.array(mcpClientRegistrationSchema),
});
export type McpConnectionsResponse = z.infer<typeof mcpConnectionsResponseSchema>;

export const mcpConfirmRequestSchema = z.object({
  authorization_id: z.string().min(1).max(128),
  brand_id: z.string().uuid().nullable().optional(),
});
export type McpConfirmRequest = z.infer<typeof mcpConfirmRequestSchema>;
