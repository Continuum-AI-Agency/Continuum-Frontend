import "server-only";

import { mapDashboardResponse } from "@/lib/competitors/backend";
import { assertOk } from "@/lib/api/errors";
import { mapSavedCompetitor } from "@/lib/competitors/backend";
import type { CompetitorDashboard, CompetitorSavedProfile } from "@/lib/schemas/competitors";

function resolveCompetitorsBaseUrl(): string {
  const isBrowser = typeof window !== "undefined";

  const serverCandidate =
    process.env.COMPETITORS_API_URL ??
    process.env.COMPETITORS_API_BASE_URL ??
    process.env.NEXT_PUBLIC_COMPETITORS_API_URL ??
    process.env.NEXT_PUBLIC_COMPETITORS_API_BASE_URL;

  const clientCandidate =
    process.env.NEXT_PUBLIC_COMPETITORS_API_URL ??
    process.env.NEXT_PUBLIC_COMPETITORS_API_BASE_URL ??
    process.env.COMPETITORS_API_URL ??
    process.env.COMPETITORS_API_BASE_URL;

  const fallback = "https://api.beparsed.com/api/competitors";
  const base = isBrowser ? clientCandidate ?? serverCandidate : serverCandidate ?? clientCandidate;
  return (base && base.trim().length > 0 ? base : fallback).replace(/\/$/, "");
}

async function request<TResponse = unknown>(path: string, init?: RequestInit): Promise<TResponse> {
  const baseUrl = resolveCompetitorsBaseUrl();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: init?.cache ?? "no-store",
  });

  await assertOk(response);

  if (response.status === 204) {
    return undefined as unknown as TResponse;
  }

  return (await response.json()) as TResponse;
}

export async function fetchCompetitorDashboard(
  username: string,
  options?: { force?: boolean }
): Promise<CompetitorDashboard> {
  const cleanUsername = username.replace(/^@/, "").trim();
  const query = options?.force ? "?force=true" : "";
  const payload = await request(`/${encodeURIComponent(cleanUsername)}/dashboard${query}`);
  return mapDashboardResponse(payload);
}

export async function invalidateCompetitorCache(username: string): Promise<void> {
  const cleanUsername = username.replace(/^@/, "").trim();
  await request(`/${encodeURIComponent(cleanUsername)}/refresh`, { method: "POST" });
}

export async function fetchSavedCompetitors(brandId: string): Promise<CompetitorSavedProfile[]> {
  const payload = await request<{ competitors?: unknown[] }>(`/?platform_account_id=${encodeURIComponent(brandId)}`);
  const list = payload?.competitors ?? (Array.isArray(payload) ? payload : []);
  return list.map((item) => mapSavedCompetitor(item as unknown));
}

export async function addSavedCompetitor(username: string, brandId: string): Promise<void> {
  const clean = username.replace(/^@/, "").trim();
  await request(`/add?platform_account_id=${encodeURIComponent(brandId)}`, {
    method: "POST",
    body: JSON.stringify({ username: clean }),
  });
}

export async function removeSavedCompetitor(username: string, brandId: string): Promise<void> {
  const clean = username.replace(/^@/, "").trim();
  await request(`/${encodeURIComponent(clean)}?platform_account_id=${encodeURIComponent(brandId)}`, {
    method: "DELETE",
  });
}
