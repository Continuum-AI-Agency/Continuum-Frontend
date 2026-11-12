'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, SquarePen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Controller, type FieldError, type FieldErrors, type Path, useForm } from 'react-hook-form';
import { Pill, type PillProps } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useUiErrorMessage } from '@/i18n/errors';
import { useValidationErrorMap } from '@/i18n/validation';
import {
  approveBrandGuidelineAction,
  saveBrandGuidelineDraftAction,
} from '@/lib/actions/brandGuidelines';
import {
  type BrandGuidelineDetail,
  type BrandGuidelineDraft,
  brandGuidelineDraftSchema,
  createBrandGuidelineSchemas,
  EMPTY_BRAND_GUIDELINE_FORM,
} from '@/lib/schemas/brandGuidelines';
import { BrandGuidelineTagsSection } from './BrandGuidelineTagsSection';

const STATUS_PILL_VARIANT: Record<BrandGuidelineDetail['status'], PillProps['variant']> = {
  draft: 'muted',
  review: 'warning',
  approved: 'success',
  archived: 'destructive',
};

const COLOR_FIELDS = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'neutral', label: 'Neutral' },
] as const;

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type BrandGuidelinesEditorProps = {
  brandId: string;
  guideline: BrandGuidelineDetail | null;
  onSaved: (guideline: BrandGuidelineDetail) => void;
};

function fieldError(
  errors: FieldErrors<BrandGuidelineDraft>,
  path: string,
): FieldError | undefined {
  const segments = path.split('.');
  let current: unknown = errors;

  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current as FieldError | undefined;
}

export function BrandGuidelinesEditor({ brandId, guideline, onSaved }: BrandGuidelinesEditorProps) {
  const formatUiError = useUiErrorMessage();
  const uiText = useTranslations('scale');
  const VERBAL_IDENTITY_FIELDS: {
    name: Path<BrandGuidelineDraft>;
    label: string;
  }[] = useMemo(
    () => [
      {
        name: 'verbalIdentity.audiencePersona',
        label: uiText('brandAudiencePersona'),
      },
      { name: 'verbalIdentity.story', label: uiText('brandStoryLabel') },
      { name: 'verbalIdentity.values', label: uiText('brandValuesLabel') },
      { name: 'verbalIdentity.vision', label: uiText('vision_c587c26') },
      { name: 'verbalIdentity.mission', label: uiText('mission_e6b85bf') },
      { name: 'verbalIdentity.message', label: uiText('brandCoreMessage') },
    ],
    [uiText],
  );

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const defaultValues = useMemo<BrandGuidelineDraft>(() => {
    if (!guideline) return EMPTY_BRAND_GUIDELINE_FORM;

    return {
      purpose: guideline.purpose,
      notes: guideline.notes ?? '',
      status: guideline.status,
      colors: guideline.colors,
      logo: guideline.logo,
      typography: guideline.typography,
      stationery: guideline.stationery,
      styleDesign: guideline.styleDesign,
      verbalIdentity: guideline.verbalIdentity,
      tags: guideline.tags,
    };
  }, [guideline]);

  const localizedSchema = useMemo(
    () => createBrandGuidelineSchemas(uiText).brandGuidelineDraftSchema,
    [uiText],
  );
  const validationErrorMap = useValidationErrorMap();
  const form = useForm<BrandGuidelineDraft>({
    resolver: zodResolver(localizedSchema, {
      error: validationErrorMap,
    }),
    defaultValues,
    mode: 'onBlur',
  });

  useEffect(() => {
    form.reset(defaultValues);
    setError(null);
  }, [defaultValues, form]);

  const status = guideline?.status ?? 'draft';
  const version = guideline?.version ?? null;

  const handleSaveDraft = form.handleSubmit(async (values) => {
    setError(null);
    setIsSaving(true);
    try {
      const saved = await saveBrandGuidelineDraftAction(brandId, guideline?.id ?? null, values);
      onSaved(saved);
    } catch (err) {
      setError(formatUiError(err));
    } finally {
      setIsSaving(false);
    }
  });

  const handleApprove = form.handleSubmit(async (values) => {
    setError(null);
    setIsSaving(true);
    try {
      const saved = await approveBrandGuidelineAction(brandId, guideline?.id ?? null, values);
      onSaved(saved);
    } catch (err) {
      setError(formatUiError(err));
    } finally {
      setIsSaving(false);
    }
  });

  const errors = form.formState.errors;

  return (
    <div className="glass-panel rounded-lg p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h4 className="text-lg font-semibold text-white">
              {uiText('brand_guidelines_7d8b9dd')}
            </h4>
            <Pill variant={STATUS_PILL_VARIANT[status]}>
              {uiText('brandGuidelineStatus', { status })}
            </Pill>
          </div>
          <div className="flex items-center gap-2">
            {version ? (
              <span className="text-sm text-muted-foreground">
                {uiText.rich('sentence_6f34daf78edd', { v0: version })}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {uiText('new_guideline_f111c9e')}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{uiText('purpose_d4e8830')}</span>
            <Controller
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder={uiText('winter_launch_evergreen_brand_book_etc_2bb60f7')}
                />
              )}
            />
            {fieldError(errors, 'purpose')?.message ? (
              <span className="text-xs text-destructive">
                {fieldError(errors, 'purpose')?.message}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{uiText('notes_8a7525b')}</span>
            <Controller
              control={form.control}
              name="notes"
              render={({ field }) => (
                <Textarea
                  {...field}
                  placeholder={uiText('context_intended_usage_or_special_constraints_45db88b')}
                  rows={3}
                />
              )}
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <span className="text-sm text-destructive">{error}</span>
          </div>
        ) : null}

        <Tabs defaultValue="color">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="color">{uiText('color_6b73191')}</TabsTrigger>
            <TabsTrigger value="logo">{uiText('logo_d707dc2')}</TabsTrigger>
            <TabsTrigger value="typography">{uiText('typography_cab94ab')}</TabsTrigger>
            <TabsTrigger value="stationery">{uiText('stationery_d86b481')}</TabsTrigger>
            <TabsTrigger value="styleDesign">{uiText('style_design_d948fcd')}</TabsTrigger>
            <TabsTrigger value="verbalIdentity">{uiText('verbal_identity_dd8f896')}</TabsTrigger>
          </TabsList>

          <TabsContent value="color">
            <div className="flex flex-col gap-3 pt-3">
              <span className="text-sm text-muted-foreground">
                {uiText('hex_values_only_color_comes_first_and_drives__2dae4b3')}
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {COLOR_FIELDS.map((fieldDef) => (
                  <Controller
                    key={fieldDef.key}
                    control={form.control}
                    name={`colors.${fieldDef.key}` as const}
                    render={({ field }) => {
                      const isValid = HEX_REGEX.test(field.value ?? '');
                      const swatch = isValid ? field.value : 'transparent';
                      return (
                        <div className="flex flex-col gap-1">
                          <span className="text-sm text-muted-foreground">
                            {uiText('brandColorLabel', { color: fieldDef.key })}
                          </span>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-8 w-8 rounded-md border border-[var(--glass-border)]"
                              style={{ backgroundColor: swatch }}
                            />
                            <Input {...field} placeholder="#1A1A1A" />
                          </div>
                          {fieldDef.key === 'primary' &&
                          fieldError(errors, 'colors.primary')?.message ? (
                            <span className="text-xs text-destructive">
                              {fieldError(errors, 'colors.primary')?.message}
                            </span>
                          ) : null}
                          {fieldDef.key === 'secondary' &&
                          fieldError(errors, 'colors.secondary')?.message ? (
                            <span className="text-xs text-destructive">
                              {fieldError(errors, 'colors.secondary')?.message}
                            </span>
                          ) : null}
                        </div>
                      );
                    }}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="logo">
            <div className="flex flex-col gap-4 pt-3">
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">
                    {uiText('usage_guidelines_729d134')}
                  </span>
                  <Controller
                    control={form.control}
                    name="logo.usageGuidelines"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder={uiText('where_and_how_the_logo_should_appear_0a9b519')}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">
                      {uiText('clear_space_5921f13')}
                    </span>
                    <Controller
                      control={form.control}
                      name="logo.clearSpace"
                      render={({ field }) => (
                        <Textarea
                          {...field}
                          rows={2}
                          placeholder={uiText('minimum_clear_space_guidance_c23d3d6')}
                        />
                      )}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">
                      {uiText('misuse_0f20ff3')}
                    </span>
                    <Controller
                      control={form.control}
                      name="logo.misuse"
                      render={({ field }) => (
                        <Textarea
                          {...field}
                          rows={2}
                          placeholder={uiText('common_misuse_to_avoid_96edd08')}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
              <BrandGuidelineTagsSection
                title={uiText('logo_d707dc2')}
                name="tags.logo"
                control={form.control}
                helper={uiText('brandTagsHelper', { section: 'logo' })}
              />
            </div>
          </TabsContent>

          <TabsContent value="typography">
            <div className="flex flex-col gap-4 pt-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">
                      {uiText('heading_font_20d26b0')}
                    </span>
                    <Controller
                      control={form.control}
                      name="typography.headingFont"
                      render={({ field }) => (
                        <Input {...field} placeholder={uiText('e_g_space_grotesk_5097b42')} />
                      )}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">
                      {uiText('body_font_2448d20')}
                    </span>
                    <Controller
                      control={form.control}
                      name="typography.bodyFont"
                      render={({ field }) => (
                        <Input {...field} placeholder={uiText('e_g_inter_3ccef4b')} />
                      )}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">
                      {uiText('accent_font_2b05cd8')}
                    </span>
                    <Controller
                      control={form.control}
                      name="typography.accentFont"
                      render={({ field }) => (
                        <Input {...field} placeholder={uiText('optional_accent_font_6a3e896')} />
                      )}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">
                      {uiText('usage_guidance_0c1d12d')}
                    </span>
                    <Controller
                      control={form.control}
                      name="typography.usageGuidelines"
                      render={({ field }) => (
                        <Textarea
                          {...field}
                          rows={2}
                          placeholder={uiText('hierarchy_weights_or_pairing_notes_b5ebc0c')}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
              <BrandGuidelineTagsSection
                title={uiText('typography_cab94ab')}
                name="tags.typography"
                control={form.control}
                helper={uiText('brandTagsHelper', { section: 'typography' })}
              />
            </div>
          </TabsContent>

          <TabsContent value="stationery">
            <div className="flex flex-col gap-4 pt-3">
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">
                    {uiText('stationery_overview_271d761')}
                  </span>
                  <Controller
                    control={form.control}
                    name="stationery.overview"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder={uiText('packaging_print_or_collateral_guidance_3d4c3e6')}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">
                    {uiText('applications_98e33b0')}
                  </span>
                  <Controller
                    control={form.control}
                    name="stationery.applications"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder={uiText('business_cards_envelopes_decks_etc_729d931')}
                      />
                    )}
                  />
                </div>
              </div>
              <BrandGuidelineTagsSection
                title={uiText('stationery_d86b481')}
                name="tags.stationery"
                control={form.control}
                helper={uiText('brandTagsHelper', { section: 'stationery' })}
              />
            </div>
          </TabsContent>

          <TabsContent value="styleDesign">
            <div className="flex flex-col gap-4 pt-3">
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">
                    {uiText('visual_direction_66799e8')}
                  </span>
                  <Controller
                    control={form.control}
                    name="styleDesign.visualDirection"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder={uiText('core_visual_principles_and_layout_direction_e29bf5c')}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">
                    {uiText('imagery_guidance_0547846')}
                  </span>
                  <Controller
                    control={form.control}
                    name="styleDesign.imageryGuidance"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder={uiText('photography_illustration_or_texture_guidance_cd9139c')}
                      />
                    )}
                  />
                </div>
              </div>
              <BrandGuidelineTagsSection
                title={uiText('style_design_d948fcd')}
                name="tags.style_design"
                control={form.control}
                helper={uiText('brandTagsHelper', { section: 'style' })}
              />
            </div>
          </TabsContent>

          <TabsContent value="verbalIdentity">
            <div className="flex flex-col gap-4 pt-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {VERBAL_IDENTITY_FIELDS.map((fieldDef) => (
                  <div
                    key={fieldDef.name}
                    className="rounded-lg border border-[var(--glass-border)] p-3"
                  >
                    <div className="flex flex-col gap-2">
                      <span className="text-sm text-muted-foreground">{fieldDef.label}</span>
                      <Controller
                        control={form.control}
                        name={fieldDef.name}
                        render={({ field }) => (
                          <Textarea
                            {...field}
                            value={typeof field.value === 'string' ? field.value : ''}
                            rows={3}
                            placeholder={fieldDef.label}
                          />
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">
                    {uiText('tone_of_voice_54eea37')}
                  </span>
                  <Controller
                    control={form.control}
                    name="verbalIdentity.toneOfVoice"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder={uiText('define_tone_cadence_and_vocabulary_01516dc')}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">
                    {uiText('channel_guidelines_4704ae4')}
                  </span>
                  <Controller
                    control={form.control}
                    name="verbalIdentity.channelGuidelines"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder={uiText('how_we_do_content_on_x_instagram_stories_etc_809fba1')}
                      />
                    )}
                  />
                </div>
              </div>
              <BrandGuidelineTagsSection
                title={uiText('verbal_identity_dd8f896')}
                name="tags.verbal_identity"
                control={form.control}
                helper={uiText('brandTagsHelper', { section: 'verbal' })}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={isSaving}>
            <SquarePen />
            {uiText('save_draft_3de1001')}
          </Button>
          <Button type="button" onClick={handleApprove} disabled={isSaving}>
            <Check />
            {uiText('approve_6007acb')}
          </Button>
        </div>
      </div>
    </div>
  );
}
