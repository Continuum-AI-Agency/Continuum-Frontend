'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OnboardingDocument } from '@/lib/onboarding/state';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import type { DocumentView } from './types';

type RealtimeRow = {
  id: string;
  brand_id: string;
  name: string;
  source: OnboardingDocument['source'];
  status?: 'processing' | 'ready' | 'error';
  category?: OnboardingDocument['category'] | null;
  progress_step?: OnboardingDocument['progressStep'];
  progress_percent?: number | null;
  error_code?: OnboardingDocument['errorCode'] | null;
  error_message?: string | null;
  mime_type?: string | null;
  kind?: OnboardingDocument['kind'] | null;
  page_count?: number | null;
  text_excerpt?: string | null;
  preview_path?: string | null;
  storage_path?: string | null;
  external_url?: string | null;
  size?: number | null;
  created_at?: string;
  // Every ingest step writes this (embed_document's writeProgress), so it is the
  // server's heartbeat for the row — the only evidence of when it was last alive.
  updated_at?: string | null;
  display_name?: string | null;
  retention?: OnboardingDocument['retention'] | null;
  expires_at?: string | null;
  archived_at?: string | null;
  version?: number | null;
};

function rowToView(row: RealtimeRow): DocumentView {
  return {
    id: row.id,
    // display_name is the user-editable label; fall back to the stored filename.
    name: row.display_name?.trim() || row.name,
    source: row.source,
    retention: row.retention ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    version: typeof row.version === 'number' ? row.version : undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    status: (row.status as OnboardingDocument['status']) ?? 'processing',
    category: row.category ?? undefined,
    progressStep: row.progress_step ?? undefined,
    progressPercent: typeof row.progress_percent === 'number' ? row.progress_percent : undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    mimeType: row.mime_type ?? undefined,
    kind: row.kind ?? undefined,
    pageCount: typeof row.page_count === 'number' ? row.page_count : undefined,
    textExcerpt: row.text_excerpt ?? undefined,
    previewPath: row.preview_path ?? undefined,
    storagePath: row.storage_path ?? undefined,
    externalUrl: row.external_url ?? undefined,
    size: typeof row.size === 'number' ? row.size : undefined,
  };
}

function mergeRealtimeUpdate(existing: DocumentView, row: RealtimeRow): DocumentView {
  const next = rowToView(row);
  return { ...existing, ...next };
}

// A document that stops receiving progress for this long while still "processing" is
// treated as stuck (e.g. the edge function's isolate died before writing a terminal
// row), so the UI fails it instead of hanging on "Extracting text" forever. Measured
// against the SERVER's last word about the row, not against when this tab happened to
// open — a document that died three months ago is stuck the moment you look at it.
export const STALE_PROCESSING_MS = 120_000;

export const PROCESSING_TIMEOUT_MESSAGE =
  'Processing timed out. Please try uploading the document again.';

/** When the server last said anything about this row. NaN when it never has. */
function lastServerBeat(row: RealtimeRow): number {
  return Date.parse(row.updated_at ?? row.created_at ?? '');
}

function isStuck(doc: DocumentView, lastSeen: number, now: number): boolean {
  if (doc.status !== 'processing') return false;
  // A document archived mid-ingest is never going to finish, and failing it would
  // leave a permanent red error badge sitting in the Archived tab.
  if (doc.archivedAt) return false;
  if (Number.isNaN(lastSeen)) return false;
  return now - lastSeen >= STALE_PROCESSING_MS;
}

function asTimedOut(doc: DocumentView): DocumentView {
  return {
    ...doc,
    status: 'error',
    progressStep: 'error',
    errorMessage: doc.errorMessage ?? PROCESSING_TIMEOUT_MESSAGE,
  };
}

/**
 * Write the verdict back to the row.
 *
 * The watchdog has always been able to SEE a dead ingest and has always kept it to
 * itself, so the row stayed `processing` in the database forever — two have been stuck
 * since June 2026 — and every other reader, the agents included, went on believing it.
 * Guarded on `status = 'processing'` so a row that reached a real terminal state while
 * the read was in flight is never overwritten.
 */
async function persistTimedOut(ids: string[]): Promise<void> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .schema('brand_profiles')
      .from('brand_documents')
      .update({
        status: 'error',
        progress_step: 'error',
        progress_percent: null,
        error_message: PROCESSING_TIMEOUT_MESSAGE,
      })
      .in('id', ids)
      .eq('status', 'processing');
    if (error) throw error;
  } catch (err) {
    console.warn('Failed to record stuck documents as failed:', err);
  }
}

/**
 * Rows read from the table, reconciled against what realtime said while the read was
 * in flight. A row realtime has spoken about since the read went out is the newer
 * fact, and an INSERT that landed meanwhile is not in the result set at all.
 */
function mergeBackfill(
  current: DocumentView[],
  rows: DocumentView[],
  readStartedAt: number,
  lastSeen: Record<string, number>,
): DocumentView[] {
  const fetched = new Set(rows.map((row) => row.id));
  const currentById = new Map(current.map((doc) => [doc.id, doc]));
  const isNewerThanRead = (id: string) => (lastSeen[id] ?? 0) > readStartedAt;

  const merged = rows.map((row) => {
    const live = currentById.get(row.id);
    return live && isNewerThanRead(row.id) ? live : row;
  });
  for (const doc of current) {
    if (!fetched.has(doc.id) && isNewerThanRead(doc.id)) merged.push(doc);
  }
  return merged;
}

export type DocumentsHandle = {
  documents: DocumentView[];
  /**
   * True until the first read of `brand_documents` settles. Before that, a document
   * missing from `documents` only means "not read yet" — which is not the same fact as
   * "this document is processing", and telling them apart is the whole point.
   */
  loading: boolean;
};

export function useDocuments(brandId: string, seed: DocumentView[]): DocumentsHandle {
  const [documents, setDocuments] = useState<DocumentView[]>(seed);
  const [loading, setLoading] = useState<boolean>(() => Boolean(brandId));
  // id -> last time the SERVER reported anything about this document.
  const lastSeenRef = useRef<Record<string, number>>({});
  // Read-only mirror, so the watchdog can decide from the current list without
  // re-arming its interval every time a row updates.
  const documentsRef = useRef<DocumentView[]>(documents);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    for (const doc of seed) {
      // A seed is a snapshot of rows written at an unknown time. Dating it "now" — as
      // this did — is what let a document that died months ago read as processing.
      // Never claim more recent evidence of life than realtime has already given us.
      const created = Date.parse(doc.createdAt);
      lastSeenRef.current[doc.id] = Math.max(lastSeenRef.current[doc.id] ?? 0, created);
    }
    setDocuments(seed);
  }, [seed]);

  useEffect(() => {
    if (!brandId) {
      setLoading(false);
      return;
    }

    const table = { schema: 'brand_profiles', table: 'brand_documents' } as const;
    const filter = `brand_id=eq.${brandId}`;

    const unsubscribe = subscribeToPostgresChanges({
      label: `brand-documents-${brandId}`,
      bindings: [
        {
          ...table,
          filter,
          event: 'UPDATE',
          onRow: (row) => {
            const updated = row as RealtimeRow;
            lastSeenRef.current[updated.id] = Date.now();
            setDocuments((prev) =>
              prev.map((doc) => (doc.id === updated.id ? mergeRealtimeUpdate(doc, updated) : doc)),
            );
          },
        },
        {
          ...table,
          filter,
          event: 'INSERT',
          onRow: (row) => {
            const inserted = row as RealtimeRow;
            lastSeenRef.current[inserted.id] = Date.now();
            setDocuments((prev) => {
              if (prev.some((doc) => doc.id === inserted.id)) return prev;
              return [...prev, rowToView(inserted)];
            });
          },
        },
        {
          ...table,
          filter,
          event: 'DELETE',
          onRow: (row) => {
            const removedId = (row as { id?: string }).id;
            if (!removedId) return;
            setDocuments((prev) => prev.filter((doc) => doc.id !== removedId));
          },
        },
      ],
    });

    // Read the table. Realtime only carries what happens from now on, so without this
    // every document that reached its terminal state before mount was invisible and
    // fell open to "processing" forever. Fired unconditionally rather than from
    // onSubscribed: a socket that never connects must not also cost us the read.
    let cancelled = false;
    const readStartedAt = Date.now();
    setLoading(true);
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .schema('brand_profiles')
          .from('brand_documents')
          .select(
            'id, brand_id, name, display_name, source, status, category, progress_step, progress_percent, error_code, error_message, mime_type, kind, page_count, text_excerpt, preview_path, storage_path, external_url, size, created_at, updated_at, retention, expires_at, archived_at, version',
          )
          .eq('brand_id', brandId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        if (cancelled) return;

        const now = Date.now();
        const stuck: string[] = [];
        const views = ((data ?? []) as RealtimeRow[]).map((row) => {
          const beat = lastServerBeat(row);
          const lastSeen = Math.max(
            lastSeenRef.current[row.id] ?? 0,
            Number.isNaN(beat) ? 0 : beat,
          );
          lastSeenRef.current[row.id] = lastSeen;
          const view = rowToView(row);
          if (!isStuck(view, lastSeen, now)) return view;
          stuck.push(view.id);
          return asTimedOut(view);
        });

        setDocuments((prev) => mergeBackfill(prev, views, readStartedAt, lastSeenRef.current));
        if (stuck.length > 0) await persistTimedOut(stuck);
      } catch (err) {
        // Keep whatever the seed and realtime gave us rather than blanking the list.
        console.warn('Failed to read brand documents:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [brandId]);

  // Fail documents that go silent mid-processing so the row reaches a terminal state
  // even when no realtime "error" update ever arrives.
  const hasProcessing = documents.some((doc) => doc.status === 'processing' && !doc.archivedAt);
  useEffect(() => {
    if (!hasProcessing) return;
    const id = setInterval(() => {
      const now = Date.now();
      const stuck = documentsRef.current
        .filter((doc) =>
          isStuck(doc, lastSeenRef.current[doc.id] ?? Date.parse(doc.createdAt), now),
        )
        .map((doc) => doc.id);
      if (stuck.length === 0) return;
      const stuckIds = new Set(stuck);
      setDocuments((prev) =>
        prev.map((doc) =>
          stuckIds.has(doc.id) && doc.status === 'processing' ? asTimedOut(doc) : doc,
        ),
      );
      void persistTimedOut(stuck);
    }, 20_000);
    return () => clearInterval(id);
  }, [hasProcessing]);

  return useMemo(() => ({ documents, loading }), [documents, loading]);
}
