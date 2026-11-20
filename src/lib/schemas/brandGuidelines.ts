import type { useTranslations } from 'next-intl';
import { z } from 'zod';

type SchemaTranslate = ReturnType<typeof useTranslations<'scale'>>;

export const brandGuidelineStatusSchema = z.enum(['draft', 'review', 'approved', 'archived']);

export type BrandGuidelineStatus = z.infer<typeof brandGuidelineStatusSchema>;

export const brandGuidelineTagSectionSchema = z.enum([
  'logo',
  'typography',
  'stationery',
  'style_design',
  'verbal_identity',
]);

export type BrandGuidelineTagSection = z.infer<typeof brandGuidelineTagSectionSchema>;

export function createBrandGuidelineSchemas(translate?: SchemaTranslate) {
  const hexColorSchema = z
    .string()
    .regex(
      /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
      translate ? translate('schemaUi_0') : 'Use a valid hex color',
    );

  const brandGuidelineTagSchema = z.object({
    id: z.string().uuid().optional(),
    label: z.string().min(1, translate ? translate('schemaUi_1') : 'Tag label is required'),
    description: z
      .string()
      .min(1, translate ? translate('schemaUi_2') : 'Tag description is required'),
  });

  const brandGuidelineColorsSchema = z.object({
    primary: hexColorSchema,
    secondary: hexColorSchema,
    accent: hexColorSchema.optional().or(z.literal('')),
    neutral: hexColorSchema.optional().or(z.literal('')),
  });

  const brandGuidelineLogoSchema = z.object({
    usageGuidelines: z.string().optional().or(z.literal('')),
    clearSpace: z.string().optional().or(z.literal('')),
    misuse: z.string().optional().or(z.literal('')),
  });

  const brandGuidelineTypographySchema = z.object({
    headingFont: z.string().optional().or(z.literal('')),
    bodyFont: z.string().optional().or(z.literal('')),
    accentFont: z.string().optional().or(z.literal('')),
    usageGuidelines: z.string().optional().or(z.literal('')),
  });

  const brandGuidelineStationerySchema = z.object({
    overview: z.string().optional().or(z.literal('')),
    applications: z.string().optional().or(z.literal('')),
  });

  const brandGuidelineStyleDesignSchema = z.object({
    visualDirection: z.string().optional().or(z.literal('')),
    imageryGuidance: z.string().optional().or(z.literal('')),
  });

  const brandGuidelineVerbalIdentitySchema = z.object({
    audiencePersona: z.string().optional().or(z.literal('')),
    story: z.string().optional().or(z.literal('')),
    values: z.string().optional().or(z.literal('')),
    vision: z.string().optional().or(z.literal('')),
    mission: z.string().optional().or(z.literal('')),
    message: z.string().optional().or(z.literal('')),
    toneOfVoice: z.string().optional().or(z.literal('')),
    channelGuidelines: z.string().optional().or(z.literal('')),
  });

  const brandGuidelineTagsSchema = z.object({
    logo: z.array(brandGuidelineTagSchema).max(5),
    typography: z.array(brandGuidelineTagSchema).max(5),
    stationery: z.array(brandGuidelineTagSchema).max(5),
    style_design: z.array(brandGuidelineTagSchema).max(5),
    verbal_identity: z.array(brandGuidelineTagSchema).max(5),
  });

  const brandGuidelineDraftSchema = z.object({
    purpose: z.string().min(2, translate ? translate('schemaUi_3') : 'Purpose is required'),
    notes: z.string().optional().or(z.literal('')),
    status: brandGuidelineStatusSchema.optional(),
    colors: brandGuidelineColorsSchema,
    logo: brandGuidelineLogoSchema,
    typography: brandGuidelineTypographySchema,
    stationery: brandGuidelineStationerySchema,
    styleDesign: brandGuidelineStyleDesignSchema,
    verbalIdentity: brandGuidelineVerbalIdentitySchema,
    tags: brandGuidelineTagsSchema,
  });

  const brandGuidelineApprovalSchema = brandGuidelineDraftSchema.extend({
    logo: brandGuidelineLogoSchema.extend({
      usageGuidelines: z
        .string()
        .min(1, translate ? translate('schemaUi_4') : 'Logo usage guidelines are required'),
      clearSpace: z
        .string()
        .min(1, translate ? translate('schemaUi_5') : 'Logo clear space guidance is required'),
    }),
    typography: brandGuidelineTypographySchema.extend({
      headingFont: z
        .string()
        .min(1, translate ? translate('schemaUi_6') : 'Heading font is required'),
      bodyFont: z.string().min(1, translate ? translate('schemaUi_7') : 'Body font is required'),
    }),
    stationery: brandGuidelineStationerySchema.extend({
      overview: z
        .string()
        .min(1, translate ? translate('schemaUi_8') : 'Stationery overview is required'),
    }),
    styleDesign: brandGuidelineStyleDesignSchema.extend({
      visualDirection: z
        .string()
        .min(1, translate ? translate('schemaUi_9') : 'Style design direction is required'),
    }),
    verbalIdentity: brandGuidelineVerbalIdentitySchema.extend({
      audiencePersona: z
        .string()
        .min(1, translate ? translate('schemaUi_10') : 'Audience persona is required'),
      story: z.string().min(1, translate ? translate('schemaUi_11') : 'Brand story is required'),
      values: z.string().min(1, translate ? translate('schemaUi_12') : 'Values are required'),
      vision: z.string().min(1, translate ? translate('schemaUi_13') : 'Vision is required'),
      mission: z.string().min(1, translate ? translate('schemaUi_14') : 'Mission is required'),
      message: z.string().min(1, translate ? translate('schemaUi_15') : 'Core message is required'),
      toneOfVoice: z
        .string()
        .min(1, translate ? translate('schemaUi_16') : 'Tone of voice is required'),
      channelGuidelines: z
        .string()
        .min(1, translate ? translate('schemaUi_17') : 'Channel guidelines are required'),
    }),
    tags: z.object({
      logo: z.array(brandGuidelineTagSchema).min(3).max(5),
      typography: z.array(brandGuidelineTagSchema).min(3).max(5),
      stationery: z.array(brandGuidelineTagSchema).min(3).max(5),
      style_design: z.array(brandGuidelineTagSchema).min(3).max(5),
      verbal_identity: z.array(brandGuidelineTagSchema).min(3).max(5),
    }),
  });

  return {
    brandGuidelineTagSchema,
    brandGuidelineColorsSchema,
    brandGuidelineLogoSchema,
    brandGuidelineTypographySchema,
    brandGuidelineStationerySchema,
    brandGuidelineStyleDesignSchema,
    brandGuidelineVerbalIdentitySchema,
    brandGuidelineTagsSchema,
    brandGuidelineDraftSchema,
    brandGuidelineApprovalSchema,
  };
}
export const {
  brandGuidelineTagSchema,
  brandGuidelineColorsSchema,
  brandGuidelineLogoSchema,
  brandGuidelineTypographySchema,
  brandGuidelineStationerySchema,
  brandGuidelineStyleDesignSchema,
  brandGuidelineVerbalIdentitySchema,
  brandGuidelineTagsSchema,
  brandGuidelineDraftSchema,
  brandGuidelineApprovalSchema,
} = createBrandGuidelineSchemas();
export type BrandGuidelineTag = z.infer<typeof brandGuidelineTagSchema>;
export type BrandGuidelineTagsBySection = z.infer<typeof brandGuidelineTagsSchema>;
export type BrandGuidelineDraft = z.infer<typeof brandGuidelineDraftSchema>;
export type BrandGuidelineApproval = z.infer<typeof brandGuidelineApprovalSchema>;
export type BrandGuidelineSummary = {
  id: string;
  purpose: string;
  status: BrandGuidelineStatus;
  version: number;
  updatedAt: string;
};

export type BrandGuidelineDetail = BrandGuidelineDraft & {
  id: string;
  brandId: string;
  status: BrandGuidelineStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
};

export const EMPTY_BRAND_GUIDELINE_FORM: BrandGuidelineDraft = {
  purpose: '',
  notes: '',
  status: 'draft',
  colors: {
    primary: '#000000',
    secondary: '#FFFFFF',
    accent: '',
    neutral: '',
  },
  logo: {
    usageGuidelines: '',
    clearSpace: '',
    misuse: '',
  },
  typography: {
    headingFont: '',
    bodyFont: '',
    accentFont: '',
    usageGuidelines: '',
  },
  stationery: {
    overview: '',
    applications: '',
  },
  styleDesign: {
    visualDirection: '',
    imageryGuidance: '',
  },
  verbalIdentity: {
    audiencePersona: '',
    story: '',
    values: '',
    vision: '',
    mission: '',
    message: '',
    toneOfVoice: '',
    channelGuidelines: '',
  },
  tags: {
    logo: [],
    typography: [],
    stationery: [],
    style_design: [],
    verbal_identity: [],
  },
};
