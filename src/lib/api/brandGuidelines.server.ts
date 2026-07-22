import {
  type BrandGuidelineDetail,
  type BrandGuidelineDraft,
  type BrandGuidelineStatus,
  type BrandGuidelineSummary,
  type BrandGuidelineTagsBySection,
  brandGuidelineApprovalSchema,
  brandGuidelineDraftSchema,
  brandGuidelineStatusSchema,
  brandGuidelineTagSectionSchema,
} from '@/lib/schemas/brandGuidelines';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const GUIDELINE_TABLE = 'brand_guidelines';
const TAG_TABLE = 'brand_guideline_tags';

const TAG_SECTION_ORDER = brandGuidelineTagSectionSchema.options;

type TagRow = {
  id?: string;
  guideline_id: string;
  section: string;
  label: string;
  description: string;
};

type GuidelineRow = {
  id: string;
  brand_id: string;
  purpose: string;
  notes: string | null;
  status: string;
  version: number;
  colors: unknown;
  logo: unknown;
  typography: unknown;
  stationery: unknown;
  style_design: unknown;
  verbal_identity: unknown;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

function normalizeTags(tags?: TagRow[]): BrandGuidelineTagsBySection {
  const grouped: BrandGuidelineTagsBySection = {
    logo: [],
    typography: [],
    stationery: [],
    style_design: [],
    verbal_identity: [],
  };

  tags?.forEach((tag) => {
    if (tag.section in grouped) {
      grouped[tag.section as keyof BrandGuidelineTagsBySection].push({
        id: tag.id,
        label: tag.label,
        description: tag.description,
      });
    }
  });

  return grouped;
}

function buildTagRows(
  guidelineId: string,
  tags: BrandGuidelineTagsBySection,
): Omit<TagRow, 'id'>[] {
  const rows: Omit<TagRow, 'id'>[] = [];

  TAG_SECTION_ORDER.forEach((section) => {
    const sectionTags = tags[section as keyof BrandGuidelineTagsBySection] ?? [];
    sectionTags.forEach((tag) => {
      rows.push({
        guideline_id: guidelineId,
        section,
        label: tag.label.trim(),
        description: tag.description.trim(),
      });
    });
  });

  return rows;
}

function mapGuidelineRow(row: GuidelineRow, tags: TagRow[] | null): BrandGuidelineDetail {
  const draft = brandGuidelineDraftSchema.parse({
    purpose: row.purpose,
    notes: row.notes ?? '',
    status: row.status,
    colors: row.colors ?? {},
    logo: row.logo ?? {},
    typography: row.typography ?? {},
    stationery: row.stationery ?? {},
    styleDesign: row.style_design ?? {},
    verbalIdentity: row.verbal_identity ?? {},
    tags: normalizeTags(tags ?? []),
  });

  return {
    id: row.id,
    brandId: row.brand_id,
    status: draft.status ?? 'draft',
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    ...draft,
  };
}

function stripEmpty(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function listBrandGuidelines(brandId: string): Promise<BrandGuidelineSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from(GUIDELINE_TABLE)
    .select('id, purpose, status, version, updated_at')
    .eq('brand_id', brandId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Unable to list brand guidelines: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    purpose: row.purpose,
    status: brandGuidelineStatusSchema.parse(row.status),
    version: row.version,
    updatedAt: row.updated_at,
  }));
}

export async function fetchBrandGuideline(
  brandId: string,
  guidelineId: string,
): Promise<BrandGuidelineDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from(GUIDELINE_TABLE)
    .select(
      'id, brand_id, purpose, notes, status, version, colors, logo, typography, stationery, style_design, verbal_identity, created_at, updated_at, approved_at',
    )
    .eq('brand_id', brandId)
    .eq('id', guidelineId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to fetch brand guideline: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const { data: tags, error: tagsError } = await supabase
    .schema('brand_profiles')
    .from(TAG_TABLE)
    .select('id, guideline_id, section, label, description')
    .eq('guideline_id', guidelineId)
    .order('created_at', { ascending: true });

  if (tagsError) {
    throw new Error(`Unable to fetch brand guideline tags: ${tagsError.message}`);
  }

  return mapGuidelineRow(data as GuidelineRow, (tags ?? []) as TagRow[]);
}

async function computeNextVersion(brandId: string, purpose: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from(GUIDELINE_TABLE)
    .select('version')
    .eq('brand_id', brandId)
    .eq('purpose', purpose)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to compute brand guideline version: ${error.message}`);
  }

  const current = data?.version ?? 0;
  return current + 1;
}

async function replaceGuidelineTags(
  guidelineId: string,
  tags: BrandGuidelineTagsBySection,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error: deleteError } = await supabase
    .schema('brand_profiles')
    .from(TAG_TABLE)
    .delete()
    .eq('guideline_id', guidelineId);

  if (deleteError) {
    throw new Error(`Unable to clear guideline tags: ${deleteError.message}`);
  }

  const rows = buildTagRows(guidelineId, tags);
  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .schema('brand_profiles')
    .from(TAG_TABLE)
    .insert(rows);

  if (insertError) {
    throw new Error(`Unable to save guideline tags: ${insertError.message}`);
  }
}

export async function createBrandGuideline(
  brandId: string,
  payload: BrandGuidelineDraft,
  statusOverride?: BrandGuidelineStatus,
): Promise<BrandGuidelineDetail> {
  const parsed = brandGuidelineDraftSchema.parse(payload);
  const status = statusOverride ?? parsed.status ?? 'draft';

  if (status === 'approved') {
    brandGuidelineApprovalSchema.parse(payload);
  }

  const supabase = await createSupabaseServerClient();
  const version = await computeNextVersion(brandId, parsed.purpose);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .schema('brand_profiles')
    .from(GUIDELINE_TABLE)
    .insert({
      brand_id: brandId,
      purpose: parsed.purpose.trim(),
      notes: stripEmpty(parsed.notes),
      status,
      version,
      colors: parsed.colors,
      logo: parsed.logo,
      typography: parsed.typography,
      stationery: parsed.stationery,
      style_design: parsed.styleDesign,
      verbal_identity: parsed.verbalIdentity,
      created_at: now,
      updated_at: now,
      approved_at: status === 'approved' ? now : null,
    })
    .select(
      'id, brand_id, purpose, notes, status, version, colors, logo, typography, stationery, style_design, verbal_identity, created_at, updated_at, approved_at',
    )
    .single();

  if (error) {
    throw new Error(`Unable to create brand guideline: ${error.message}`);
  }

  await replaceGuidelineTags(data.id, parsed.tags);
  return mapGuidelineRow(data as GuidelineRow, buildTagRows(data.id, parsed.tags) as TagRow[]);
}

export async function updateBrandGuideline(
  brandId: string,
  guidelineId: string,
  payload: BrandGuidelineDraft,
  statusOverride?: BrandGuidelineStatus,
): Promise<BrandGuidelineDetail> {
  const parsed = brandGuidelineDraftSchema.parse(payload);
  const status = statusOverride ?? parsed.status ?? 'draft';

  if (status === 'approved') {
    brandGuidelineApprovalSchema.parse(payload);
  }

  const now = new Date().toISOString();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from(GUIDELINE_TABLE)
    .update({
      purpose: parsed.purpose.trim(),
      notes: stripEmpty(parsed.notes),
      status,
      colors: parsed.colors,
      logo: parsed.logo,
      typography: parsed.typography,
      stationery: parsed.stationery,
      style_design: parsed.styleDesign,
      verbal_identity: parsed.verbalIdentity,
      updated_at: now,
      approved_at: status === 'approved' ? now : null,
    })
    .eq('brand_id', brandId)
    .eq('id', guidelineId)
    .select(
      'id, brand_id, purpose, notes, status, version, colors, logo, typography, stationery, style_design, verbal_identity, created_at, updated_at, approved_at',
    )
    .single();

  if (error) {
    throw new Error(`Unable to update brand guideline: ${error.message}`);
  }

  await replaceGuidelineTags(data.id, parsed.tags);
  return mapGuidelineRow(data as GuidelineRow, buildTagRows(data.id, parsed.tags) as TagRow[]);
}

export async function setBrandGuidelineStatus(
  brandId: string,
  guidelineId: string,
  status: BrandGuidelineStatus,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema('brand_profiles')
    .from(GUIDELINE_TABLE)
    .update({
      status,
      updated_at: now,
      approved_at: status === 'approved' ? now : null,
    })
    .eq('brand_id', brandId)
    .eq('id', guidelineId);

  if (error) {
    throw new Error(`Unable to update guideline status: ${error.message}`);
  }
}
