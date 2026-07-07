'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckIcon, Pencil2Icon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useState } from 'react';
import { Controller, type FieldError, type FieldErrors, type Path, useForm } from 'react-hook-form';
import { Pill, type PillProps } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  approveBrandGuidelineAction,
  saveBrandGuidelineDraftAction,
} from '@/lib/actions/brandGuidelines';
import {
  type BrandGuidelineDetail,
  type BrandGuidelineDraft,
  brandGuidelineDraftSchema,
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

const VERBAL_IDENTITY_FIELDS: { name: Path<BrandGuidelineDraft>; label: string }[] = [
  { name: 'verbalIdentity.audiencePersona', label: 'Audience persona' },
  { name: 'verbalIdentity.story', label: 'Brand story' },
  { name: 'verbalIdentity.values', label: 'Values' },
  { name: 'verbalIdentity.vision', label: 'Vision' },
  { name: 'verbalIdentity.mission', label: 'Mission' },
  { name: 'verbalIdentity.message', label: 'Core message' },
];

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

  const form = useForm<BrandGuidelineDraft>({
    resolver: zodResolver(brandGuidelineDraftSchema),
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
      setError(err instanceof Error ? err.message : 'Unable to save draft.');
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
      setError(err instanceof Error ? err.message : 'Unable to approve guideline.');
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
            <h4 className="text-lg font-semibold text-white">Brand Guidelines</h4>
            <Pill variant={STATUS_PILL_VARIANT[status]}>{status}</Pill>
          </div>
          <div className="flex items-center gap-2">
            {version ? (
              <span className="text-sm text-muted-foreground">Version {version}</span>
            ) : (
              <span className="text-sm text-muted-foreground">New guideline</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Purpose</span>
            <Controller
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <Input {...field} placeholder="Winter launch, evergreen brand book, etc." />
              )}
            />
            {fieldError(errors, 'purpose')?.message ? (
              <span className="text-xs text-destructive">
                {fieldError(errors, 'purpose')?.message}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Notes</span>
            <Controller
              control={form.control}
              name="notes"
              render={({ field }) => (
                <Textarea
                  {...field}
                  placeholder="Context, intended usage, or special constraints."
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
            <TabsTrigger value="color">Color</TabsTrigger>
            <TabsTrigger value="logo">Logo</TabsTrigger>
            <TabsTrigger value="typography">Typography</TabsTrigger>
            <TabsTrigger value="stationery">Stationery</TabsTrigger>
            <TabsTrigger value="styleDesign">Style Design</TabsTrigger>
            <TabsTrigger value="verbalIdentity">Verbal Identity</TabsTrigger>
          </TabsList>

          <TabsContent value="color">
            <div className="flex flex-col gap-3 pt-3">
              <span className="text-sm text-muted-foreground">
                Hex values only. Color comes first and drives the rest of the guideline system.
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
                          <span className="text-sm text-muted-foreground">{fieldDef.label}</span>
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
                  <span className="text-sm text-muted-foreground">Usage guidelines</span>
                  <Controller
                    control={form.control}
                    name="logo.usageGuidelines"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Where and how the logo should appear."
                      />
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">Clear space</span>
                    <Controller
                      control={form.control}
                      name="logo.clearSpace"
                      render={({ field }) => (
                        <Textarea {...field} rows={2} placeholder="Minimum clear space guidance." />
                      )}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">Misuse</span>
                    <Controller
                      control={form.control}
                      name="logo.misuse"
                      render={({ field }) => (
                        <Textarea {...field} rows={2} placeholder="Common misuse to avoid." />
                      )}
                    />
                  </div>
                </div>
              </div>
              <BrandGuidelineTagsSection
                title="Logo"
                name="tags.logo"
                control={form.control}
                helper="3-5 tags that capture how the logo should feel and appear."
              />
            </div>
          </TabsContent>

          <TabsContent value="typography">
            <div className="flex flex-col gap-4 pt-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">Heading font</span>
                    <Controller
                      control={form.control}
                      name="typography.headingFont"
                      render={({ field }) => <Input {...field} placeholder="e.g., Space Grotesk" />}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">Body font</span>
                    <Controller
                      control={form.control}
                      name="typography.bodyFont"
                      render={({ field }) => <Input {...field} placeholder="e.g., Inter" />}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">Accent font</span>
                    <Controller
                      control={form.control}
                      name="typography.accentFont"
                      render={({ field }) => (
                        <Input {...field} placeholder="Optional accent font" />
                      )}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">Usage guidance</span>
                    <Controller
                      control={form.control}
                      name="typography.usageGuidelines"
                      render={({ field }) => (
                        <Textarea
                          {...field}
                          rows={2}
                          placeholder="Hierarchy, weights, or pairing notes."
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
              <BrandGuidelineTagsSection
                title="Typography"
                name="tags.typography"
                control={form.control}
                helper="3-5 tags describing the typographic tone."
              />
            </div>
          </TabsContent>

          <TabsContent value="stationery">
            <div className="flex flex-col gap-4 pt-3">
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">Stationery overview</span>
                  <Controller
                    control={form.control}
                    name="stationery.overview"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Packaging, print, or collateral guidance."
                      />
                    )}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">Applications</span>
                  <Controller
                    control={form.control}
                    name="stationery.applications"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder="Business cards, envelopes, decks, etc."
                      />
                    )}
                  />
                </div>
              </div>
              <BrandGuidelineTagsSection
                title="Stationery"
                name="tags.stationery"
                control={form.control}
                helper="3-5 tags for print and collateral style."
              />
            </div>
          </TabsContent>

          <TabsContent value="styleDesign">
            <div className="flex flex-col gap-4 pt-3">
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">Visual direction</span>
                  <Controller
                    control={form.control}
                    name="styleDesign.visualDirection"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Core visual principles and layout direction."
                      />
                    )}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">Imagery guidance</span>
                  <Controller
                    control={form.control}
                    name="styleDesign.imageryGuidance"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder="Photography, illustration, or texture guidance."
                      />
                    )}
                  />
                </div>
              </div>
              <BrandGuidelineTagsSection
                title="Style Design"
                name="tags.style_design"
                control={form.control}
                helper="3-5 tags that define the overall aesthetic."
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
                  <span className="text-sm text-muted-foreground">Tone of voice</span>
                  <Controller
                    control={form.control}
                    name="verbalIdentity.toneOfVoice"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Define tone, cadence, and vocabulary."
                      />
                    )}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">Channel guidelines</span>
                  <Controller
                    control={form.control}
                    name="verbalIdentity.channelGuidelines"
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="How we do content on X, Instagram, Stories, etc."
                      />
                    )}
                  />
                </div>
              </div>
              <BrandGuidelineTagsSection
                title="Verbal Identity"
                name="tags.verbal_identity"
                control={form.control}
                helper="3-5 tags that summarize voice and messaging."
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={isSaving}>
            <Pencil2Icon /> Save draft
          </Button>
          <Button type="button" onClick={handleApprove} disabled={isSaving}>
            <CheckIcon /> Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
