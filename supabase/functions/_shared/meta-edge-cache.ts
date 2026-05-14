import { cacheGet, cacheSet, TTL_12H } from "./upstash-cache.ts";

const META_EDGE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type SupabaseLike = {
  schema: (schema: string) => {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          gt: (column: string, value: string) => {
            order: (column: string, options: { ascending: boolean }) => {
              limit: (value: number) => {
                maybeSingle: () => Promise<{
                  data: { payload?: unknown; expires_at?: string } | null;
                  error: unknown;
                }>;
              };
            };
          };
        };
      };
      insert: (values: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
};

type CacheHitResult = {
  payload: unknown;
  expiresAt: string;
};

type ReadMetaEdgeCacheParams = {
  supabase: SupabaseLike;
  cacheKey: string;
  log?: (msg: string, extra?: unknown) => void;
};

type WriteMetaEdgeCacheParams = {
  supabase: SupabaseLike;
  cacheKey: string;
  accountId: string;
  scopeType: string;
  scopeId: string;
  rangePreset?: string;
  payload: unknown;
  log?: (msg: string, extra?: unknown) => void;
};

export function buildMetaEdgeCacheKey(args: {
  resource: "campaigns" | "adsets" | "ads";
  adAccountId: string;
  scopeId?: string;
}): string {
  const scope = args.scopeId ?? "all";
  return `meta-edge:${args.resource}:${args.adAccountId}:${scope}`;
}

export async function readMetaEdgeCache({
  supabase,
  cacheKey,
  log,
}: ReadMetaEdgeCacheParams): Promise<CacheHitResult | null> {
  const upstashHit = await cacheGet<{ payload: unknown; expiresAt: string }>(cacheKey);
  if (upstashHit?.payload) {
    log?.("cache HIT (upstash)");
    return upstashHit;
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("reporting_cache")
    .select("payload,expires_at")
    .eq("cache_key", cacheKey)
    .gt("expires_at", nowIso)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log?.("cache read failed", error);
    return null;
  }

  if (!data?.payload || !data.expires_at) {
    return null;
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const result = { payload: data.payload, expiresAt: data.expires_at };
  await cacheSet(cacheKey, result, TTL_12H);
  return result;
}

export async function writeMetaEdgeCache({
  supabase,
  cacheKey,
  accountId,
  scopeType,
  scopeId,
  rangePreset = "edge_1h",
  payload,
  log,
}: WriteMetaEdgeCacheParams): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + META_EDGE_CACHE_TTL_MS);
  const day = now.toISOString().slice(0, 10);

  const { error } = await supabase
    .schema("brand_profiles")
    .from("reporting_cache")
    .insert({
      cache_key: cacheKey,
      provider: "meta",
      scope_type: scopeType,
      account_id: accountId,
      scope_id: scopeId,
      range_preset: rangePreset,
      range_since: day,
      range_until: day,
      payload,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    });

  if (error) {
    log?.("cache write failed", error);
  } else {
    await cacheSet(cacheKey, { payload, expiresAt: expiresAt.toISOString() }, TTL_12H);
  }
}
