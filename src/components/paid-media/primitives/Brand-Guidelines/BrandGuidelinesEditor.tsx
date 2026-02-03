"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, type FieldError, type FieldErrors, type Path, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Tabs,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { CheckIcon, Pencil2Icon } from "@radix-ui/react-icons";

import {
  EMPTY_BRAND_GUIDELINE_FORM,
  brandGuidelineDraftSchema,
  type BrandGuidelineDetail,
  type BrandGuidelineDraft,
} from "@/lib/schemas/brandGuidelines";
import { approveBrandGuidelineAction, saveBrandGuidelineDraftAction } from "@/lib/actions/brandGuidelines";
import { BrandGuidelineTagsSection } from "./BrandGuidelineTagsSection";

const STATUS_COLOR = {
  draft: "gray",
  review: "amber",
  approved: "green",
  archived: "red",
} as const;

const COLOR_FIELDS = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "neutral", label: "Neutral" },
] as const;

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const VERBAL_IDENTITY_FIELDS: { name: Path<BrandGuidelineDraft>; label: string }[] = [
  { name: "verbalIdentity.audiencePersona", label: "Audience persona" },
  { name: "verbalIdentity.story", label: "Brand story" },
  { name: "verbalIdentity.values", label: "Values" },
  { name: "verbalIdentity.vision", label: "Vision" },
  { name: "verbalIdentity.mission", label: "Mission" },
  { name: "verbalIdentity.message", label: "Core message" },
];

type BrandGuidelinesEditorProps = {
  brandId: string;
  guideline: BrandGuidelineDetail | null;
  onSaved: (guideline: BrandGuidelineDetail) => void;
};

function fieldError(errors: FieldErrors<BrandGuidelineDraft>, path: string): FieldError | undefined {
  const segments = path.split(".");
  let current: unknown = errors;

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
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
      notes: guideline.notes ?? "",
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
    mode: "onBlur",
  });

  useEffect(() => {
    form.reset(defaultValues);
    setError(null);
  }, [defaultValues, form]);

  const status = guideline?.status ?? "draft";
  const version = guideline?.version ?? null;

  const handleSaveDraft = form.handleSubmit(async (values) => {
    setError(null);
    setIsSaving(true);
    try {
      const saved = await saveBrandGuidelineDraftAction(brandId, guideline?.id ?? null, values);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save draft.");
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
      setError(err instanceof Error ? err.message : "Unable to approve guideline.");
    } finally {
      setIsSaving(false);
    }
  });

  const errors = form.formState.errors;

  return (
    <Card className="glass-panel p-6">
      <Flex direction="column" gap="4">
        <Flex align="center" justify="between" wrap="wrap" gap="2">
          <Flex align="center" gap="2">
            <Heading size="4" className="text-white">
              Brand Guidelines
            </Heading>
            <Badge color={STATUS_COLOR[status]} radius="full" variant="surface">
              {status}
            </Badge>
          </Flex>
          <Flex align="center" gap="2">
            {version ? (
              <Text size="2" color="gray">
                Version {version}
              </Text>
            ) : (
              <Text size="2" color="gray">
                New guideline
              </Text>
            )}
          </Flex>
        </Flex>

        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2" color="gray">
              Purpose
            </Text>
            <Controller
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <TextField.Root {...field} placeholder="Winter launch, evergreen brand book, etc." />
              )}
            />
            {fieldError(errors, "purpose")?.message ? (
              <Text size="1" color="red">
                {fieldError(errors, "purpose")?.message}
              </Text>
            ) : null}
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" color="gray">
              Notes
            </Text>
            <Controller
              control={form.control}
              name="notes"
              render={({ field }) => (
                <TextArea {...field} placeholder="Context, intended usage, or special constraints." rows={3} />
              )}
            />
          </Flex>
        </Flex>

        {error ? (
          <Box className="rounded-md border border-red-6/40 bg-red-3/40 p-3">
            <Text size="2" color="red">
              {error}
            </Text>
          </Box>
        ) : null}

        <Tabs.Root defaultValue="color">
          <Tabs.List>
            <Tabs.Trigger value="color">Color</Tabs.Trigger>
            <Tabs.Trigger value="logo">Logo</Tabs.Trigger>
            <Tabs.Trigger value="typography">Typography</Tabs.Trigger>
            <Tabs.Trigger value="stationery">Stationery</Tabs.Trigger>
            <Tabs.Trigger value="styleDesign">Style Design</Tabs.Trigger>
            <Tabs.Trigger value="verbalIdentity">Verbal Identity</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="color">
            <Flex direction="column" gap="3" className="pt-3">
              <Text size="2" color="gray">
                Hex values only. Color comes first and drives the rest of the guideline system.
              </Text>
              <Grid columns={{ initial: "1", sm: "2" }} gap="3">
                {COLOR_FIELDS.map((fieldDef) => (
                  <Controller
                    key={fieldDef.key}
                    control={form.control}
                    name={`colors.${fieldDef.key}` as const}
                    render={({ field }) => {
                      const isValid = HEX_REGEX.test(field.value ?? "");
                      const swatch = isValid ? field.value : "transparent";
                      return (
                        <Flex direction="column" gap="1">
                          <Text size="2" color="gray">
                            {fieldDef.label}
                          </Text>
                          <Flex align="center" gap="2">
                            <Box
                              className="h-8 w-8 rounded-md border border-[var(--glass-border)]"
                              style={{ backgroundColor: swatch }}
                            />
                            <TextField.Root {...field} placeholder="#1A1A1A" />
                          </Flex>
                          {fieldDef.key === "primary" && fieldError(errors, "colors.primary")?.message ? (
                            <Text size="1" color="red">
                              {fieldError(errors, "colors.primary")?.message}
                            </Text>
                          ) : null}
                          {fieldDef.key === "secondary" && fieldError(errors, "colors.secondary")?.message ? (
                            <Text size="1" color="red">
                              {fieldError(errors, "colors.secondary")?.message}
                            </Text>
                          ) : null}
                        </Flex>
                      );
                    }}
                  />
                ))}
              </Grid>
            </Flex>
          </Tabs.Content>

          <Tabs.Content value="logo">
            <Flex direction="column" gap="4" className="pt-3">
              <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                <Flex direction="column" gap="2">
                  <Text size="2" color="gray">
                    Usage guidelines
                  </Text>
                  <Controller
                    control={form.control}
                    name="logo.usageGuidelines"
                    render={({ field }) => (
                      <TextArea {...field} rows={3} placeholder="Where and how the logo should appear." />
                    )}
                  />
                </Flex>
              </Card>
              <Grid columns={{ initial: "1", md: "2" }} gap="3">
                <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                  <Flex direction="column" gap="2">
                    <Text size="2" color="gray">
                      Clear space
                    </Text>
                    <Controller
                      control={form.control}
                      name="logo.clearSpace"
                      render={({ field }) => (
                        <TextArea {...field} rows={2} placeholder="Minimum clear space guidance." />
                      )}
                    />
                  </Flex>
                </Card>
                <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                  <Flex direction="column" gap="2">
                    <Text size="2" color="gray">
                      Misuse
                    </Text>
                    <Controller
                      control={form.control}
                      name="logo.misuse"
                      render={({ field }) => (
                        <TextArea {...field} rows={2} placeholder="Common misuse to avoid." />
                      )}
                    />
                  </Flex>
                </Card>
              </Grid>
              <BrandGuidelineTagsSection
                title="Logo"
                name="tags.logo"
                control={form.control}
                helper="3-5 tags that capture how the logo should feel and appear."
              />
            </Flex>
          </Tabs.Content>

          <Tabs.Content value="typography">
            <Flex direction="column" gap="4" className="pt-3">
              <Grid columns={{ initial: "1", md: "2" }} gap="3">
                <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                  <Flex direction="column" gap="2">
                    <Text size="2" color="gray">
                      Heading font
                    </Text>
                    <Controller
                      control={form.control}
                      name="typography.headingFont"
                      render={({ field }) => (
                        <TextField.Root {...field} placeholder="e.g., Space Grotesk" />
                      )}
                    />
                  </Flex>
                </Card>
                <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                  <Flex direction="column" gap="2">
                    <Text size="2" color="gray">
                      Body font
                    </Text>
                    <Controller
                      control={form.control}
                      name="typography.bodyFont"
                      render={({ field }) => (
                        <TextField.Root {...field} placeholder="e.g., Inter" />
                      )}
                    />
                  </Flex>
                </Card>
                <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                  <Flex direction="column" gap="2">
                    <Text size="2" color="gray">
                      Accent font
                    </Text>
                    <Controller
                      control={form.control}
                      name="typography.accentFont"
                      render={({ field }) => (
                        <TextField.Root {...field} placeholder="Optional accent font" />
                      )}
                    />
                  </Flex>
                </Card>
                <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                  <Flex direction="column" gap="2">
                    <Text size="2" color="gray">
                      Usage guidance
                    </Text>
                    <Controller
                      control={form.control}
                      name="typography.usageGuidelines"
                      render={({ field }) => (
                        <TextArea {...field} rows={2} placeholder="Hierarchy, weights, or pairing notes." />
                      )}
                    />
                  </Flex>
                </Card>
              </Grid>
              <BrandGuidelineTagsSection
                title="Typography"
                name="tags.typography"
                control={form.control}
                helper="3-5 tags describing the typographic tone."
              />
            </Flex>
          </Tabs.Content>

          <Tabs.Content value="stationery">
            <Flex direction="column" gap="4" className="pt-3">
              <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                <Flex direction="column" gap="2">
                  <Text size="2" color="gray">
                    Stationery overview
                  </Text>
                  <Controller
                    control={form.control}
                    name="stationery.overview"
                    render={({ field }) => (
                      <TextArea {...field} rows={3} placeholder="Packaging, print, or collateral guidance." />
                    )}
                  />
                </Flex>
              </Card>
              <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                <Flex direction="column" gap="2">
                  <Text size="2" color="gray">
                    Applications
                  </Text>
                  <Controller
                    control={form.control}
                    name="stationery.applications"
                    render={({ field }) => (
                      <TextArea {...field} rows={2} placeholder="Business cards, envelopes, decks, etc." />
                    )}
                  />
                </Flex>
              </Card>
              <BrandGuidelineTagsSection
                title="Stationery"
                name="tags.stationery"
                control={form.control}
                helper="3-5 tags for print and collateral style."
              />
            </Flex>
          </Tabs.Content>

          <Tabs.Content value="styleDesign">
            <Flex direction="column" gap="4" className="pt-3">
              <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                <Flex direction="column" gap="2">
                  <Text size="2" color="gray">
                    Visual direction
                  </Text>
                  <Controller
                    control={form.control}
                    name="styleDesign.visualDirection"
                    render={({ field }) => (
                      <TextArea {...field} rows={3} placeholder="Core visual principles and layout direction." />
                    )}
                  />
                </Flex>
              </Card>
              <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                <Flex direction="column" gap="2">
                  <Text size="2" color="gray">
                    Imagery guidance
                  </Text>
                  <Controller
                    control={form.control}
                    name="styleDesign.imageryGuidance"
                    render={({ field }) => (
                      <TextArea {...field} rows={2} placeholder="Photography, illustration, or texture guidance." />
                    )}
                  />
                </Flex>
              </Card>
              <BrandGuidelineTagsSection
                title="Style Design"
                name="tags.style_design"
                control={form.control}
                helper="3-5 tags that define the overall aesthetic."
              />
            </Flex>
          </Tabs.Content>

          <Tabs.Content value="verbalIdentity">
            <Flex direction="column" gap="4" className="pt-3">
              <Grid columns={{ initial: "1", md: "2" }} gap="3">
                {VERBAL_IDENTITY_FIELDS.map((fieldDef) => (
                  <Card
                    key={fieldDef.name}
                    variant="surface"
                    className="border border-[var(--glass-border)] p-3"
                  >
                    <Flex direction="column" gap="2">
                      <Text size="2" color="gray">
                        {fieldDef.label}
                      </Text>
                      <Controller
                        control={form.control}
                        name={fieldDef.name}
                        render={({ field }) => (
                          <TextArea
                            {...field}
                            value={typeof field.value === "string" ? field.value : ""}
                            rows={3}
                            placeholder={fieldDef.label}
                          />
                        )}
                      />
                    </Flex>
                  </Card>
                ))}
              </Grid>
              <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                <Flex direction="column" gap="2">
                  <Text size="2" color="gray">
                    Tone of voice
                  </Text>
                  <Controller
                    control={form.control}
                    name="verbalIdentity.toneOfVoice"
                    render={({ field }) => (
                      <TextArea {...field} rows={3} placeholder="Define tone, cadence, and vocabulary." />
                    )}
                  />
                </Flex>
              </Card>
              <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                <Flex direction="column" gap="2">
                  <Text size="2" color="gray">
                    Channel guidelines
                  </Text>
                  <Controller
                    control={form.control}
                    name="verbalIdentity.channelGuidelines"
                    render={({ field }) => (
                      <TextArea
                        {...field}
                        rows={3}
                        placeholder="How we do content on X, Instagram, Stories, etc."
                      />
                    )}
                  />
                </Flex>
              </Card>
              <BrandGuidelineTagsSection
                title="Verbal Identity"
                name="tags.verbal_identity"
                control={form.control}
                helper="3-5 tags that summarize voice and messaging."
              />
            </Flex>
          </Tabs.Content>
        </Tabs.Root>

        <Flex align="center" justify="end" gap="2">
          <Button type="button" variant="soft" onClick={handleSaveDraft} disabled={isSaving}>
            <Pencil2Icon /> Save draft
          </Button>
          <Button type="button" onClick={handleApprove} disabled={isSaving}>
            <CheckIcon /> Approve
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}
