import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApiBaseUrl } from "@/lib/api/config";
import {
  backendConversationMessagesResponseSchema,
  backendConversationsListResponseSchema,
  createConversationSessionRequestSchema,
  createConversationSessionResponseSchema,
  jainaConversationListQuerySchema,
  jainaConversationListResponseSchema,
  mapConversationMessageRow,
  mapConversationSessionRow,
  type JainaConversationListQuery,
} from "@/lib/jaina/conversations";

export const runtime = "nodejs";

type AuthResult =
  | { ok: true; accessToken: string }
  | { ok: false; response: NextResponse };

async function authorizeConversationRequest(): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, accessToken };
}

function buildConversationListPaths() {
  const configuredPath = process.env.JAINA_CONVERSATIONS_API_PATH?.trim();
  const candidatePaths = [
    configuredPath && configuredPath.length > 0 ? configuredPath : null,
    "/api/agents/jaina/chat/conversations",
    "/api/agents/jaina/conversations",
  ].filter((path): path is string => Boolean(path));
  return Array.from(new Set(candidatePaths));
}

function buildConversationMessagesPaths(sessionId: string) {
  const encodedSessionId = encodeURIComponent(sessionId);
  return [
    `/api/agents/jaina/chat/conversations/${encodedSessionId}/messages`,
    `/api/agents/jaina/conversations/${encodedSessionId}/messages`,
  ];
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

async function readErrorMessage(response: Response, fallback: string) {
  const detail = await response.text().catch(() => fallback);
  if (!detail) return fallback;
  try {
    const parsed = JSON.parse(detail);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const errorMessage = (parsed as { error?: unknown }).error;
      if (typeof errorMessage === "string" && errorMessage.length > 0) {
        return errorMessage;
      }
    }
  } catch {
    // plain text
  }
  return detail;
}

type BackendFetchResult =
  | { ok: true; response: Response }
  | { ok: false; errorResponse: NextResponse };

async function fetchBackendWithFallback(input: {
  accessToken: string;
  method: "GET" | "POST";
  paths: string[];
  query?: string;
  body?: string;
  failureMessage: string;
}) {
  const baseUrl = getApiBaseUrl();
  const attempted: string[] = [];

  for (const path of input.paths) {
    const normalizedPath = normalizePath(path);
    const url = input.query
      ? `${baseUrl}${normalizedPath}?${input.query}`
      : `${baseUrl}${normalizedPath}`;
    attempted.push(url);

    const backendResponse = await fetch(url, {
      method: input.method,
      headers: {
        ...(input.method === "POST" ? { "Content-Type": "application/json" } : {}),
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      ...(input.body ? { body: input.body } : {}),
      cache: "no-store",
    });

    if (backendResponse.status === 404) {
      continue;
    }

    if (!backendResponse.ok) {
      const message = await readErrorMessage(backendResponse, input.failureMessage);
      return {
        ok: false,
        errorResponse: NextResponse.json(
          { error: message },
          { status: backendResponse.status || 500 }
        ),
      } satisfies BackendFetchResult;
    }

    return { ok: true, response: backendResponse } satisfies BackendFetchResult;
  }

  return {
    ok: false,
    errorResponse: NextResponse.json(
      {
        error: "Conversation endpoint not available on backend.",
        attempted,
      },
      { status: 502 }
    ),
  } satisfies BackendFetchResult;
}

function buildListQueryString(query: JainaConversationListQuery) {
  const params = new URLSearchParams({
    brand_id: query.brandId,
    limit: String(query.limit),
  });
  if (query.adAccountId) {
    params.set("ad_account_id", query.adAccountId);
  }
  return params.toString();
}

function buildMessagesQueryString(limit: number) {
  const params = new URLSearchParams({ limit: String(limit) });
  return params.toString();
}

export async function GET(request: Request) {
  const auth = await authorizeConversationRequest();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsedQuery = jainaConversationListQuerySchema.safeParse({
    brandId:
      searchParams.get("brandId") ??
      searchParams.get("brand_id") ??
      undefined,
    adAccountId:
      searchParams.get("adAccountId") ??
      searchParams.get("ad_account_id") ??
      undefined,
    sessionId:
      searchParams.get("sessionId") ??
      searchParams.get("session_id") ??
      undefined,
    limit:
      searchParams.get("limit") ??
      searchParams.get("sessionsLimit") ??
      searchParams.get("sessions_limit") ??
      undefined,
    messagesLimit:
      searchParams.get("messagesLimit") ??
      searchParams.get("messages_limit") ??
      undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", details: parsedQuery.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const sessionsResult = await fetchBackendWithFallback({
      accessToken: auth.accessToken,
      method: "GET",
      paths: buildConversationListPaths(),
      query: buildListQueryString(parsedQuery.data),
      failureMessage: "Failed to load conversations.",
    });
    if (!sessionsResult.ok) return sessionsResult.errorResponse;

    const sessionsPayload = await sessionsResult.response.json().catch(() => null);
    const parsedSessions =
      backendConversationsListResponseSchema.safeParse(sessionsPayload);
    if (!parsedSessions.success) {
      return NextResponse.json(
        { error: "Invalid conversations response from backend." },
        { status: 502 }
      );
    }

    const sessions = parsedSessions.data.sessions.map(mapConversationSessionRow);

    if (!parsedQuery.data.sessionId) {
      return NextResponse.json(
        jainaConversationListResponseSchema.parse({ sessions })
      );
    }

    const messagesResult = await fetchBackendWithFallback({
      accessToken: auth.accessToken,
      method: "GET",
      paths: buildConversationMessagesPaths(parsedQuery.data.sessionId),
      query: buildMessagesQueryString(parsedQuery.data.messagesLimit),
      failureMessage: "Failed to load conversation messages.",
    });
    if (!messagesResult.ok) return messagesResult.errorResponse;

    const messagesPayload = await messagesResult.response.json().catch(() => null);
    const parsedMessages =
      backendConversationMessagesResponseSchema.safeParse(messagesPayload);
    if (!parsedMessages.success) {
      return NextResponse.json(
        { error: "Invalid messages response from backend." },
        { status: 502 }
      );
    }

    const messages = parsedMessages.data.messages.map(mapConversationMessageRow);
    return NextResponse.json(
      jainaConversationListResponseSchema.parse({ sessions, messages })
    );
  } catch (error) {
    console.error("Error loading Jaina conversations:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeConversationRequest();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = createConversationSessionRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid conversation create payload.", details: parsedBody.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const createResult = await fetchBackendWithFallback({
      accessToken: auth.accessToken,
      method: "POST",
      paths: buildConversationListPaths(),
      body: JSON.stringify(parsedBody.data),
      failureMessage: "Failed to create conversation session.",
    });
    if (!createResult.ok) return createResult.errorResponse;

    const payload = await createResult.response.json().catch(() => null);
    const parsed = createConversationSessionResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid create-session response from backend." },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed.data, { status: 201 });
  } catch (error) {
    console.error("Error creating Jaina conversation session:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
