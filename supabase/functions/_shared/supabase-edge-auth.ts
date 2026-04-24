export type SupabaseEdgeAuthResult =
  | { ok: true; actorKind: "user"; userId: string }
  | { ok: true; actorKind: "service_role"; userId: null }
  | { ok: false; error: "Unauthorized" };

type SupabaseUserResult = {
  data?: {
    user?: {
      id?: string;
    } | null;
  } | null;
  error?: unknown;
};

type GetUser = (accessToken: string) => Promise<SupabaseUserResult>;

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
  serviceRoleKey: string | undefined;
  getUser: GetUser;
}): Promise<SupabaseEdgeAuthResult> {
  const accessToken = extractBearerToken(args.authHeader);
  if (!accessToken) {
    return { ok: false, error: "Unauthorized" };
  }

  if (isServiceRoleToken(accessToken, args.serviceRoleKey)) {
    return { ok: true, actorKind: "service_role", userId: null };
  }

  const userResult = await args.getUser(accessToken);
  const userId = userResult.data?.user?.id;
  if (userResult.error || !userId) {
    return { ok: false, error: "Unauthorized" };
  }

  return { ok: true, actorKind: "user", userId };
}
