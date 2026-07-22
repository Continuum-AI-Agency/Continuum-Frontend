import { z } from 'zod';

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

const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a valid hex color');

export const brandGuidelineTagSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1, 'Tag label is required'),
  description: z.string().min(1, 'Tag description is required'),
});

export type BrandGuidelineTag = z.infer<typeof brandGuidelineTagSchema>;

export const brandGuidelineColorsSchema = z.object({
  primary: hexColorSchema,
  secondary: hexColorSchema,
  accent: hexColorSchema.optional().or(z.literal('')),
  neutral: hexColorSchema.optional().or(z.literal('')),
});

export const brandGuidelineLogoSchema = z.object({
  usageGuidelines: z.string().optional().or(z.literal('')),
  clearSpace: z.string().optional().or(z.literal('')),
  misuse: z.string().optional().or(z.literal('')),
});

export const brandGuidelineTypographySchema = z.object({
  headingFont: z.string().optional().or(z.literal('')),
  bodyFont: z.string().optional().or(z.literal('')),
  accentFont: z.string().optional().or(z.literal('')),
  usageGuidelines: z.string().optional().or(z.literal('')),
});

export const brandGuidelineStationerySchema = z.object({
  overview: z.string().optional().or(z.literal('')),
  applications: z.string().optional().or(z.literal('')),
});

export const brandGuidelineStyleDesignSchema = z.object({
  visualDirection: z.string().optional().or(z.literal('')),
  imageryGuidance: z.string().optional().or(z.literal('')),
});

export const brandGuidelineVerbalIdentitySchema = z.object({
  audiencePersona: z.string().optional().or(z.literal('')),
  story: z.string().optional().or(z.literal('')),
  values: z.string().optional().or(z.literal('')),
  vision: z.string().optional().or(z.literal('')),
  mission: z.string().optional().or(z.literal('')),
  message: z.string().optional().or(z.literal('')),
  toneOfVoice: z.string().optional().or(z.literal('')),
  channelGuidelines: z.string().optional().or(z.literal('')),
});

export const brandGuidelineTagsSchema = z.object({
  logo: z.array(brandGuidelineTagSchema).max(5),
  typography: z.array(brandGuidelineTagSchema).max(5),
  stationery: z.array(brandGuidelineTagSchema).max(5),
  style_design: z.array(brandGuidelineTagSchema).max(5),
  verbal_identity: z.array(brandGuidelineTagSchema).max(5),
});

export type BrandGuidelineTagsBySection = z.infer<typeof brandGuidelineTagsSchema>;

export const brandGuidelineDraftSchema = z.object({
  purpose: z.string().min(2, 'Purpose is required'),
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

export type BrandGuidelineDraft = z.infer<typeof brandGuidelineDraftSchema>;

export const brandGuidelineApprovalSchema = brandGuidelineDraftSchema.extend({
  logo: brandGuidelineLogoSchema.extend({
    usageGuidelines: z.string().min(1, 'Logo usage guidelines are required'),
    clearSpace: z.string().min(1, 'Logo clear space guidance is required'),
  }),
  typography: brandGuidelineTypographySchema.extend({
    headingFont: z.string().min(1, 'Heading font is required'),
    bodyFont: z.string().min(1, 'Body font is required'),
  }),
  stationery: brandGuidelineStationerySchema.extend({
    overview: z.string().min(1, 'Stationery overview is required'),
  }),
  styleDesign: brandGuidelineStyleDesignSchema.extend({
    visualDirection: z.string().min(1, 'Style design direction is required'),
  }),
  verbalIdentity: brandGuidelineVerbalIdentitySchema.extend({
    audiencePersona: z.string().min(1, 'Audience persona is required'),
    story: z.string().min(1, 'Brand story is required'),
    values: z.string().min(1, 'Values are required'),
    vision: z.string().min(1, 'Vision is required'),
    mission: z.string().min(1, 'Mission is required'),
    message: z.string().min(1, 'Core message is required'),
    toneOfVoice: z.string().min(1, 'Tone of voice is required'),
    channelGuidelines: z.string().min(1, 'Channel guidelines are required'),
  }),
  tags: z.object({
    logo: z.array(brandGuidelineTagSchema).min(3).max(5),
    typography: z.array(brandGuidelineTagSchema).min(3).max(5),
    stationery: z.array(brandGuidelineTagSchema).min(3).max(5),
    style_design: z.array(brandGuidelineTagSchema).min(3).max(5),
    verbal_identity: z.array(brandGuidelineTagSchema).min(3).max(5),
  }),
});

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
