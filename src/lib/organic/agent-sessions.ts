import type { AgentInitiator, AgentSessionListFilters } from '@continuum/contracts';
import {
  type OrganicChatMessageDto,
  type OrganicChatSessionDto,
  organicChatMessageDtoSchema,
  organicChatSessionDtoSchema,
  type PersistedOrganicFrame,
  persistedOrganicFrameSchema,
  updateAgentSessionTagsResponseSchema,
} from '@continuum/contracts';
import { type AgentMentionMetadata, agentMentionMetadataSchema } from '@/lib/agent-references';
import { request } from '@/lib/api/http';

export type OrganicSession = {
  sessionId: string;
  brandId: string | null;
  title: string | null;
  lastMessageRole: 'user' | 'assistant' | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Who started the conversation: a human, or another agent delegating to Organic. */
  initiator: AgentInitiator;
  initiatorAgent: string | null;
  /** Set on AI-initiated sessions — the originating run/session to link back to. */
  callerRunId: string | null;
  callerSessionId: string | null;
  tags: string[];
  /** First user message, truncated — what server-side search matches on. */
  preview: string | null;
};

export type OrganicSessionMessage = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: AgentMentionMetadata;
  /** Persisted card frames stored with the message; replayed on load. */
  uiCardFrames: PersistedOrganicFrame[];
  createdAt: string;
};

const MESSAGE_CACHE_TTL_MS = 60_000;

const messageCache = new Map<
  string,
  { messages: OrganicSessionMessage[]; nextCursor: string | null; fetchedAt: number }
>();

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
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj['sessions'])) return obj['sessions'];
    if (Array.isArray(obj['data'])) return obj['data'];
  }
  return [];
}

function extractMessages(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj['messages'])) return obj['messages'];
    if (Array.isArray(obj['data'])) return obj['data'];
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
    initiator: row.initiator ?? 'user',
    initiatorAgent: row.initiatorAgent ?? null,
    callerRunId: row.callerRunId ?? null,
    callerSessionId: row.callerSessionId ?? null,
    tags: row.tags ?? [],
    preview: row.preview ?? null,
  };
}

// The wire DTO keeps metadata/uiCards loose (the Backend produces them from
// unknown DB JSON). Narrow them here against the shared @continuum/contracts
// schemas so the contract still owns the typed shapes — dropping anything that
// doesn't match rather than failing, the same resilience the reload path needs.
function narrowMetadata(metadata: unknown): AgentMentionMetadata | undefined {
  if (metadata === undefined || metadata === null) return undefined;
  const parsed = agentMentionMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data : undefined;
}

function toPersistedFrames(uiCards: unknown[] | undefined): PersistedOrganicFrame[] {
  if (!Array.isArray(uiCards)) return [];
  return uiCards.flatMap((frame) => {
    const parsed = persistedOrganicFrameSchema.safeParse(frame);
    return parsed.success ? [parsed.data] : [];
  });
}

function mapMessage(
  row: OrganicChatMessageDto,
  index: number,
  sessionId: string,
): OrganicSessionMessage {
  return {
    id: row.id != null ? String(row.id) : `${sessionId}:msg:${index}`,
    sessionId: row.sessionId ?? sessionId,
    role: row.role,
    content: row.content,
    metadata: narrowMetadata(row.metadata),
    uiCardFrames: toPersistedFrames(row.uiCards),
    createdAt: row.createdAt ?? '',
  };
}

export async function fetchOrganicSessions(
  brandId: string,
  filters?: AgentSessionListFilters,
): Promise<OrganicSession[]> {
  try {
    const query = new URLSearchParams({ brand_id: brandId });
    if (filters?.q) query.set('q', filters.q);
    if (filters?.initiator) query.set('initiator', filters.initiator);
    if (filters?.initiatorAgent) query.set('initiator_agent', filters.initiatorAgent);
    if (filters?.tags && filters.tags.length > 0) query.set('tags', filters.tags.join(','));

    const raw = await request({
      path: `/api/organic/agent/sessions?${query.toString()}`,
    });
    return extractSessions(raw)
      .map((row) => organicChatSessionDtoSchema.safeParse(row))
      .filter((result) => result.success)
      .map((result) => mapSession(result.data));
  } catch (error) {
    console.error('[fetchOrganicSessions] failed:', error);
    return [];
  }
}

export type OrganicMessagePage = {
  messages: OrganicSessionMessage[];
  /** Cursor for the next OLDER page, or null when the transcript is fully loaded. */
  nextCursor: string | null;
};

function extractNextCursor(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const cursor = (raw as Record<string, unknown>)['nextCursor'];
  return typeof cursor === 'string' ? cursor : null;
}

/**
 * Fetches one page of a session's transcript, newest page first. Pass `before` (the cursor from a
 * previous page) to walk backwards through older messages. Only the first page is cached and only
 * the first page aborts an in-flight fetch — a "load earlier" request must not cancel it.
 */
export async function fetchOrganicSessionMessagePage(
  sessionId: string,
  brandId: string,
  before?: string,
): Promise<OrganicMessagePage> {
  const isFirstPage = !before;

  if (isFirstPage) {
    const cached = messageCache.get(sessionId);
    if (cached && Date.now() - cached.fetchedAt < MESSAGE_CACHE_TTL_MS) {
      return { messages: cached.messages, nextCursor: cached.nextCursor };
    }
    pendingMessageFetch?.abort();
  }

  const controller = new AbortController();
  if (isFirstPage) pendingMessageFetch = controller;

  const query = new URLSearchParams({ brand_id: brandId });
  if (before) query.set('before', before);

  try {
    const raw = await request({
      path: `/api/organic/agent/sessions/${encodeURIComponent(sessionId)}/messages?${query.toString()}`,
      signal: controller.signal,
    });
    const messages = extractMessages(raw)
      .map((row) => organicChatMessageDtoSchema.safeParse(row))
      .filter((result) => result.success)
      .map((result, index) => mapMessage(result.data, index, sessionId));
    const nextCursor = extractNextCursor(raw);

    if (isFirstPage) {
      messageCache.set(sessionId, { messages, nextCursor, fetchedAt: Date.now() });
    }
    return { messages, nextCursor };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { messages: [], nextCursor: null };
    }
    console.error('[fetchOrganicSessionMessagePage] failed:', error);
    return { messages: [], nextCursor: null };
  }
}

export async function fetchOrganicSessionMessages(
  sessionId: string,
  brandId: string,
): Promise<OrganicSessionMessage[]> {
  const { messages } = await fetchOrganicSessionMessagePage(sessionId, brandId);
  return messages;
}

/**
 * Replaces a conversation's tags. Throws on failure so the caller can keep the
 * previous chips; returns the tags as STORED (normalized server-side), which is
 * what the sidebar must render — not the raw input.
 */
export async function updateOrganicSessionTags(
  sessionId: string,
  brandId: string,
  tags: string[],
): Promise<string[]> {
  const raw = await request({
    path: `/api/organic/agent/sessions/${encodeURIComponent(sessionId)}?brand_id=${encodeURIComponent(brandId)}`,
    method: 'PATCH',
    body: { tags },
  });
  const parsed = updateAgentSessionTagsResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data.tags : tags;
}

/**
 * Hard-deletes a conversation (messages + session + runs + run-events) on the
 * Backend. Throws on failure so callers can keep the row in the UI; clears the
 * local message cache on success.
 */
export async function deleteOrganicSession(sessionId: string, brandId: string): Promise<void> {
  await request({
    path: `/api/organic/agent/sessions/${encodeURIComponent(sessionId)}?brand_id=${encodeURIComponent(brandId)}`,
    method: 'DELETE',
  });
  invalidateMessageCache(sessionId);
}
