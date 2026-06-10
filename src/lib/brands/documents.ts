import { toDocumentCategory } from "@continuum/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OnboardingDocument } from "@/lib/onboarding/state";

const DOCUMENT_SOURCES = new Set<OnboardingDocument["source"]>([
  "upload",
  "canva",
  "figma",
  "google-drive",
  "sharepoint",
  "notion",
  "website",
]);

function normalizeDocumentStatus(status: string | null): OnboardingDocument["status"] {
  if (status === "ready" || status === "error") {
    return status;
  }
  return "processing";
}

function normalizeDocumentSource(source: string | null): OnboardingDocument["source"] {
  if (source && DOCUMENT_SOURCES.has(source as OnboardingDocument["source"])) {
    return source as OnboardingDocument["source"];
  }
  return "upload";
}

type BrandDocumentRow = {
  id: string;
  name: string | null;
  source: string | null;
  category: string | null;
  status: string | null;
  size: number | null;
  storage_path: string | null;
  external_url: string | null;
  error_message: string | null;
  created_at: string;
};

export async function fetchBrandDocuments(brandId: string): Promise<OnboardingDocument[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("brand_documents")
    .select(
      "id, name, source, category, status, size, storage_path, external_url, error_message, created_at",
    )
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`[brandDocuments] Failed to fetch documents for brand ${brandId}`, error);
    return [];
  }

  return ((data ?? []) as BrandDocumentRow[]).map((row) => {
    const document: OnboardingDocument = {
      id: row.id,
      name: row.name?.trim() ? row.name : "Document",
      source: normalizeDocumentSource(row.source),
      category: toDocumentCategory(row.category),
      createdAt: row.created_at,
      status: normalizeDocumentStatus(row.status),
    };

    if (typeof row.size === "number" && Number.isFinite(row.size) && row.size >= 0) {
      document.size = row.size;
    }
    if (row.storage_path) {
      document.storagePath = row.storage_path;
    }
    if (row.external_url) {
      document.externalUrl = row.external_url;
    }
    if (row.error_message?.trim()) {
      document.errorMessage = row.error_message.trim();
    }

    return document;
  });
}
