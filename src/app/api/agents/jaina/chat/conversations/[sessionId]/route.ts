import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

function buildDeleteConversationPaths(sessionId: string) {
  const encodedSessionId = encodeURIComponent(sessionId);
  const configuredPath = process.env.JAINA_CONVERSATIONS_API_PATH?.trim();

  const candidatePaths = [
    configuredPath && configuredPath.length > 0
      ? `${configuredPath}/${encodedSessionId}`
      : null,
    `/api/agents/jaina/chat/conversations/${encodedSessionId}`,
    `/api/agents/jaina/conversations/${encodedSessionId}`,
  ].filter((path): path is string => Boolean(path));

  return Array.from(new Set(candidatePaths));
}

type BackendDeleteResult =
  | { ok: true; response: Response }
  | { ok: false; errorResponse: NextResponse };

async function deleteBackendConversationWithFallback(
  accessToken: string,
  sessionId: string
) {
  const baseUrl = getApiBaseUrl();
  const attempted: string[] = [];
  const paths = buildDeleteConversationPaths(sessionId);

  for (const path of paths) {
    const normalizedPath = normalizePath(path);
    const url = `${baseUrl}${normalizedPath}`;
    attempted.push(url);

    const backendResponse = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (backendResponse.status === 404) {
      continue;
    }

    if (!backendResponse.ok) {
      const message = await readErrorMessage(
        backendResponse,
        "Failed to delete conversation."
      );
      return {
        ok: false,
        errorResponse: NextResponse.json(
          { error: message },
          { status: backendResponse.status || 500 }
        ),
      } satisfies BackendDeleteResult;
    }

    return { ok: true, response: backendResponse } satisfies BackendDeleteResult;
  }

  return {
    ok: false,
    errorResponse: NextResponse.json(
      {
        error: "Conversation delete endpoint not available on backend.",
        attempted,
      },
      { status: 502 }
    ),
  } satisfies BackendDeleteResult;
}

type DeleteRouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function DELETE(_: Request, context: DeleteRouteContext) {
  const auth = await authorizeConversationRequest();
  if (!auth.ok) return auth.response;

  const { sessionId } = await context.params;
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return NextResponse.json(
      { error: "Session id is required." },
      { status: 400 }
    );
  }

  try {
    const result = await deleteBackendConversationWithFallback(
      auth.accessToken,
      normalizedSessionId
    );
    if (!result.ok) return result.errorResponse;

    const text = await result.response.text().catch(() => "");
    if (!text) {
      return NextResponse.json({ deleted: true, sessionId: normalizedSessionId });
    }

    try {
      const payload = JSON.parse(text) as unknown;
      return NextResponse.json(payload);
    } catch {
      return NextResponse.json({ deleted: true, sessionId: normalizedSessionId });
    }
  } catch (error) {
    console.error("Error deleting Jaina conversation:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

