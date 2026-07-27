import {
  type AgentInitiator,
  agentInitiatorSchema,
  agentSessionProvenanceSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import { agentMentionMetadataSchema } from '@/lib/agent-references';
import {
  type FrontendCheckpointReport,
  type ReportAssembly,
  reportAssemblySchema,
} from './schemas';

export const jainaConversationRoleSchema = z.enum(['user', 'assistant']);
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
  ...agentSessionProvenanceSchema.shape,
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
  metadata: agentMentionMetadataSchema.optional(),
  createdAt: z.string(),
});
export type JainaConversationMessage = z.infer<typeof jainaConversationMessageSchema>;

export const jainaConversationListResponseSchema = z.object({
  sessions: z.array(jainaConversationSessionSchema),
  messages: z.array(jainaConversationMessageSchema).optional(),
  // created_at to page strictly before; null once the transcript is fully loaded.
  nextCursor: z.string().nullable().optional(),
});
export type JainaConversationListResponse = z.infer<typeof jainaConversationListResponseSchema>;

export const jainaConversationListQuerySchema = z.object({
  brandId: z.string().min(1),
  adAccountId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  messagesLimit: z.coerce.number().int().min(1).max(500).default(150),
  before: z.string().min(1).optional(),
  // Chat-history search/filters, forwarded verbatim to the Backend list route.
  q: z.string().trim().min(1).optional(),
  initiator: agentInitiatorSchema.optional(),
  initiatorAgent: z.string().trim().min(1).optional(),
  tags: z.string().trim().min(1).optional(),
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
  initiator: agentInitiatorSchema.nullable().optional(),
  initiator_agent: z.string().nullable().optional(),
  caller_run_id: z.string().nullable().optional(),
  caller_session_id: z.string().nullable().optional(),
  cross_call_id: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  preview: z.string().nullable().optional(),
});
export type BackendConversationSession = z.infer<typeof backendConversationSessionSchema>;

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
  metadata: agentMentionMetadataSchema.nullable().optional(),
  created_at: z.string(),
});
export type BackendConversationMessage = z.infer<typeof backendConversationMessageSchema>;

export const backendConversationMessagesResponseSchema = z.object({
  session_id: z.string().min(1),
  messages: z.array(backendConversationMessageSchema),
  // Absent on a backend that predates pagination, which reads as "no older page".
  nextCursor: z.string().nullable().optional(),
});
export type BackendConversationMessagesResponse = z.infer<
  typeof backendConversationMessagesResponseSchema
>;

export const jainaConversationRunsHydrationQuerySchema = z.object({
  brandId: z.string().min(1),
  adAccountId: z.string().min(1).optional(),
  sessionId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(500).default(250),
});
export type JainaConversationRunsHydrationQuery = z.infer<
  typeof jainaConversationRunsHydrationQuerySchema
>;

export const backendConversationRunSchema = z.object({
  id: z.number().int().nonnegative().nullable().optional(),
  run_id: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  brand_id: z.string().nullable().optional(),
  ad_account_id: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  result_type: z.string().nullable().optional(),
  result_payload: z.unknown().nullable().optional(),
  query: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});
export type BackendConversationRun = z.infer<typeof backendConversationRunSchema>;

export const jainaConversationRunSchema = z.object({
  id: z.number().int().nonnegative().nullable().optional(),
  runId: z.string().nullable(),
  sessionId: z.string().nullable(),
  brandId: z.string().nullable(),
  adAccountId: z.string().nullable(),
  status: z.string().nullable(),
  resultType: z.string().nullable(),
  resultPayload: z.unknown().nullable(),
  query: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type JainaConversationRun = z.infer<typeof jainaConversationRunSchema>;

export const jainaConversationRunsHydrationResponseSchema = z.object({
  sessionId: z.string().min(1),
  runs: z.array(jainaConversationRunSchema),
});
export type JainaConversationRunsHydrationResponse = z.infer<
  typeof jainaConversationRunsHydrationResponseSchema
>;

function normalizeReportAssemblyForConversationLoad(
  reportAssembly: ReportAssembly,
): FrontendCheckpointReport {
  const snapshot = reportAssembly.metrics.map((metric) => ({
    metric: metric.label,
    value: metric.actual,
    change: metric.index_percent,
    suffix: metric.unit === '%' ? '%' : undefined,
    context: `Planned: ${metric.planned}`,
    status:
      metric.deviation_type === 'positive'
        ? 'positive'
        : metric.deviation_type === 'negative'
          ? 'risk'
          : 'neutral',
  }));

  const recommendations = reportAssembly.recommendations.map((entry) => {
    if (typeof entry === 'string') {
      return {
        title: entry,
        rationale: entry,
        expected_impact: null,
        priority: 'MEDIUM',
      };
    }

    return {
      title: entry.title,
      rationale: entry.rationale,
      expected_impact: entry.expected_impact,
      priority: entry.priority,
    };
  });

  return {
    language: 'en',
    report_title: reportAssembly.header.title,
    executive_summary: reportAssembly.summary.narrative,
    budget: null,
    performance_snapshot: snapshot,
    blocks: [],
    sections: [
      {
        heading: reportAssembly.header.title,
        scope: reportAssembly.header.period,
        summary: reportAssembly.summary.principal_deviation || '',
        highlights: reportAssembly.insights,
        tables: [],
        actions: recommendations,
        confidence: null,
        cached_sources: [],
        graphs: reportAssembly.charts,
      },
    ],
    strategic_recommendations: recommendations,
    follow_up_questions: [],
    handoff_trace: [],
    execution_objectives: [],
    cached_sources: [],
    graphs: reportAssembly.charts,
  };
}

function deriveReportFromConversationMetadata(row: BackendConversationMessage): unknown {
  if (row.report !== undefined) return row.report;

  const parsedAssembly = reportAssemblySchema.safeParse(row.report_assembly);
  if (!parsedAssembly.success) return undefined;

  return normalizeReportAssemblyForConversationLoad(parsedAssembly.data);
}

export function mapConversationSessionRow(
  row: BackendConversationSession,
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
    initiator: (row.initiator ?? 'user') as AgentInitiator,
    initiatorAgent: row.initiator_agent ?? null,
    callerRunId: row.caller_run_id ?? null,
    callerSessionId: row.caller_session_id ?? null,
    crossCallId: row.cross_call_id ?? null,
    tags: row.tags ?? [],
    preview: row.preview ?? null,
  };
}

export function mapConversationMessageRow(
  row: BackendConversationMessage,
): JainaConversationMessage {
  const report = deriveReportFromConversationMetadata(row);

  return {
    id: row.id,
    sessionId: row.session_id,
    brandId: row.brand_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    role: row.role,
    content: row.content,
    ...(report !== undefined ? { report } : {}),
    ...(row.report_assembly !== undefined ? { reportAssembly: row.report_assembly } : {}),
    ...(typeof row.report_assembly_html === 'string'
      ? { reportAssemblyHtml: row.report_assembly_html }
      : {}),
    ...(typeof row.final_thought === 'string' ? { finalThought: row.final_thought } : {}),
    ...(typeof row.render_as_report === 'boolean' ? { renderAsReport: row.render_as_report } : {}),
    ...(Array.isArray(row.reasoning) ? { reasoning: row.reasoning } : {}),
    ...(Array.isArray(row.tool_calls) ? { toolCalls: row.tool_calls } : {}),
    ...(Array.isArray(row.tool_results) ? { toolResults: row.tool_results } : {}),
    ...(row.artifacts !== undefined ? { artifacts: row.artifacts } : {}),
    ...(row.pending_clarification !== undefined
      ? { pendingClarification: row.pending_clarification }
      : {}),
    ...(Array.isArray(row.objectives) ? { objectives: row.objectives } : {}),
    ...(row.metadata != null ? { metadata: row.metadata } : {}),
    createdAt: row.created_at,
  };
}

export function mapConversationCreateResponse(
  row: CreateConversationSessionResponse,
): Pick<JainaConversationSession, 'sessionId' | 'brandId' | 'adAccountId' | 'title'> {
  return {
    sessionId: row.session_id,
    brandId: row.brand_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    title: row.conversation_title ?? null,
  };
}

export function mapConversationRunRow(row: BackendConversationRun): JainaConversationRun {
  return {
    id: row.id ?? null,
    runId: row.run_id ?? null,
    sessionId: row.session_id ?? null,
    brandId: row.brand_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    status: row.status ?? null,
    resultType: row.result_type ?? null,
    resultPayload: row.result_payload ?? null,
    query: row.query ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function toConversationPreview(content: string, maxLength = 160): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function normalizeTimestamp(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}
