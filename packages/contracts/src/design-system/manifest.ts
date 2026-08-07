// The design system as one object, and the file format it round-trips through.
//
// `continuum-design-system` v1 is a sibling of `continuum-brand-system`
// (onboarding/brand-system.ts) and follows its shape on purpose: a manifest that is
// the authoritative inventory, per-file sha256, and a strict rule that internal
// identifiers never leave the building. The difference is that this one is also an
// IMPORT format. Export-only formats drift, because nothing ever proves they can be
// read back; making import and export share one manifest means the round-trip test
// is a real check on both.

import { z } from 'zod';
import { designConflictSchema } from './conflicts';
import { designRigorEvidenceSchema, designRigorTierSchema } from './rigor';
import { type DesignSystemSection, designSystemSectionSchema } from './sections';
import { designAdherenceSchema, designSystemFontSchema, designTokenSchema } from './tokens';

/** How a system entered the platform. Drives what the parser is allowed to assume. */
export const designSourceKindSchema = z.enum(['ds_export', 'dtcg', 'document', 'scrape', 'manual']);
export type DesignSourceKind = z.infer<typeof designSourceKindSchema>;

export const designSystemStatusSchema = z.enum(['parsing', 'ready', 'error']);
export type DesignSystemStatus = z.infer<typeof designSystemStatusSchema>;

export const designIngestStepSchema = z.enum([
  'uploading',
  'unpacking',
  'parsing',
  'extracting',
  'reconciling',
  'embedding',
  'ready',
  'error',
]);
export type DesignIngestStep = z.infer<typeof designIngestStepSchema>;

export const designIngestErrorCodeSchema = z.enum([
  'UNSUPPORTED_FORMAT',
  'ARCHIVE_UNREADABLE',
  'NO_TOKENS_FOUND',
  'STORAGE_FETCH_FAILED',
  'EXTRACT_FAILED',
  'EMBED_FAILED',
  'PERSIST_FAILED',
  'INTERNAL_ERROR',
]);
export type DesignIngestErrorCode = z.infer<typeof designIngestErrorCodeSchema>;

/**
 * The whole system, as generation and MCP read it.
 *
 * `brandName` is carried so an exported bundle is self-describing without a database
 * — the bundle is meant to be handed to a designer, another tool, or a Claude skill,
 * none of which can resolve a brand id.
 */
export const designSystemSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    brandName: z.string().min(1).max(240),
    sourceKind: designSourceKindSchema,
    rigor: z
      .object({
        tier: designRigorTierSchema,
        evidence: designRigorEvidenceSchema,
        /** Non-null when the brand overrode the computed tier. */
        override: designRigorTierSchema.nullable().default(null),
      })
      .strict(),
    tokens: z.array(designTokenSchema).max(600).default([]),
    fonts: z.array(designSystemFontSchema).max(24).default([]),
    adherence: designAdherenceSchema,
    sections: z.array(designSystemSectionSchema).max(24).default([]),
    conflicts: z.array(designConflictSchema).max(120).default([]),
  })
  .strict();
export type DesignSystemSnapshot = z.infer<typeof designSystemSnapshotSchema>;

/** The tier actually in force: an override if the brand set one, else the computed tier. */
export function effectiveRigorTier(
  snapshot: DesignSystemSnapshot,
): DesignSystemSnapshot['rigor']['tier'] {
  return snapshot.rigor.override ?? snapshot.rigor.tier;
}

/** Sections switched on AND carrying something to say. */
export function activeSections(snapshot: DesignSystemSnapshot): DesignSystemSection[] {
  return snapshot.sections.filter(
    (section) =>
      section.enabled &&
      (section.rules.length > 0 ||
        section.summary.length > 0 ||
        Object.keys(section.content).length > 0),
  );
}

export const designSystemManifestFileSchema = z
  .object({
    path: z.string().min(1).max(500),
    mediaType: z.string().min(1).max(120),
    role: z.enum(['manifest', 'tokens', 'adherence', 'section', 'exemplar', 'asset', 'readme']),
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type DesignSystemManifestFile = z.infer<typeof designSystemManifestFileSchema>;

export const designSystemManifestSchema = z
  .object({
    format: z.literal('continuum-design-system'),
    schemaVersion: z.literal(1),
    exportedAt: z.string(),
    brand: z.object({ name: z.string().min(1) }).strict(),
    source: z
      .object({
        provider: z.literal('continuum'),
        brandId: z.string(),
        designSystemId: z.string(),
        sourceKind: designSourceKindSchema,
        rigorTier: designRigorTierSchema,
      })
      .strict(),
    files: z.array(designSystemManifestFileSchema).max(600),
    warnings: z.array(z.string().max(400)).max(60).default([]),
  })
  .strict();
export type DesignSystemManifest = z.infer<typeof designSystemManifestSchema>;

/**
 * Fields that must never appear in an exported bundle.
 *
 * Same predicate `brand-system.ts` uses, restated here rather than imported so the
 * two formats cannot silently diverge if one is later relaxed — a bundle is handed to
 * third parties, and "we widened the other format's allowlist" is not a reason this
 * one should start leaking storage paths.
 */
const INTERNAL_KEY_RE = /(^|_)(id|path|url|uri|bucket|token|secret|api_key|email)(_|$)/u;

export function stripInternalKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripInternalKeys(item)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (INTERNAL_KEY_RE.test(key)) continue;
      out[key] = stripInternalKeys(nested);
    }
    return out as T;
  }
  return value;
}
