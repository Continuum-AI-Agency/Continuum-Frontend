// Canonical DTOs for the organic-agent conversation history endpoints, shared by
// the Backend (App/organic/agent/src/runtime/conversationStore.ts — producer) and
// the Frontend (src/lib/organic/agent-sessions.ts — consumer).
//
// These are CAMELCASE to match the shape the Backend conversation store already
// emits. A prior drift — the Frontend parser expecting snake_case session rows
// while the Backend sent camelCase — silently dropped every session row and left
// the conversations sidebar permanently empty. Defining the shape here once, and
// parsing both sides against it, is what prevents that recurring.
//
// Field-level resilience: every field except the identity/timestamp anchors is
// optional/nullable so a partial row never drops the whole record at the boundary.

import { z } from 'zod';
import { agentSessionProvenanceSchema } from '../agents/cross-agent';

export const organicChatRoleSchema = z.enum(['user', 'assistant']);
export type OrganicChatRole = z.infer<typeof organicChatRoleSchema>;

/**
 * One session row from GET /api/organic/agent/sessions.
 * Mirrors conversationStore.listChatSessions() output.
 */
export const organicChatSessionDtoSchema = z.object({
  sessionId: z.string(),
  brandId: z.string().nullable().optional(),
  userEmail: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  weekStart: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  lastMessageRole: organicChatRoleSchema.nullable().optional(),
  lastMessagePreview: z.string().nullable().optional(),
  lastMessageAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
  ...agentSessionProvenanceSchema.shape,
});
export type OrganicChatSessionDto = z.infer<typeof organicChatSessionDtoSchema>;

export const organicChatSessionsResponseSchema = z.object({
  sessions: z.array(organicChatSessionDtoSchema),
});
export type OrganicChatSessionsResponse = z.infer<typeof organicChatSessionsResponseSchema>;

/**
 * One message row from GET /api/organic/agent/sessions/:sessionId/messages.
 * Mirrors conversationStore.listChatMessages() output: { role, content, metadata,
 * uiCards }. id/sessionId/createdAt are not emitted by the store, so they stay
 * optional for the Frontend to backfill stable fallbacks.
 *
 * This is the FE<->BE WIRE shape, kept intentionally loose: the Backend produces
 * it directly from unknown DB JSON, so tightening these fields here would force a
 * Backend type change. The typed narrowing happens on the Frontend read boundary
 * — `metadata` via agentMentionMetadataSchema, `uiCards` via
 * persistedOrganicFrameSchema (both in @continuum/contracts) — so the contract
 * still owns the typed shapes, applied where the data is consumed.
 */
export const organicChatMessageDtoSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  sessionId: z.string().optional(),
  role: organicChatRoleSchema,
  content: z.string(),
  metadata: z.unknown().optional(),
  uiCards: z.array(z.unknown()).optional(),
  createdAt: z.string().optional(),
});
export type OrganicChatMessageDto = z.infer<typeof organicChatMessageDtoSchema>;

export const organicChatMessagesResponseSchema = z.object({
  messages: z.array(organicChatMessageDtoSchema),
  // created_at to page strictly before; null once the whole transcript is loaded. Absent on
  // responses from a backend that predates pagination, which reads as "no older page".
  nextCursor: z.string().nullable().optional(),
});
export type OrganicChatMessagesResponse = z.infer<typeof organicChatMessagesResponseSchema>;
