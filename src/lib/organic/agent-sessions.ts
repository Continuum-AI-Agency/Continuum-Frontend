import { z } from "zod";
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

const backendSessionSchema = z.object({
  session_id: z.string(),
  brand_id: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  last_message_role: z.enum(["user", "assistant"]).nullable().optional(),
  last_message_preview: z.string().nullable().optional(),
  last_message_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

// The backend GET messages route sends the store ChatMessage shape
// ({ role, content, metadata, uiCards }); id/session_id/created_at are not
// guaranteed. Keep them optional with fallbacks so a missing field never
// drops the whole message (which previously blanked reloaded conversations).
const backendMessageSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String).optional(),
  session_id: z.string().optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  metadata: agentMentionMetadataSchema.optional(),
  uiCards: z.array(z.unknown()).optional(),
  created_at: z.string().optional(),
});

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

function mapSession(row: z.infer<typeof backendSessionSchema>): OrganicSession {
  return {
    sessionId: row.session_id,
    brandId: row.brand_id ?? null,
    title: row.title ?? null,
    lastMessageRole: row.last_message_role ?? null,
    lastMessagePreview: row.last_message_preview ?? null,
    lastMessageAt: row.last_message_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(
  row: z.infer<typeof backendMessageSchema>,
  index: number,
  sessionId: string
): OrganicSessionMessage {
  return {
    id: row.id ?? `${sessionId}:msg:${index}`,
    sessionId: row.session_id ?? sessionId,
    role: row.role,
    content: row.content,
    metadata: row.metadata,
    uiCardFrames: Array.isArray(row.uiCards) ? row.uiCards : [],
    createdAt: row.created_at ?? "",
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
      .map((row) => backendSessionSchema.safeParse(row))
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
      .map((row) => backendMessageSchema.safeParse(row))
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
