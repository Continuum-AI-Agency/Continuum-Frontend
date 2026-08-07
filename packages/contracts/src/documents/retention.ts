// Lifecycle of an uploaded brand document. Distinct from `category` (the document's
// PURPOSE) and `kind` (its file format): retention answers "is this curated brand
// knowledge, or a one-off a user dropped into a conversation?".
//
// Persisted on `brand_profiles.brand_documents.retention` (default "permanent").
//
// The rule the whole feature rests on, enforced in
// `public.match_brand_document_chunks` and mirrored in the direct-lookup path
// (Continuum-Backend/App/organic/data/documents.ts):
//
//   visible  <=>  archived_at IS NULL
//                 AND (retention = 'permanent'
//                      OR (not expired AND scope_key = the caller's session))
//
// It FAILS CLOSED — a caller that supplies no session scope sees only permanent
// documents, which is why every pre-existing reader stayed correct when this shipped.

import { z } from 'zod';

export const documentRetentionSchema = z.enum(['permanent', 'ephemeral']);
export type DocumentRetention = z.infer<typeof documentRetentionSchema>;

export const DOCUMENT_RETENTION_DEFAULT: DocumentRetention = 'permanent';

export const DOCUMENT_RETENTION_VALUES = documentRetentionSchema.options;

// How long a one-off chat/MCP upload survives before the lifecycle sweep archives it.
// Server-owned: `embed_document` computes expires_at from this constant and ignores
// any client-supplied TTL, because a client-controlled TTL is a client-controlled
// retention policy.
export const EPHEMERAL_DOCUMENT_TTL_DAYS = 14;

// Coerces an unknown/legacy value to a valid retention, falling back to the default.
// Mirrors toDocumentCategory — use at boundaries where the stored value may predate
// this enum (every row written before the retention migration is permanent).
export function toDocumentRetention(value: unknown): DocumentRetention {
  const parsed = documentRetentionSchema.safeParse(value);
  return parsed.success ? parsed.data : DOCUMENT_RETENTION_DEFAULT;
}

// Which slice of the library a settings surface is showing. Not persisted — this is a
// view concern derived from retention + archived_at + expires_at.
export const documentScopeSchema = z.enum(['active', 'temporary', 'archived']);
export type DocumentScope = z.infer<typeof documentScopeSchema>;

export const DOCUMENT_SCOPE_LABELS: Record<DocumentScope, string> = {
  active: 'Active',
  temporary: 'Temporary',
  archived: 'Archived',
};

// Renaming a document changes only its user-facing label. `name` stays the sanitized
// filename that storage_path was built from, so a rename can never invalidate a
// storage reference. One schema, used by both the client form resolver and the server
// action, so the two can never drift.
export const documentRenameSchema = z.object({
  displayName: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long'),
});
export type DocumentRenameInput = z.infer<typeof documentRenameSchema>;
