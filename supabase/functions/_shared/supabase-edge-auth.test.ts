import { describe, expect, test } from "bun:test";
import {
  authorizeSupabaseEdgeRequest,
  extractBearerToken,
  isServiceRoleToken,
} from "./supabase-edge-auth";

describe("supabase-edge-auth", () => {
  test("extracts bearer tokens", () => {
    expect(extractBearerToken("Bearer user-token")).toBe("user-token");
    expect(extractBearerToken(" Bearer user-token ")).toBe("user-token");
    expect(extractBearerToken("Basic user-token")).toBe("");
    expect(extractBearerToken(null)).toBe("");
  });

  test("matches only the exact service role token", () => {
    expect(isServiceRoleToken("service-role-token", "service-role-token")).toBe(true);
    expect(isServiceRoleToken("anon-token", "service-role-token")).toBe(false);
    expect(isServiceRoleToken("service-role-token", undefined)).toBe(false);
  });

  test("authorizes service role requests without user lookup", async () => {
    let getUserCalls = 0;

    const result = await authorizeSupabaseEdgeRequest({
      authHeader: "Bearer service-role-token",
      serviceRoleKey: "service-role-token",
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: null }, error: new Error("should not run") };
      },
    });

    expect(result).toEqual({ ok: true, actorKind: "service_role", userId: null });
    expect(getUserCalls).toBe(0);
  });

  test("authorizes user JWT requests through Supabase auth", async () => {
    const result = await authorizeSupabaseEdgeRequest({
      authHeader: "Bearer user-token",
      serviceRoleKey: "service-role-token",
      getUser: async (accessToken) => ({
        data: { user: accessToken === "user-token" ? { id: "user-1" } : null },
      }),
    });

    expect(result).toEqual({ ok: true, actorKind: "user", userId: "user-1" });
  });

  test("rejects missing and invalid tokens", async () => {
    const missing = await authorizeSupabaseEdgeRequest({
      authHeader: null,
      serviceRoleKey: "service-role-token",
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    });
    const invalid = await authorizeSupabaseEdgeRequest({
      authHeader: "Bearer anon-token",
      serviceRoleKey: "service-role-token",
      getUser: async () => ({ data: { user: null }, error: new Error("invalid") }),
    });

    expect(missing).toEqual({ ok: false, error: "Unauthorized" });
    expect(invalid).toEqual({ ok: false, error: "Unauthorized" });
  });
});
