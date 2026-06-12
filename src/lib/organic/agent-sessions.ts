import {
  organicChatMessageDtoSchema,
  organicChatSessionDtoSchema,
  type OrganicChatMessageDto,
  type OrganicChatSessionDto,
} from "@continuum/contracts";
import { request } from "@/lib/api/http";
import { agentMentionMetadataSchema, type AgentMentionMetadata } from "@/lib/agent-references";

export type OrganicSession = {
  sessionId: string;
  brandId: string | null;
  title: string | null;
  lastMessageRole: "user" | "assistant" | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganicSessionMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: AgentMentionMetadata;
  /** Raw embedded card frames persisted with the message; replayed on load. */
  uiCardFrames: unknown[];
  createdAt: string;
};

const MESSAGE_CACHE_TTL_MS = 60_000;

const messageCache = new Map<string, { messages: OrganicSessionMessage[]; fetchedAt: number }>();

let pendingMessageFetch: AbortController | null = null;

export function invalidateMessageCache(sessionId: string): void {
  messageCache.delete(sessionId);
}

// Wire shapes come from @continuum/contracts (organicChatSessionDtoSchema /
// organicChatMessageDtoSchema). These are CAMELCASE to match what the Backend
// conversation store emits. A prior snake_case parser silently dropped every
// session row and blanked the conversations sidebar — parsing both sides against
// the shared contract is what prevents that drift recurring.

function extractSessions(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj["sessions"])) return obj["sessions"];
    if (Array.isArray(obj["data"])) return obj["data"];
  }
  return [];
}

function extractMessages(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj["messages"])) return obj["messages"];
    if (Array.isArray(obj["data"])) return obj["data"];
  }
  return [];
}

function mapSession(row: OrganicChatSessionDto): OrganicSession {
  return {
    sessionId: row.sessionId,
    brandId: row.brandId ?? null,
    title: row.title ?? null,
    lastMessageRole: row.lastMessageRole ?? null,
    lastMessagePreview: row.lastMessagePreview ?? null,
    lastMessageAt: row.lastMessageAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? row.lastMessageAt ?? row.createdAt,
  };
}

// metadata is loose (unknown) in the contract; narrow it to the Frontend's
// agent-mention shape here, dropping it if it doesn't match rather than failing.
function narrowMetadata(metadata: unknown): AgentMentionMetadata | undefined {
  if (metadata === undefined || metadata === null) return undefined;
  const parsed = agentMentionMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data : undefined;
}

function mapMessage(
  row: OrganicChatMessageDto,
  index: number,
  sessionId: string
): OrganicSessionMessage {
  return {
    id: row.id != null ? String(row.id) : `${sessionId}:msg:${index}`,
    sessionId: row.sessionId ?? sessionId,
    role: row.role,
    content: row.content,
    metadata: narrowMetadata(row.metadata),
    uiCardFrames: Array.isArray(row.uiCards) ? row.uiCards : [],
    createdAt: row.createdAt ?? "",
  };
}

export async function fetchOrganicSessions(
  brandId: string
): Promise<OrganicSession[]> {
  try {
    const raw = await request({
      path: `/api/organic/agent/sessions?brand_id=${encodeURIComponent(brandId)}`,
    });
    return extractSessions(raw)
      .map((row) => organicChatSessionDtoSchema.safeParse(row))
      .filter((result) => result.success)
      .map((result) => mapSession(result.data));
  } catch (error) {
    console.error("[fetchOrganicSessions] failed:", error);
    return [];
  }
}

export async function fetchOrganicSessionMessages(
  sessionId: string,
  brandId: string
): Promise<OrganicSessionMessage[]> {
  const cached = messageCache.get(sessionId);
  if (cached && Date.now() - cached.fetchedAt < MESSAGE_CACHE_TTL_MS) {
    return cached.messages;
  }

  pendingMessageFetch?.abort();
  const controller = new AbortController();
  pendingMessageFetch = controller;

  try {
    const raw = await request({
      path: `/api/organic/agent/sessions/${encodeURIComponent(sessionId)}/messages?brand_id=${encodeURIComponent(brandId)}`,
      signal: controller.signal,
    });
    const messages = extractMessages(raw)
      .map((row) => organicChatMessageDtoSchema.safeParse(row))
      .filter((result) => result.success)
      .map((result, index) => mapMessage(result.data, index, sessionId));
    messageCache.set(sessionId, { messages, fetchedAt: Date.now() });
    return messages;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return [];
    console.error("[fetchOrganicSessionMessages] failed:", error);
    return [];
  }
}

/**
 * Hard-deletes a conversation (messages + session + runs + run-events) on the
 * Backend. Throws on failure so callers can keep the row in the UI; clears the
 * local message cache on success.
 */
export async function deleteOrganicSession(sessionId: string, brandId: string): Promise<void> {
  await request({
    path: `/api/organic/agent/sessions/${encodeURIComponent(sessionId)}?brand_id=${encodeURIComponent(brandId)}`,
    method: "DELETE",
  });
  invalidateMessageCache(sessionId);
}
