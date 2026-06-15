// Single source of truth for brand-document upload limits, shared by the client
// uploader (useDocumentMutations) and the server route (/api/onboarding/documents).
//
// Files are uploaded browser -> Supabase Storage directly (not through the Vercel
// route) to bypass the 4.5 MB Vercel Function request-body cap. The hard size gate
// therefore lives on the storage bucket (brand-docs file_size_limit, kept in sync
// with MAX_DOCUMENT_BYTES below); these helpers provide fast client feedback and a
// server-side metadata check.

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MiB; mirror in brand-docs bucket file_size_limit
export const MAX_DOCUMENT_MB = Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024);

const ACCEPTED_MIME_PREFIXES = ["text/", "image/"] as const;
const ACCEPTED_MIME_EXACT = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/json",
  "", // some browsers report no MIME for known document types; tolerated like the legacy route
]);

export function isAcceptedDocumentMime(mime: string): boolean {
  if (ACCEPTED_MIME_EXACT.has(mime)) return true;
  return ACCEPTED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export type DocumentUploadMetadata = {
  brandId: string;
  documentId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  source?: string;
  category?: string;
};

export type MetadataValidation =
  | { ok: true }
  | { ok: false; status: number; error: string };

// Validates the metadata posted after a direct browser upload. The storagePath
// prefix check is the security boundary: it confirms the recorded object lives
// under the caller's brand/document folder and cannot point elsewhere.
export function validateDocumentUploadMetadata(
  input: Partial<DocumentUploadMetadata>,
): MetadataValidation {
  if (!input.brandId || typeof input.brandId !== "string") {
    return { ok: false, status: 400, error: "Missing brand context" };
  }
  if (
    !input.documentId ||
    typeof input.documentId !== "string" ||
    input.documentId.includes("/") ||
    input.documentId.includes("..")
  ) {
    return { ok: false, status: 400, error: "Invalid document id" };
  }
  if (!input.storagePath || typeof input.storagePath !== "string") {
    return { ok: false, status: 400, error: "Missing storage path" };
  }
  if (!input.storagePath.startsWith(`${input.brandId}/${input.documentId}/`)) {
    return { ok: false, status: 400, error: "storagePath is outside the brand scope" };
  }
  if (typeof input.size !== "number" || !Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, status: 400, error: "Invalid file size" };
  }
  if (input.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, status: 413, error: `File exceeds ${MAX_DOCUMENT_MB} MB limit` };
  }
  if (typeof input.mimeType !== "string" || !isAcceptedDocumentMime(input.mimeType)) {
    return {
      ok: false,
      status: 415,
      error: `Unsupported file type: ${input.mimeType || "unknown"}`,
    };
  }
  return { ok: true };
}
