export type SupabaseEdgeAuthResult =
  | { ok: true; actorKind: "user"; userId: string; claims: SupabaseJwtClaims }
  | { ok: true; actorKind: "service_role"; userId: null }
  | { ok: false; error: "Unauthorized" };

export type SupabaseJwtClaims = {
  sub?: string;
  role?: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

type SupabaseClaimsResult = {
  data?: {
    claims?: SupabaseJwtClaims | null;
  } | null;
  error?: unknown;
};

type GetClaims = (accessToken: string) => Promise<SupabaseClaimsResult>;

export function extractBearerToken(authHeader: string | null): string {
  const value = authHeader?.trim() ?? "";
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() : "";
}

export function isServiceRoleToken(accessToken: string, serviceRoleKey: string | undefined): boolean {
  const expected = serviceRoleKey?.trim() ?? "";
  return expected.length > 0 && accessToken === expected;
}

export async function authorizeSupabaseEdgeRequest(args: {
  authHeader: string | null;
  serviceRoleKey?: string | undefined;
  allowServiceRole?: boolean;
  getClaims: GetClaims;
}): Promise<SupabaseEdgeAuthResult> {
  const accessToken = extractBearerToken(args.authHeader);
  if (!accessToken) {
    return { ok: false, error: "Unauthorized" };
  }

  if (args.allowServiceRole && isServiceRoleToken(accessToken, args.serviceRoleKey)) {
    return { ok: true, actorKind: "service_role", userId: null };
  }

  const claimsResult = await args.getClaims(accessToken);
  const claims = claimsResult.data?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : "";
  if (claimsResult.error || !claims || !userId) {
    return { ok: false, error: "Unauthorized" };
  }

  return { ok: true, actorKind: "user", userId, claims };
}
