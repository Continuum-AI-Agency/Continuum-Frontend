"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api/http";
import type { Competitor, TimelineEntry, AwarenessReportPayload } from "@continuum/contracts";

const BASE = "/api/competitor-ad-spy";

export interface TimelineParams {
  brandId: string;
  competitorId?: string;
  status?: "active" | "paused";
  limit?: number;
}

export interface SyncResult {
  brandId: string;
  ranAt: string;
  results: Array<{ competitorId: string; fetched: number; inserted: number; updated: number }>;
  errors: Array<{ competitorId: string; error: string }>;
}

// --- raw client calls -------------------------------------------------------

export async function listCompetitors(brandId: string): Promise<Competitor[]> {
  const res = await request<{ competitors: Competitor[] }>({
    path: `${BASE}/competitors?brandId=${encodeURIComponent(brandId)}`,
  });
  return res.competitors;
}

export async function fetchTimeline(params: TimelineParams): Promise<TimelineEntry[]> {
  const qs = new URLSearchParams({ brandId: params.brandId });
  if (params.competitorId) qs.set("competitorId", params.competitorId);
  if (params.status) qs.set("status", params.status);
  qs.set("limit", String(params.limit ?? 60));
  const res = await request<{ items: TimelineEntry[] }>({ path: `${BASE}/timeline?${qs.toString()}` });
  return res.items;
}

export async function fetchAwareness(brandId: string): Promise<AwarenessReportPayload | null> {
  const res = await request<{ report: AwarenessReportPayload | null }>({
    path: `${BASE}/awareness?brandId=${encodeURIComponent(brandId)}`,
  });
  return res.report;
}

export async function fetchCreativeSignedUrl(snapshotId: string): Promise<string | null> {
  try {
    const res = await request<{ signedUrl: string }>({ path: `${BASE}/media/${snapshotId}/creative` });
    return res.signedUrl ?? null;
  } catch {
    return null;
  }
}

export async function createCompetitor(input: {
  brandId: string;
  name: string;
  metaPageId?: string;
}): Promise<Competitor> {
  const res = await request<{ competitor: Competitor }>({
    path: `${BASE}/competitors`,
    method: "POST",
    body: input,
  });
  return res.competitor;
}

export async function deleteCompetitor(id: string): Promise<void> {
  await request({ path: `${BASE}/competitors/${id}`, method: "DELETE" });
}

export async function triggerSync(brandId: string, competitorIds?: string[]): Promise<SyncResult> {
  return request<SyncResult>({
    path: `${BASE}/sync`,
    method: "POST",
    body: { brandId, ...(competitorIds ? { competitorIds } : {}) },
  });
}

// --- React Query hooks ------------------------------------------------------

const keys = {
  competitors: (brandId: string) => ["competitor-spy", "competitors", brandId] as const,
  timeline: (p: TimelineParams) =>
    ["competitor-spy", "timeline", p.brandId, p.competitorId ?? null, p.status ?? null, p.limit ?? null] as const,
  awareness: (brandId: string) => ["competitor-spy", "awareness", brandId] as const,
  creative: (snapshotId: string) => ["competitor-spy", "creative", snapshotId] as const,
};

export function useCompetitors(brandId: string) {
  return useQuery({
    queryKey: keys.competitors(brandId),
    queryFn: () => listCompetitors(brandId),
    enabled: Boolean(brandId),
  });
}

export function useAdTimeline(params: TimelineParams) {
  return useQuery({
    queryKey: keys.timeline(params),
    queryFn: () => fetchTimeline(params),
    enabled: Boolean(params.brandId),
  });
}

export function useAwarenessReport(brandId: string) {
  return useQuery({
    queryKey: keys.awareness(brandId),
    queryFn: () => fetchAwareness(brandId),
    enabled: Boolean(brandId),
  });
}

export function useCreativeUrl(snapshotId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.creative(snapshotId),
    queryFn: () => fetchCreativeSignedUrl(snapshotId),
    enabled,
    staleTime: 30 * 60_000, // signed URLs live ~1h; refetch well before expiry
  });
}

export function useCreateCompetitor(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; metaPageId?: string }) => createCompetitor({ brandId, ...input }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.competitors(brandId) }),
  });
}

export function useDeleteCompetitor(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCompetitor(id),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.competitors(brandId) }),
  });
}

export function useCompetitorSync(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (competitorIds?: string[]) => triggerSync(brandId, competitorIds),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.competitors(brandId) });
      void qc.invalidateQueries({ queryKey: ["competitor-spy", "timeline", brandId] });
      void qc.invalidateQueries({ queryKey: keys.awareness(brandId) });
    },
  });
}
