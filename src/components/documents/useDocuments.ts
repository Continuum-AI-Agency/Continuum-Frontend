"use client";

import { useEffect, useMemo, useState } from "react";
import type { OnboardingDocument } from "@/lib/onboarding/state";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DocumentView } from "./types";

type RealtimeRow = {
  id: string;
  brand_id: string;
  name: string;
  source: OnboardingDocument["source"];
  status?: "processing" | "ready" | "error";
  progress_step?: OnboardingDocument["progressStep"];
  progress_percent?: number | null;
  error_code?: OnboardingDocument["errorCode"] | null;
  error_message?: string | null;
  mime_type?: string | null;
  kind?: OnboardingDocument["kind"] | null;
  page_count?: number | null;
  text_excerpt?: string | null;
  preview_path?: string | null;
  storage_path?: string | null;
  external_url?: string | null;
  size?: number | null;
  created_at?: string;
};

function rowToView(row: RealtimeRow): DocumentView {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    createdAt: row.created_at ?? new Date().toISOString(),
    status: (row.status as OnboardingDocument["status"]) ?? "processing",
    progressStep: row.progress_step ?? undefined,
    progressPercent: typeof row.progress_percent === "number" ? row.progress_percent : undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    mimeType: row.mime_type ?? undefined,
    kind: row.kind ?? undefined,
    pageCount: typeof row.page_count === "number" ? row.page_count : undefined,
    textExcerpt: row.text_excerpt ?? undefined,
    previewPath: row.preview_path ?? undefined,
    storagePath: row.storage_path ?? undefined,
    externalUrl: row.external_url ?? undefined,
    size: typeof row.size === "number" ? row.size : undefined,
  };
}

function mergeRealtimeUpdate(existing: DocumentView, row: RealtimeRow): DocumentView {
  const next = rowToView(row);
  return { ...existing, ...next };
}

export function useDocuments(brandId: string, seed: DocumentView[]): DocumentView[] {
  const [documents, setDocuments] = useState<DocumentView[]>(seed);

  useEffect(() => {
    setDocuments(seed);
  }, [seed]);

  useEffect(() => {
    if (!brandId) return;
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`brand-documents-${brandId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "brand_profiles",
          table: "brand_documents",
          filter: `brand_id=eq.${brandId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as RealtimeRow;
            setDocuments((prev) =>
              prev.map((doc) => (doc.id === updated.id ? mergeRealtimeUpdate(doc, updated) : doc)),
            );
          } else if (payload.eventType === "INSERT") {
            const inserted = payload.new as RealtimeRow;
            setDocuments((prev) => {
              if (prev.some((doc) => doc.id === inserted.id)) return prev;
              return [...prev, rowToView(inserted)];
            });
          } else if (payload.eventType === "DELETE") {
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

  return useMemo(() => documents, [documents]);
}
