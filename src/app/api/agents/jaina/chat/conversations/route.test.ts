import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const getUserMock = mock(() =>
  Promise.resolve({
    data: { user: { id: "user-1", email: "analyst@example.com" } },
    error: null,
  })
);

const getSessionMock = mock(() =>
  Promise.resolve({
    data: { session: { access_token: "session-token" } },
    error: null,
  })
);

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        getUser: getUserMock,
        getSession: getSessionMock,
      },
    }),
}));

mock.module("@/lib/api/config", () => ({
  getApiBaseUrl: () => "https://api.example.com",
}));

import { GET, POST } from "./route";

describe("Jaina conversations proxy route", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    getUserMock.mockClear();
    getSessionMock.mockClear();

    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              session_id: "chat_abc123",
              brand_id: "brand-1",
              ad_account_id: "act-1",
              conversation_title: null,
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (url.includes("/messages?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              session_id: "chat_abc123",
              messages: [
                {
                  id: 1,
                  session_id: "chat_abc123",
                  user_email: "analyst@example.com",
                  brand_id: "brand-1",
                  ad_account_id: "act-1",
                  role: "user",
                  content: "Show me top campaigns",
                  metadata: null,
                  created_at: "2026-03-07T05:40:10.000Z",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            sessions: [
              {
                session_id: "chat_abc123",
                user_email: "analyst@example.com",
                brand_id: "brand-1",
                ad_account_id: "act-1",
                conversation_title: "Android Campaign Performance Audit",
                last_message_role: "assistant",
                last_message_preview: "Top 3 campaigns by ROAS are...",
                last_message_at: "2026-03-07T05:41:22.000Z",
                created_at: "2026-03-07T05:40:00.000Z",
                updated_at: "2026-03-07T05:41:22.000Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("proxies conversation GET list and session messages using bearer token", async () => {
    const request = new Request(
      "http://localhost/api/agents/jaina/chat/conversations?brandId=brand-1&adAccountId=act-1&sessionId=chat_abc123&limit=20&messagesLimit=150",
      { method: "GET" }
    );

    const response = await GET(request);
    expect(response.status).toBe(200);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    expect(fetchMock.mock.calls.length).toBe(2);

    const [sessionsUrl, sessionsInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(sessionsUrl).toContain("/api/agents/jaina/chat/conversations?");
    expect(sessionsUrl).toContain("brand_id=brand-1");
    expect(sessionsUrl).toContain("ad_account_id=act-1");
    expect(sessionsUrl).toContain("limit=20");
    expect(sessionsInit.headers).toMatchObject({
      Authorization: "Bearer session-token",
      Accept: "application/json",
    });

    const [messagesUrl, messagesInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(messagesUrl).toContain("/api/agents/jaina/chat/conversations/chat_abc123/messages?");
    expect(messagesUrl).toContain("limit=150");
    expect(messagesInit.headers).toMatchObject({
      Authorization: "Bearer session-token",
      Accept: "application/json",
    });

    const payload = await response.json();
    expect(payload.sessions[0]).toMatchObject({
      sessionId: "chat_abc123",
      title: "Android Campaign Performance Audit",
    });
    expect(payload.messages[0]).toMatchObject({
      sessionId: "chat_abc123",
      role: "user",
    });
    expect(payload.messages[0]).not.toHaveProperty("metadata");
  });

  it("proxies conversation session creation payload to backend", async () => {
    const request = new Request(
      "http://localhost/api/agents/jaina/chat/conversations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            adAccountId: "act-1",
            brandId: "brand-1",
            sessionId: "chat_abc123",
          },
        }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(201);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    expect(fetchMock.mock.calls.length).toBe(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/agents/jaina/chat/conversations");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer session-token",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe(
      JSON.stringify({
        context: {
          adAccountId: "act-1",
          brandId: "brand-1",
          sessionId: "chat_abc123",
        },
      })
    );
  });

  it("returns 401 when no authenticated user exists", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const request = new Request(
      "http://localhost/api/agents/jaina/chat/conversations?brandId=brand-1",
      { method: "GET" }
    );

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("tries fallback base path when primary conversations route returns 404", async () => {
    const fetchMock = mock((url: string) => {
      if (url.includes("/api/agents/jaina/chat/conversations?")) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            sessions: [
              {
                session_id: "chat_abc123",
                user_email: "analyst@example.com",
                brand_id: "brand-1",
                ad_account_id: "act-1",
                conversation_title: "Android Campaign Performance Audit",
                last_message_role: "assistant",
                last_message_preview: "Top 3 campaigns by ROAS are...",
                last_message_at: "2026-03-07T05:41:22.000Z",
                created_at: "2026-03-07T05:40:00.000Z",
                updated_at: "2026-03-07T05:41:22.000Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const request = new Request(
      "http://localhost/api/agents/jaina/chat/conversations?brandId=brand-1&adAccountId=act-1",
      { method: "GET" }
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/api/agents/jaina/conversations"
    );
  });
});
