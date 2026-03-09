import { z } from "zod";

export const jainaConversationRoleSchema = z.enum(["user", "assistant"]);
export type JainaConversationRole = z.infer<typeof jainaConversationRoleSchema>;

export const jainaConversationSessionSchema = z.object({
  sessionId: z.string().min(1),
  brandId: z.string().nullable(),
  adAccountId: z.string().nullable(),
  title: z.string().nullable(),
  lastMessageRole: jainaConversationRoleSchema.nullable(),
  lastMessagePreview: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JainaConversationSession = z.infer<typeof jainaConversationSessionSchema>;

export const jainaConversationMessageSchema = z.object({
  id: z.number().int().nonnegative(),
  sessionId: z.string().min(1),
  brandId: z.string().nullable(),
  adAccountId: z.string().nullable(),
  role: jainaConversationRoleSchema,
  content: z.string(),
  report: z.unknown().optional(),
  reportAssembly: z.unknown().optional(),
  reportAssemblyHtml: z.string().nullable().optional(),
  finalThought: z.string().nullable().optional(),
  renderAsReport: z.boolean().optional(),
  reasoning: z.array(z.unknown()).optional(),
  toolCalls: z.array(z.unknown()).optional(),
  toolResults: z.array(z.unknown()).optional(),
  artifacts: z.record(z.string(), z.unknown()).optional(),
  pendingClarification: z
    .object({
      id: z.string().optional(),
      question: z.string(),
    })
    .optional(),
  objectives: z.array(z.unknown()).optional(),
  createdAt: z.string(),
});
export type JainaConversationMessage = z.infer<typeof jainaConversationMessageSchema>;

export const jainaConversationListResponseSchema = z.object({
  sessions: z.array(jainaConversationSessionSchema),
  messages: z.array(jainaConversationMessageSchema).optional(),
});
export type JainaConversationListResponse = z.infer<typeof jainaConversationListResponseSchema>;

export const jainaConversationListQuerySchema = z.object({
  brandId: z.string().min(1),
  adAccountId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  messagesLimit: z.coerce.number().int().min(1).max(500).default(150),
});
export type JainaConversationListQuery = z.infer<typeof jainaConversationListQuerySchema>;

export const createConversationSessionRequestSchema = z.object({
  context: z.object({
    adAccountId: z.string().min(1),
    brandId: z.string().min(1),
    sessionId: z.string().min(1).optional(),
  }),
});
export type CreateConversationSessionRequest = z.infer<
  typeof createConversationSessionRequestSchema
>;

export const createConversationSessionResponseSchema = z.object({
  session_id: z.string().min(1),
  brand_id: z.string().nullable().optional(),
  ad_account_id: z.string().nullable().optional(),
  conversation_title: z.string().nullable().optional(),
});
export type CreateConversationSessionResponse = z.infer<
  typeof createConversationSessionResponseSchema
>;

export const backendConversationSessionSchema = z.object({
  session_id: z.string().min(1),
  user_email: z.string().optional(),
  brand_id: z.string().nullable().optional(),
  ad_account_id: z.string().nullable().optional(),
  conversation_title: z.string().nullable().optional(),
  last_message_role: jainaConversationRoleSchema.nullable().optional(),
  last_message_preview: z.string().nullable().optional(),
  last_message_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type BackendConversationSession = z.infer<
  typeof backendConversationSessionSchema
>;

export const backendConversationsListResponseSchema = z.object({
  sessions: z.array(backendConversationSessionSchema),
});
export type BackendConversationsListResponse = z.infer<
  typeof backendConversationsListResponseSchema
>;

export const backendConversationMessageSchema = z.object({
  id: z.number().int().nonnegative(),
  session_id: z.string().min(1),
  user_email: z.string().optional(),
  brand_id: z.string().nullable().optional(),
  ad_account_id: z.string().nullable().optional(),
  role: jainaConversationRoleSchema,
  content: z.string(),
  report: z.unknown().optional(),
  report_assembly: z.unknown().optional(),
  report_assembly_html: z.string().nullable().optional(),
  final_thought: z.string().nullable().optional(),
  render_as_report: z.boolean().optional(),
  reasoning: z.array(z.unknown()).optional(),
  tool_calls: z.array(z.unknown()).optional(),
  tool_results: z.array(z.unknown()).optional(),
  artifacts: z.record(z.string(), z.unknown()).optional(),
  pending_clarification: z
    .object({
      id: z.string().optional(),
      question: z.string(),
    })
    .optional(),
  objectives: z.array(z.unknown()).optional(),
  created_at: z.string(),
});
export type BackendConversationMessage = z.infer<
  typeof backendConversationMessageSchema
>;

export const backendConversationMessagesResponseSchema = z.object({
  session_id: z.string().min(1),
  messages: z.array(backendConversationMessageSchema),
});
export type BackendConversationMessagesResponse = z.infer<
  typeof backendConversationMessagesResponseSchema
>;

export function mapConversationSessionRow(
  row: BackendConversationSession
): JainaConversationSession {
  return {
    sessionId: row.session_id,
    brandId: row.brand_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    title: row.conversation_title ?? null,
    lastMessageRole: row.last_message_role ?? null,
    lastMessagePreview: row.last_message_preview ?? null,
    lastMessageAt: row.last_message_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapConversationMessageRow(
  row: BackendConversationMessage
): JainaConversationMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    brandId: row.brand_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    role: row.role,
    content: row.content,
    ...(row.report !== undefined ? { report: row.report } : {}),
    ...(row.report_assembly !== undefined
      ? { reportAssembly: row.report_assembly }
      : {}),
    ...(typeof row.report_assembly_html === "string"
      ? { reportAssemblyHtml: row.report_assembly_html }
      : {}),
    ...(typeof row.final_thought === "string"
      ? { finalThought: row.final_thought }
      : {}),
    ...(typeof row.render_as_report === "boolean"
      ? { renderAsReport: row.render_as_report }
      : {}),
    ...(Array.isArray(row.reasoning) ? { reasoning: row.reasoning } : {}),
    ...(Array.isArray(row.tool_calls) ? { toolCalls: row.tool_calls } : {}),
    ...(Array.isArray(row.tool_results) ? { toolResults: row.tool_results } : {}),
    ...(row.artifacts !== undefined ? { artifacts: row.artifacts } : {}),
    ...(row.pending_clarification !== undefined
      ? { pendingClarification: row.pending_clarification }
      : {}),
    ...(Array.isArray(row.objectives) ? { objectives: row.objectives } : {}),
    createdAt: row.created_at,
  };
}

export function mapConversationCreateResponse(
  row: CreateConversationSessionResponse
): Pick<JainaConversationSession, "sessionId" | "brandId" | "adAccountId" | "title"> {
  return {
    sessionId: row.session_id,
    brandId: row.brand_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    title: row.conversation_title ?? null,
  };
}

export function toConversationPreview(content: string, maxLength = 160): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function normalizeTimestamp(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}
