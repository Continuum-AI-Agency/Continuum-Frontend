import { CACHE_TTL_MS } from "./types.ts";

type SupabaseLike = {
  schema: (schema: string) => {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => {
            gt: (column: string, value: string) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{
                data: Array<Record<string, unknown>> | null;
                error: unknown;
              }>;
            };
          };
        };
      };
      insert: (values: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
};

type AudienceDemographicEntry = {
  key: string;
  label: string;
  value: number;
  lat?: number;
  lng?: number;
  countryCode?: string;
};

type GeocodeResult = {
  lat: number;
  lng: number;
  countryCode?: string;
};

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountryCode(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function inferCountryCodeFromCityLabel(value: string) {
  const chunks = value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeCountryCode(chunks[index]);
    if (normalized) return normalized;
  }
  return null;
}

function buildCityGeocodeCacheKey(city: string, countryCode?: string | null) {
  return [
    "google_geocode",
    "city",
    normalizeToken(city),
    normalizeCountryCode(countryCode) ?? "global",
  ].join(":");
}

function parseCachedGeocode(payload: unknown): GeocodeResult | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Record<string, unknown>;
  const lat = typeof candidate.lat === "number" ? candidate.lat : Number(candidate.lat);
  const lng = typeof candidate.lng === "number" ? candidate.lng : Number(candidate.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const countryCode = normalizeCountryCode(typeof candidate.countryCode === "string" ? candidate.countryCode : undefined);
  return {
    lat,
    lng,
    countryCode: countryCode ?? undefined,
  };
}

async function readCityGeocodeCache(params: {
  supabase: SupabaseLike;
  keys: string[];
}) {
  const { supabase, keys } = params;
  if (keys.length === 0) return new Map<string, GeocodeResult>();

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("reporting_cache")
    .select("cache_key,payload,expires_at,fetched_at")
    .eq("provider", "google")
    .in("cache_key", keys)
    .gt("expires_at", new Date().toISOString())
    .order("fetched_at", { ascending: false });

  if (error || !data) {
    return new Map<string, GeocodeResult>();
  }

  const cache = new Map<string, GeocodeResult>();
  data.forEach((row) => {
    const key = typeof row.cache_key === "string" ? row.cache_key : null;
    if (!key || cache.has(key)) return;
    const parsed = parseCachedGeocode(row.payload);
    if (!parsed) return;
    cache.set(key, parsed);
  });

  return cache;
}

async function writeCityGeocodeCache(params: {
  supabase: SupabaseLike;
  cacheKey: string;
  integrationAccountId: string;
  externalAccountId: string;
  payload: GeocodeResult;
}) {
  const { supabase, cacheKey, integrationAccountId, externalAccountId, payload } = params;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
  await supabase
    .schema("brand_profiles")
    .from("reporting_cache")
    .insert({
      cache_key: cacheKey,
      provider: "google",
      scope_type: "organic_geocode_city",
      account_id: integrationAccountId,
      scope_id: externalAccountId,
      range_preset: "city_geocode",
      range_since: today,
      range_until: today,
      payload,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    });
}

async function geocodeCityWithGoogle(params: {
  apiKey: string;
  cityLabel: string;
  countryCode?: string | null;
}) {
  const { apiKey, cityLabel, countryCode } = params;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", cityLabel);
  url.searchParams.set("key", apiKey);
  const normalizedCountry = normalizeCountryCode(countryCode);
  if (normalizedCountry) {
    url.searchParams.set("components", `country:${normalizedCountry}`);
  }

  const response = await fetch(url.toString());
  if (!response.ok) return null;
  const json = await response.json() as Record<string, unknown>;
  if (json.status !== "OK") return null;

  const results = Array.isArray(json.results) ? json.results as Array<Record<string, unknown>> : [];
  const first = results[0];
  if (!first) return null;

  const geometry = first.geometry as Record<string, unknown> | undefined;
  const location = geometry?.location as Record<string, unknown> | undefined;
  const lat = typeof location?.lat === "number" ? location.lat : Number(location?.lat);
  const lng = typeof location?.lng === "number" ? location.lng : Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let resolvedCountryCode: string | undefined;
  const components = Array.isArray(first.address_components)
    ? first.address_components as Array<Record<string, unknown>>
    : [];
  for (const component of components) {
    const types = Array.isArray(component.types) ? component.types as Array<string> : [];
    if (!types.includes("country")) continue;
    const shortName = typeof component.short_name === "string" ? component.short_name : undefined;
    const normalized = normalizeCountryCode(shortName);
    if (normalized) {
      resolvedCountryCode = normalized;
      break;
    }
  }

  return {
    lat,
    lng,
    countryCode: resolvedCountryCode ?? normalizedCountry ?? undefined,
  } satisfies GeocodeResult;
}

function dedupeCountryCodes(values: Array<string | undefined | null>) {
  const deduped: string[] = [];
  values.forEach((value) => {
    const normalized = normalizeCountryCode(value);
    if (!normalized) return;
    if (!deduped.includes(normalized)) {
      deduped.push(normalized);
    }
  });
  return deduped;
}

export async function enrichCityDemographicsWithGoogleGeocoding(params: {
  supabase: SupabaseLike;
  integrationAccountId: string;
  externalAccountId: string;
  cityEntries: AudienceDemographicEntry[];
  countryEntries: AudienceDemographicEntry[];
  warnings: string[];
}) {
  const {
    supabase,
    integrationAccountId,
    externalAccountId,
    cityEntries,
    countryEntries,
    warnings,
  } = params;

  if (cityEntries.length === 0) return cityEntries;

  const apiKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY");
  if (!apiKey) {
    warnings.push("GOOGLE_GEOCODING_API_KEY is not configured; using fallback city coordinates.");
    return cityEntries;
  }

  const topCountryHints = dedupeCountryCodes(
    [...countryEntries]
      .sort((a, b) => b.value - a.value)
      .slice(0, 4)
      .map((entry) => entry.key)
  );

  const candidateKeys = new Set<string>();
  const perEntryHints = cityEntries.map((entry) => {
    const inferred = inferCountryCodeFromCityLabel(entry.label || entry.key);
    const entryCountry = normalizeCountryCode(entry.countryCode);
    const hints = dedupeCountryCodes([entryCountry, inferred, ...topCountryHints]);
    const cacheHints = [...hints, null];
    cacheHints.forEach((hint) => {
      candidateKeys.add(buildCityGeocodeCacheKey(entry.label || entry.key, hint));
    });
    return { hints, cacheHints };
  });

  const cache = await readCityGeocodeCache({
    supabase,
    keys: Array.from(candidateKeys),
  });

  const enriched: AudienceDemographicEntry[] = [];

  for (let index = 0; index < cityEntries.length; index += 1) {
    const entry = cityEntries[index];
    const { hints, cacheHints } = perEntryHints[index] ?? { hints: [], cacheHints: [null] };
    const label = entry.label || entry.key;

    let resolved: GeocodeResult | null = null;
    let resolvedKey: string | null = null;
    for (const hint of cacheHints) {
      const key = buildCityGeocodeCacheKey(label, hint);
      const cached = cache.get(key);
      if (!cached) continue;
      resolved = cached;
      resolvedKey = key;
      break;
    }

    if (!resolved) {
      const geocodeAttempts = dedupeCountryCodes([hints[0], topCountryHints[0]]);
      const attemptHints = [...geocodeAttempts, null];
      for (const hint of attemptHints) {
        try {
          const result = await geocodeCityWithGoogle({
            apiKey,
            cityLabel: label,
            countryCode: hint,
          });
          if (!result) continue;
          resolved = result;
          resolvedKey = buildCityGeocodeCacheKey(label, hint);
          cache.set(resolvedKey, result);
          await writeCityGeocodeCache({
            supabase,
            cacheKey: resolvedKey,
            integrationAccountId,
            externalAccountId,
            payload: result,
          });
          break;
        } catch {
          continue;
        }
      }
    }

    if (!resolved) {
      enriched.push(entry);
      continue;
    }

    enriched.push({
      ...entry,
      lat: resolved.lat,
      lng: resolved.lng,
      countryCode: resolved.countryCode ?? entry.countryCode,
    });

    if (resolvedKey && !cache.has(resolvedKey)) {
      cache.set(resolvedKey, resolved);
    }
  }

  const unresolved = enriched.filter((entry) => typeof entry.lat !== "number" || typeof entry.lng !== "number").length;
  if (unresolved > 0) {
    warnings.push(`Google geocoding unresolved for ${unresolved} city entries.`);
  }

  return enriched;
}
