'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OnboardingDocument } from '@/lib/onboarding/state';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
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

// A document that stops receiving realtime progress for this long while still
// "processing" is treated as stuck (e.g. the edge function's isolate died before
// writing a terminal row), so the UI fails it instead of hanging on "Extracting
// text" forever. Reset every time the server reports progress for the doc.
export const STALE_PROCESSING_MS = 120_000;

export function useDocuments(brandId: string, seed: DocumentView[]): DocumentView[] {
  const [documents, setDocuments] = useState<DocumentView[]>(seed);
  // id -> last time the server reported anything about this document.
  const lastSeenRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const now = Date.now();
    for (const doc of seed) lastSeenRef.current[doc.id] = now;
    setDocuments(seed);
  }, [seed]);

  useEffect(() => {
    if (!brandId) return;
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`brand-documents-${brandId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'brand_profiles',
          table: 'brand_documents',
          filter: `brand_id=eq.${brandId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as RealtimeRow;
            lastSeenRef.current[updated.id] = Date.now();
            setDocuments((prev) =>
              prev.map((doc) => (doc.id === updated.id ? mergeRealtimeUpdate(doc, updated) : doc)),
            );
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as RealtimeRow;
            lastSeenRef.current[inserted.id] = Date.now();
            setDocuments((prev) => {
              if (prev.some((doc) => doc.id === inserted.id)) return prev;
              return [...prev, rowToView(inserted)];
            });
          } else if (payload.eventType === 'DELETE') {
            const removedId = (payload.old as { id?: string }).id;
            if (!removedId) return;
            setDocuments((prev) => prev.filter((doc) => doc.id !== removedId));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [brandId]);

  // Fail documents that have gone silent mid-processing so the row reaches a
  // terminal state even when no realtime "error" update ever arrives.
  const hasProcessing = documents.some((doc) => doc.status === 'processing' && !doc.archivedAt);
  useEffect(() => {
    if (!hasProcessing) return;
    const id = setInterval(() => {
      const now = Date.now();
      setDocuments((prev) => {
        let changed = false;
        const next = prev.map((doc) => {
          if (doc.status !== 'processing') return doc;
          // A document archived mid-ingest is never going to finish, and failing it
          // would leave a permanent red error badge sitting in the Archived tab.
          if (doc.archivedAt) return doc;
          const lastSeen = lastSeenRef.current[doc.id] ?? Date.parse(doc.createdAt);
          if (Number.isNaN(lastSeen) || now - lastSeen < STALE_PROCESSING_MS) return doc;
          changed = true;
          return {
            ...doc,
            status: 'error' as const,
            progressStep: 'error' as const,
            errorMessage:
              doc.errorMessage ?? 'Processing timed out. Please try uploading the document again.',
          };
        });
        return changed ? next : prev;
      });
    }, 20_000);
    return () => clearInterval(id);
  }, [hasProcessing]);

  return useMemo(() => documents, [documents]);
}
