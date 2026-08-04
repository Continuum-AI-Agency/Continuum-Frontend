import { z } from 'zod';

import type { BrandBookResponse } from './brand-book';
import {
  brandAudienceTokenSchema,
  brandColorTokenSchema,
  brandFontTokenSchema,
  brandImageryTokenSchema,
  brandPersonalityTokenSchema,
  brandVoiceTokenSchema,
} from './brand-md';
import { readinessAnalysisSchema } from './readiness';

const textEncoder = new TextEncoder();

const brandSystemSourceDocumentSchema = z.object({
  name: z.string(),
  category: z.string(),
  status: z.string(),
  createdAt: z.string(),
});

const brandSystemStrategySchema = z.object({
  positioning: z.string().nullable(),
  pillars: z.array(z.string()),
  tonalSignal: z.string().nullable(),
  audienceSummary: z.string().nullable(),
  audienceSegments: z.array(
    z.object({
      name: z.string(),
      jobToBeDone: z.string().nullable(),
    }),
  ),
  contentGuidelines: z.unknown().nullable(),
  guidelineSets: z.array(
    z.object({
      purpose: z.string().nullable(),
      status: z.string().nullable(),
      version: z.number().nullable(),
      notes: z.string().nullable(),
      sections: z.object({
        colors: z.unknown().optional(),
        logo: z.unknown().optional(),
        typography: z.unknown().optional(),
        stationery: z.unknown().optional(),
        styleDesign: z.unknown().optional(),
        verbalIdentity: z.unknown().optional(),
        tags: z.unknown().optional(),
      }),
    }),
  ),
});

export const brandSystemSnapshotV1Schema = z.object({
  schemaVersion: z.literal(1),
  brand: z.object({ name: z.string().min(1) }),
  identity: z.object({
    colors: z.array(brandColorTokenSchema),
    typography: z.array(brandFontTokenSchema),
    logo: z
      .object({
        file: z.string(),
        treatmentDefault: z.enum(['palette-only', 'logo']),
      })
      .nullable(),
    voice: brandVoiceTokenSchema.nullable(),
    personality: brandPersonalityTokenSchema.nullable(),
    imagery: brandImageryTokenSchema.nullable(),
    audience: brandAudienceTokenSchema.nullable(),
  }),
  strategy: brandSystemStrategySchema,
  assessment: z.object({ readiness: readinessAnalysisSchema.nullable() }),
  sources: z.object({ documents: z.array(brandSystemSourceDocumentSchema) }),
});
export type BrandSystemSnapshotV1 = z.infer<typeof brandSystemSnapshotV1Schema>;

export const brandSystemWarningSchema = z.object({
  code: z.enum(['logo_unavailable', 'brand_document_unavailable']),
  message: z.string(),
});
export type BrandSystemWarning = z.infer<typeof brandSystemWarningSchema>;

export const brandSystemManifestFileSchema = z.object({
  path: z.string(),
  mediaType: z.string(),
  role: z.enum(['tokens', 'knowledge', 'document', 'presentation', 'asset', 'readme']),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const brandSystemManifestV1Schema = z.object({
  format: z.literal('continuum-brand-system'),
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  brand: z.object({ name: z.string().min(1) }),
  source: z.object({
    provider: z.literal('continuum'),
    brandId: z.string(),
    brandBookRefreshedAt: z.string().nullable(),
    stale: z.boolean(),
  }),
  files: z.array(brandSystemManifestFileSchema),
  warnings: z.array(brandSystemWarningSchema),
});
export type BrandSystemManifestV1 = z.infer<typeof brandSystemManifestV1Schema>;

export type BrandSystemBinaryAsset = {
  bytes: Uint8Array;
  mediaType: string;
  extension: string;
};

export type BrandSystemExportFile = z.infer<typeof brandSystemManifestFileSchema> & {
  bytes: Uint8Array;
};

export type CompileBrandSystemInput = {
  brandBook: BrandBookResponse;
  brandName: string;
  exportedAt?: string;
  renderPdf: (
    snapshot: BrandSystemSnapshotV1,
    logo: BrandSystemBinaryAsset | null,
  ) => Promise<Uint8Array>;
  loadLogo?: (storagePath: string) => Promise<BrandSystemBinaryAsset | null>;
};

export type CompiledBrandSystem = {
  archiveFileName: string;
  pdfFileName: string;
  manifest: BrandSystemManifestV1;
  snapshot: BrandSystemSnapshotV1;
  files: BrandSystemExportFile[];
};

function jsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'brand';
}

function safeTokenName(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[.{}$]+/g, '-')
    .replace(/[^a-z0-9 _-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function hexToDtcgColor(hex: string): {
  colorSpace: 'srgb';
  components: [number, number, number];
  alpha: number;
  hex: string;
} {
  const compact = hex.slice(1);
  const expanded =
    compact.length === 3 || compact.length === 4
      ? [...compact].map((character) => `${character}${character}`).join('')
      : compact;
  const rgb = expanded.slice(0, 6);
  const alphaHex = expanded.length === 8 ? expanded.slice(6) : 'ff';
  const components = [0, 2, 4].map(
    (offset) => Number.parseInt(rgb.slice(offset, offset + 2), 16) / 255,
  ) as [number, number, number];
  return {
    colorSpace: 'srgb',
    components,
    alpha: Number.parseInt(alphaHex, 16) / 255,
    hex: `#${rgb}`,
  };
}

function renderDtcgTokens(snapshot: BrandSystemSnapshotV1): Record<string, unknown> {
  const colorNames = new Set<string>();
  const typefaceNames = new Set<string>();
  const color: Record<string, unknown> = {};
  const typeface: Record<string, unknown> = {};

  snapshot.identity.colors.forEach((token, index) => {
    const key = uniqueName(
      safeTokenName(token.role ?? token.name ?? '', `color-${index + 1}`),
      colorNames,
    );
    color[key] = {
      $type: 'color',
      ...(token.name ? { $description: token.name } : {}),
      $value: hexToDtcgColor(token.value),
    };
  });

  snapshot.identity.typography.forEach((token, index) => {
    const key = uniqueName(
      safeTokenName(token.role ?? token.family, `typeface-${index + 1}`),
      typefaceNames,
    );
    typeface[key] = {
      $type: 'fontFamily',
      ...(token.note ? { $description: token.note } : {}),
      $value: token.family,
    };
  });

  return {
    $schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
    brand: {
      $description: `${snapshot.brand.name} brand identity tokens exported by Continuum.`,
      ...(Object.keys(color).length > 0 ? { color } : {}),
      ...(Object.keys(typeface).length > 0 ? { typeface } : {}),
    },
  };
}

type PublicJson = null | boolean | number | string | PublicJson[] | { [key: string]: PublicJson };

const INTERNAL_GUIDELINE_FIELD = /(^|_)(id|path|url|uri|bucket|token|secret|api_key|email)(_|$)/u;

function publicGuidelineValue(value: unknown, depth = 0): PublicJson {
  if (depth >= 12 || value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value.map((item) => publicGuidelineValue(item, depth + 1));
  }
  if (typeof value !== 'object') return null;

  const result: Record<string, PublicJson> = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.replace(/([a-z])([A-Z])/gu, '$1_$2').toLowerCase();
    if (INTERNAL_GUIDELINE_FIELD.test(normalizedKey)) continue;
    result[key] = publicGuidelineValue(entry, depth + 1);
  }
  return result;
}

function buildGuidelineSets(brandBook: BrandBookResponse) {
  return (brandBook.assembled?.guidelines ?? []).map((guideline) => {
    const section = (key: string): PublicJson | undefined =>
      key in guideline ? publicGuidelineValue(guideline[key]) : undefined;
    return {
      purpose: guideline.purpose,
      status: guideline.status,
      version: guideline.version,
      notes: guideline.notes,
      sections: {
        ...(section('colors') !== undefined ? { colors: section('colors') } : {}),
        ...(section('logo') !== undefined ? { logo: section('logo') } : {}),
        ...(section('typography') !== undefined ? { typography: section('typography') } : {}),
        ...(section('stationery') !== undefined ? { stationery: section('stationery') } : {}),
        ...(section('style_design') !== undefined ? { styleDesign: section('style_design') } : {}),
        ...(section('verbal_identity') !== undefined
          ? { verbalIdentity: section('verbal_identity') }
          : {}),
        ...(section('tags') !== undefined ? { tags: section('tags') } : {}),
      },
    };
  });
}

function buildSnapshot(
  brandBook: BrandBookResponse,
  brandName: string,
  logoFile: string | null,
): BrandSystemSnapshotV1 {
  const tokens = brandBook.brand_tokens;
  const composite = brandBook.composite;
  const audience = composite?.structured.target_audience;
  const readiness = composite?.readiness ?? brandBook.assembled?.report?.readiness ?? null;

  return brandSystemSnapshotV1Schema.parse({
    schemaVersion: 1,
    brand: { name: brandName },
    identity: {
      colors: tokens?.colors ?? [],
      typography: tokens?.typography ?? [],
      logo:
        logoFile && tokens?.logo
          ? { file: logoFile, treatmentDefault: tokens.logo.treatment_default }
          : null,
      voice: tokens?.voice ?? null,
      personality: tokens?.personality ?? null,
      imagery: tokens?.imagery ?? null,
      audience: tokens?.audience ?? null,
    },
    strategy: {
      positioning: composite?.understanding.positioning_thesis ?? null,
      pillars: composite?.understanding.brand_pillars ?? [],
      tonalSignal: composite?.understanding.tonal_signal ?? null,
      audienceSummary: audience?.summary ?? null,
      audienceSegments: (audience?.segments ?? []).map((segment) => ({
        name: segment.name,
        jobToBeDone: segment.jtbd ?? null,
      })),
      contentGuidelines: composite?.structured.guidelines ?? null,
      guidelineSets: buildGuidelineSets(brandBook),
    },
    assessment: { readiness },
    sources: {
      documents: (brandBook.assembled?.documents ?? brandBook.documents).map((document) => ({
        name: document.name,
        category: document.category,
        status: document.status,
        createdAt: document.created_at,
      })),
    },
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function exportFile(
  path: string,
  mediaType: string,
  role: BrandSystemManifestFileSchema['role'],
  bytes: Uint8Array,
): Promise<BrandSystemExportFile> {
  return {
    path,
    mediaType,
    role,
    size: bytes.byteLength,
    sha256: await sha256(bytes),
    bytes,
  };
}

type BrandSystemManifestFileSchema = z.infer<typeof brandSystemManifestFileSchema>;

function readme(snapshot: BrandSystemSnapshotV1): string {
  return `# ${snapshot.brand.name} brand system\n\nThis package was exported from Continuum.\n\n- \`tokens.tokens.json\`: DTCG 2025.10 color and font-family tokens\n- \`brand.json\`: normalized brand identity, strategy, guideline sets, and source index\n- \`brand.md\`: authoritative editable brand document, when available\n- \`brand-book.pdf\`: human-readable brand book\n- \`assets/\`: explicitly included brand assets\n\nThe manifest is the authoritative inventory for this export. Uploaded source documents, private onboarding state, internal storage paths, and font binaries are not included.\n`;
}

export async function compileBrandSystem(
  input: CompileBrandSystemInput,
): Promise<CompiledBrandSystem> {
  if (!input.brandBook.present || input.brandBook.status !== 'ready') {
    throw new Error('brand_system_export_requires_ready_brand_book');
  }

  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const warnings: BrandSystemWarning[] = [];
  if (!input.brandBook.brand_md) {
    warnings.push({
      code: 'brand_document_unavailable',
      message: 'This Brand Book does not have an editable brand.md document yet.',
    });
  }
  const storagePath = input.brandBook.brand_tokens?.logo?.storage_path ?? null;
  let logo: BrandSystemBinaryAsset | null = null;
  let logoFile: string | null = null;

  if (storagePath) {
    try {
      logo = input.loadLogo ? await input.loadLogo(storagePath) : null;
      if (logo) {
        const extension = safeTokenName(logo.extension, 'bin');
        logoFile = `assets/logo.${extension}`;
      } else {
        warnings.push({
          code: 'logo_unavailable',
          message: 'The referenced logo could not be included in this export.',
        });
      }
    } catch {
      warnings.push({
        code: 'logo_unavailable',
        message: 'The referenced logo could not be included in this export.',
      });
    }
  }

  const snapshot = buildSnapshot(input.brandBook, input.brandName, logoFile);
  const datedSlug = `${slugify(input.brandName)}-brand-system-${exportedAt.slice(0, 10)}`;
  const files = await Promise.all([
    exportFile(
      'tokens.tokens.json',
      'application/design-tokens+json',
      'tokens',
      jsonBytes(renderDtcgTokens(snapshot)),
    ),
    exportFile('brand.json', 'application/json', 'knowledge', jsonBytes(snapshot)),
    exportFile('README.md', 'text/markdown', 'readme', textEncoder.encode(readme(snapshot))),
  ]);

  if (input.brandBook.brand_md) {
    files.push(
      await exportFile(
        'brand.md',
        'text/markdown',
        'document',
        textEncoder.encode(input.brandBook.brand_md),
      ),
    );
  }

  if (logo && logoFile) {
    files.push(await exportFile(logoFile, logo.mediaType, 'asset', logo.bytes));
  }

  const pdfBytes = await input.renderPdf(snapshot, logo);
  files.push(await exportFile('brand-book.pdf', 'application/pdf', 'presentation', pdfBytes));

  const manifest = brandSystemManifestV1Schema.parse({
    format: 'continuum-brand-system',
    schemaVersion: 1,
    exportedAt,
    brand: { name: input.brandName },
    source: {
      provider: 'continuum',
      brandId: input.brandBook.brand_id,
      brandBookRefreshedAt: input.brandBook.refreshed_at,
      stale: input.brandBook.stale,
    },
    files: files.map(({ bytes: _bytes, ...file }) => file),
    warnings,
  });
  files.unshift(
    await exportFile('manifest.json', 'application/json', 'knowledge', jsonBytes(manifest)),
  );

  return {
    archiveFileName: `${datedSlug}.zip`,
    pdfFileName: `${slugify(input.brandName)}-brand-book-${exportedAt.slice(0, 10)}.pdf`,
    manifest,
    snapshot,
    files,
  };
}
