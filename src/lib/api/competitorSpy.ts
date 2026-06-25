"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api/http";
import type {
  Competitor,
  TimelineEntry,
  AwarenessReportPayload,
  MetaPageSearchResult,
  InstagramCompetitorSearchResult,
  CompetitorSearchResult,
  CompetitorSmartSearchResult,
  MetaPageResolutionCandidate,
  MetaPageResolution,
  CompetitorOrganicPost,
  SavedBoard,
  SavedItem,
  SaveItemRequest,
} from "@continuum/contracts";

const BASE = "/api/competitor-ad-spy";

export interface TimelineParams {
  brandId: string;
  competitorId?: string;
  status?: "active" | "paused";
  q?: string;
  limit?: number;
  sort?: "first_seen_at" | "last_seen_at";
  dir?: "asc" | "desc";
}

export interface SyncResult {
  brandId: string;
  ranAt: string;
  results: Array<{ competitorId: string; fetched: number; inserted: number; updated: number; skippedReason?: string }>;
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
  if (params.q) qs.set("q", params.q);
  if (params.sort) qs.set("sort", params.sort);
  if (params.dir) qs.set("dir", params.dir);
  qs.set("limit", String(params.limit ?? 60));
  const res = await request<{ items: TimelineEntry[] }>({ path: `${BASE}/timeline?${qs.toString()}` });
  return res.items;
}

export async function fetchInstagramPosts(params: {
  brandId: string;
  competitorId?: string;
  limit?: number;
}): Promise<CompetitorOrganicPost[]> {
  const qs = new URLSearchParams({ brandId: params.brandId });
  if (params.competitorId) qs.set("competitorId", params.competitorId);
  qs.set("limit", String(params.limit ?? 12));
  const res = await request<{ items: CompetitorOrganicPost[] }>({
    path: `${BASE}/instagram/posts?${qs.toString()}`,
  });
  return res.items;
}

export async function searchMetaPages(brandId: string, q: string): Promise<MetaPageSearchResult[]> {
  const qs = new URLSearchParams({ brandId, q });
  const res = await request<{ pages: MetaPageSearchResult[] }>({ path: `${BASE}/pages/search?${qs.toString()}` });
  return res.pages;
}

export async function searchInstagramCompetitors(
  brandId: string,
  q: string,
): Promise<InstagramCompetitorSearchResult> {
  const qs = new URLSearchParams({ brandId, q });
  return request<InstagramCompetitorSearchResult>({ path: `${BASE}/instagram/search?${qs.toString()}` });
}

export async function searchCompetitors(
  brandId: string,
  q: string,
): Promise<CompetitorSearchResult> {
  const qs = new URLSearchParams({ brandId, q });
  return request<CompetitorSearchResult>({ path: `${BASE}/competitors/search?${qs.toString()}` });
}

export async function smartSearch(brandId: string, q: string): Promise<CompetitorSmartSearchResult> {
  const qs = new URLSearchParams({ brandId, q });
  return request<CompetitorSmartSearchResult>({ path: `${BASE}/search?${qs.toString()}` });
}

export async function fetchAdCounts(brandId: string): Promise<Record<string, number>> {
  const res = await request<{ counts: Record<string, number> }>({
    path: `${BASE}/competitors/counts?brandId=${encodeURIComponent(brandId)}`,
  });
  return res.counts;
}

export async function listBoards(brandId: string): Promise<SavedBoard[]> {
  const res = await request<{ boards: SavedBoard[] }>({
    path: `${BASE}/boards?brandId=${encodeURIComponent(brandId)}`,
  });
  return res.boards;
}

export async function createBoard(input: {
  brandId: string;
  name: string;
  description?: string;
}): Promise<SavedBoard> {
  const res = await request<{ board: SavedBoard }>({ path: `${BASE}/boards`, method: "POST", body: input });
  return res.board;
}

export async function deleteBoard(id: string): Promise<void> {
  await request({ path: `${BASE}/boards/${id}`, method: "DELETE" });
}

export async function listBoardItems(boardId: string): Promise<SavedItem[]> {
  const res = await request<{ items: SavedItem[] }>({ path: `${BASE}/boards/${boardId}/items` });
  return res.items;
}

export async function saveItemToBoard(boardId: string, body: SaveItemRequest): Promise<SavedItem> {
  const res = await request<{ item: SavedItem }>({
    path: `${BASE}/boards/${boardId}/items`,
    method: "POST",
    body,
  });
  return res.item;
}

export async function removeBoardItem(boardId: string, itemId: string): Promise<void> {
  await request({ path: `${BASE}/boards/${boardId}/items/${itemId}`, method: "DELETE" });
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
  metaPageName?: string;
  metaPageResolutionStatus?: "unresolved" | "resolving" | "resolved" | "needs_review" | "error";
  metaPageResolutionConfidence?: number;
  metaPageResolutionCandidates?: MetaPageResolutionCandidate[];
  instagramUsername?: string;
  instagramUserId?: string;
  instagramName?: string;
  instagramFollowersCount?: number;
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

export async function resolvePaidPage(id: string): Promise<{
  competitor: Competitor;
  resolution: MetaPageResolution;
}> {
  return request<{ competitor: Competitor; resolution: MetaPageResolution }>({
    path: `${BASE}/competitors/${id}/resolve-paid`,
    method: "POST",
  });
}

// --- React Query hooks ------------------------------------------------------

const keys = {
  competitors: (brandId: string) => ["competitor-spy", "competitors", brandId] as const,
  timeline: (p: TimelineParams) =>
    [
      "competitor-spy",
      "timeline",
      p.brandId,
      p.competitorId ?? null,
      p.status ?? null,
      p.q ?? null,
      p.sort ?? null,
      p.dir ?? null,
      p.limit ?? null,
    ] as const,
  awareness: (brandId: string) => ["competitor-spy", "awareness", brandId] as const,
  creative: (snapshotId: string) => ["competitor-spy", "creative", snapshotId] as const,
  pageSearch: (brandId: string, q: string) => ["competitor-spy", "page-search", brandId, q] as const,
  competitorSearch: (brandId: string, q: string) => ["competitor-spy", "competitor-search", brandId, q] as const,
  instagramSearch: (brandId: string, q: string) => ["competitor-spy", "instagram-search", brandId, q] as const,
  instagramPosts: (brandId: string, competitorId?: string, limit?: number) =>
    ["competitor-spy", "instagram-posts", brandId, competitorId ?? null, limit ?? null] as const,
  smartSearch: (brandId: string, q: string) => ["competitor-spy", "smart-search", brandId, q] as const,
  adCounts: (brandId: string) => ["competitor-spy", "ad-counts", brandId] as const,
  boards: (brandId: string) => ["competitor-spy", "boards", brandId] as const,
  boardItems: (boardId: string) => ["competitor-spy", "board-items", boardId] as const,
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

export function useInstagramPosts(params: { brandId: string; competitorId?: string; limit?: number }) {
  return useQuery({
    queryKey: keys.instagramPosts(params.brandId, params.competitorId, params.limit),
    queryFn: () => fetchInstagramPosts(params),
    enabled: Boolean(params.brandId),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

// Meta Page autocomplete for the competitor tagger. Caller debounces `q`; the
// query only fires for terms of length >= 2.
export function useMetaPageSearch(brandId: string, q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: keys.pageSearch(brandId, term),
    queryFn: () => searchMetaPages(brandId, term),
    enabled: Boolean(brandId) && term.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function useInstagramCompetitorSearch(brandId: string, q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: keys.instagramSearch(brandId, term),
    queryFn: () => searchInstagramCompetitors(brandId, term),
    enabled: Boolean(brandId) && term.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useCompetitorSearch(brandId: string, q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: keys.competitorSearch(brandId, term),
    queryFn: () => searchCompetitors(brandId, term),
    enabled: Boolean(brandId) && term.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
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
    mutationFn: (input: {
      name: string;
      metaPageId?: string;
      metaPageName?: string;
      metaPageResolutionStatus?: "unresolved" | "resolving" | "resolved" | "needs_review" | "error";
      metaPageResolutionConfidence?: number;
      metaPageResolutionCandidates?: MetaPageResolutionCandidate[];
      instagramUsername?: string;
      instagramUserId?: string;
      instagramName?: string;
      instagramFollowersCount?: number;
    }) => createCompetitor({ brandId, ...input }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.competitors(brandId) });
      void qc.invalidateQueries({ queryKey: ["competitor-spy", "instagram-posts", brandId] });
    },
  });
}

export function useDeleteCompetitor(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCompetitor(id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.competitors(brandId) });
      void qc.invalidateQueries({ queryKey: ["competitor-spy", "instagram-posts", brandId] });
    },
  });
}

export function useResolvePaidPage(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resolvePaidPage(id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.competitors(brandId) });
      void qc.invalidateQueries({ queryKey: ["competitor-spy", "timeline", brandId] });
    },
  });
}

export function useCompetitorSync(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (competitorIds?: string[]) => triggerSync(brandId, competitorIds),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.competitors(brandId) });
      void qc.invalidateQueries({ queryKey: ["competitor-spy", "timeline", brandId] });
      void qc.invalidateQueries({ queryKey: ["competitor-spy", "instagram-posts", brandId] });
      void qc.invalidateQueries({ queryKey: keys.awareness(brandId) });
    },
  });
}

// --- Discovery smart search + per-brand ad counts ---------------------------

// Caller debounces `q`; the query only fires for terms of length >= 2.
export function useCompetitorSmartSearch(brandId: string, q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: keys.smartSearch(brandId, term),
    queryFn: () => smartSearch(brandId, term),
    enabled: Boolean(brandId) && term.length >= 2,
    staleTime: 60_000,
  });
}

export function useAdCounts(brandId: string) {
  return useQuery({
    queryKey: keys.adCounts(brandId),
    queryFn: () => fetchAdCounts(brandId),
    enabled: Boolean(brandId),
    staleTime: 5 * 60_000,
  });
}

// --- Saved boards (swipe file) ---------------------------------------------

export function useSavedBoards(brandId: string) {
  return useQuery({
    queryKey: keys.boards(brandId),
    queryFn: () => listBoards(brandId),
    enabled: Boolean(brandId),
  });
}

export function useBoardItems(boardId: string | undefined) {
  return useQuery({
    queryKey: keys.boardItems(boardId ?? ""),
    queryFn: () => listBoardItems(boardId as string),
    enabled: Boolean(boardId),
  });
}

export function useCreateBoard(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) => createBoard({ brandId, ...input }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.boards(brandId) });
    },
  });
}

export function useDeleteBoard(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBoard(id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.boards(brandId) });
    },
  });
}

export function useSaveItemToBoard(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { boardId: string; body: SaveItemRequest }) =>
      saveItemToBoard(vars.boardId, vars.body),
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: keys.boardItems(vars.boardId) });
      void qc.invalidateQueries({ queryKey: keys.boards(brandId) });
    },
  });
}

export function useRemoveBoardItem(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { boardId: string; itemId: string }) =>
      removeBoardItem(vars.boardId, vars.itemId),
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: keys.boardItems(vars.boardId) });
      void qc.invalidateQueries({ queryKey: keys.boards(brandId) });
    },
  });
}
