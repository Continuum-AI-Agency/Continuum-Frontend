import { toDocumentCategory, toDocumentRetention } from '@continuum/contracts';
import type { OnboardingDocument } from '@/lib/onboarding/state';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const DOCUMENT_SOURCES = new Set<OnboardingDocument['source']>([
  'upload',
  'canva',
  'figma',
  'google-drive',
  'sharepoint',
  'notion',
  'website',
]);

function normalizeDocumentStatus(status: string | null): OnboardingDocument['status'] {
  if (status === 'ready' || status === 'error') {
    return status;
  }
  return 'processing';
}

function normalizeDocumentSource(source: string | null): OnboardingDocument['source'] {
  if (source && DOCUMENT_SOURCES.has(source as OnboardingDocument['source'])) {
    return source as OnboardingDocument['source'];
  }
  return 'upload';
}

type BrandDocumentRow = {
  id: string;
  name: string | null;
  display_name: string | null;
  source: string | null;
  category: string | null;
  status: string | null;
  size: number | null;
  storage_path: string | null;
  external_url: string | null;
  error_message: string | null;
  created_at: string;
  retention: string | null;
  expires_at: string | null;
  archived_at: string | null;
  version: number | null;
};

export async function fetchBrandDocuments(brandId: string): Promise<OnboardingDocument[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('brand_documents')
    .select(
      'id, name, display_name, source, category, status, size, storage_path, external_url, error_message, created_at, retention, expires_at, archived_at, version',
    )
    .eq('brand_id', brandId)
    // Deliberately UNFILTERED. The settings Knowledge page owns the Active /
    // Temporary / Archived split client-side (filterDocumentsByScope), so archived and
    // ephemeral rows have to reach it. Every AGENT-facing reader filters at the query,
    // which is where it matters.
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`[brandDocuments] Failed to fetch documents for brand ${brandId}`, error);
    return [];
  }

  return ((data ?? []) as BrandDocumentRow[]).map((row) => {
    const document: OnboardingDocument = {
      id: row.id,
      // display_name is the user-editable label; fall back to the stored filename for
      // rows written before the rename feature existed.
      name: row.display_name?.trim() || (row.name?.trim() ? row.name : 'Document'),
      source: normalizeDocumentSource(row.source),
      category: toDocumentCategory(row.category),
      retention: toDocumentRetention(row.retention),
      createdAt: row.created_at,
      status: normalizeDocumentStatus(row.status),
    };

    if (row.expires_at) {
      document.expiresAt = row.expires_at;
    }
    if (row.archived_at) {
      document.archivedAt = row.archived_at;
    }
    if (typeof row.version === 'number' && row.version > 0) {
      document.version = row.version;
    }

    if (typeof row.size === 'number' && Number.isFinite(row.size) && row.size >= 0) {
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
