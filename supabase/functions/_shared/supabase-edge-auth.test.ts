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

  test("authorizes opted-in service role requests without claims lookup", async () => {
    let getClaimsCalls = 0;

    const result = await authorizeSupabaseEdgeRequest({
      authHeader: "Bearer service-role-token",
      serviceRoleKey: "service-role-token",
      allowServiceRole: true,
      getClaims: async () => {
        getClaimsCalls += 1;
        return { data: { claims: null }, error: new Error("should not run") };
      },
    });

    expect(result).toEqual({ ok: true, actorKind: "service_role", userId: null });
    expect(getClaimsCalls).toBe(0);
  });

  test("authorizes user JWT requests through verified claims", async () => {
    const result = await authorizeSupabaseEdgeRequest({
      authHeader: "Bearer user-token",
      serviceRoleKey: "service-role-token",
      getClaims: async (accessToken) => ({
        data: { claims: accessToken === "user-token" ? { sub: "user-1" } : null },
      }),
    });

    expect(result).toEqual({
      ok: true,
      actorKind: "user",
      userId: "user-1",
      claims: { sub: "user-1" },
    });
  });

  test("rejects missing and invalid tokens", async () => {
    const missing = await authorizeSupabaseEdgeRequest({
      authHeader: null,
      serviceRoleKey: "service-role-token",
      getClaims: async () => ({ data: { claims: { sub: "user-1" } } }),
    });
    const invalid = await authorizeSupabaseEdgeRequest({
      authHeader: "Bearer anon-token",
      serviceRoleKey: "service-role-token",
      getClaims: async () => ({ data: { claims: null }, error: new Error("invalid") }),
    });

    expect(missing).toEqual({ ok: false, error: "Unauthorized" });
    expect(invalid).toEqual({ ok: false, error: "Unauthorized" });
  });
});
