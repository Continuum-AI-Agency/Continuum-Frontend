"use client";

import React from "react";
import { z } from "zod";
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Flex,
  Grid,
  Heading,
  IconButton,
  SegmentedControl,
  Separator,
  Text,
  TextArea,
  TextField,
  Tooltip,
  Callout,
  ScrollArea,
} from "@radix-ui/themes";
import {
  CheckIcon,
  DownloadIcon,
  ExclamationTriangleIcon,
  LightningBoltIcon,
  MagicWandIcon,
  MixerHorizontalIcon,
  ReloadIcon,
  RocketIcon,
  StackIcon,
  StarIcon,
} from "@radix-ui/react-icons";

import {
  createAiStudioJob,
  getAiStudioJob,
  listAiStudioJobs,
} from "@/lib/api/aiStudio";
import {
  aiStudioAspectRatioSchema,
  aiStudioMediumSchema,
  aiStudioProviderSchema,
  type AiStudioArtifact,
  type AiStudioJob,
  type AiStudioMedium,
  type AiStudioProvider,
  type AiStudioTemplate,
} from "@/lib/schemas/aiStudio";
import { useToast } from "@/components/ui/ToastProvider";
import { uploadCreativeAsset } from "@/lib/creative-assets/storage";

type AIStudioClientProps = {
  brandProfileId: string;
  brandName: string;
  initialTemplates: AiStudioTemplate[];
  initialJobs: AiStudioJob[];
  loadErrors?: {
    templates?: string;
    jobs?: string;
  };
};

type LoadErrorMap = NonNullable<AIStudioClientProps["loadErrors"]>;

type TemplateFilter = {
  provider: AiStudioProvider;
  medium: AiStudioMedium;
};

type ProviderDescriptor = {
  label: string;
  description: string;
  mediums: AiStudioMedium[];
  accent: "blue" | "purple" | "orange";
};

const PROVIDERS: Record<AiStudioProvider, ProviderDescriptor> = {
  "nano-banana": {
    label: "Nano Banana",
    description: "Lightning-fast image diffusion tuned for brand palettes.",
    mediums: ["image"],
    accent: "purple",
  },
  "veo-3-1": {
    label: "Veo 3.1",
    description: "Google Veo cinematic video model with motion control.",
    mediums: ["video"],
    accent: "blue",
  },
  "sora-2": {
    label: "Sora 2",
    description: "OpenAI Sora for longer-form video storytelling.",
    mediums: ["video"],
    accent: "orange",
  },
};

const KNOWN_ASPECT_RATIOS = ["1:1", "4:5", "3:4", "16:9", "9:16"] as const;

const PENDING_STATUSES = new Set<AiStudioJob["status"]>(["queued", "processing"]);

function preprocessNumber(value: unknown) {
  if (value === "" || value === null || typeof value === "undefined") {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? undefined : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

const generationFormSchema = z.object({
  provider: aiStudioProviderSchema,
  medium: aiStudioMediumSchema,
  templateId: z.string().min(1).optional().nullable(),
  prompt: z.string().min(12, "Prompt must be at least 12 characters long."),
  negativePrompt: z.string().optional(),
  aspectRatio: aiStudioAspectRatioSchema.optional(),
  durationSeconds: z
    .preprocess(preprocessNumber, z.number().int().min(1).max(120))
    .optional(),
  guidanceScale: z.preprocess(preprocessNumber, z.number().min(0).max(20)).optional(),
  seed: z.preprocess(preprocessNumber, z.number().int().nonnegative()).optional(),
});

type GenerationFormValues = z.infer<typeof generationFormSchema>;

type SelectedArtifactsMap = Record<string, string[]>;

type JobStatusMeta = {
  label: string;
  color: "gray" | "amber" | "blue" | "green" | "red";
  icon: React.ReactNode;
};

const JOB_STATUS_META: Record<AiStudioJob["status"], JobStatusMeta> = {
  queued: {
    label: "Queued",
    color: "amber",
    icon: <StackIcon />,
  },
  processing: {
    label: "Processing",
    color: "blue",
    icon: <MagicWandIcon />,
  },
  completed: {
    label: "Completed",
    color: "green",
    icon: <CheckIcon />,
  },
  failed: {
    label: "Failed",
    color: "red",
    icon: <ExclamationTriangleIcon />,
  },
  cancelled: {
    label: "Cancelled",
    color: "gray",
    icon: <MixerHorizontalIcon />,
  },
};

function sortJobs(jobs: AiStudioJob[]): AiStudioJob[] {
  return [...jobs].sort((a, b) => {
    const aDate = Date.parse(a.createdAt ?? "");
    const bDate = Date.parse(b.createdAt ?? "");
    return bDate - aDate;
  });
}

function upsertJob(list: AiStudioJob[], job: AiStudioJob): AiStudioJob[] {
  const next = [...list];
  const index = next.findIndex((item) => item.id === job.id);
  if (index >= 0) {
    next[index] = job;
  } else {
    next.unshift(job);
  }
  return sortJobs(next);
}

function formatDate(timestamp: string | undefined): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getArtifactPreviewSource(artifact: AiStudioArtifact): string {
  return artifact.previewUri ?? artifact.uri;
}

async function downloadArtifactAsFile(artifact: AiStudioArtifact): Promise<File> {
  const response = await fetch(artifact.uri);
  if (!response.ok) {
    throw new Error(`Failed to download artifact ${artifact.id}`);
  }
  const blob = await response.blob();
  const mimeType = artifact.mimeType ?? blob.type ?? "application/octet-stream";
  const extension = (() => {
    if (artifact.fileName?.includes(".")) {
      return "";
    }
    const inferred = mimeType.split("/")[1];
    return inferred ? `.${inferred}` : "";
  })();
  const fileName =
    artifact.fileName ??
    `continuum-${artifact.id}${extension || (mimeType.startsWith("image/") ? ".png" : mimeType.startsWith("video/") ? ".mp4" : ".bin")}`;

  return new File([blob], fileName, { type: mimeType });
}

function initialSelectedArtifacts(jobs: AiStudioJob[]): SelectedArtifactsMap {
  return jobs.reduce<SelectedArtifactsMap>((acc, job) => {
    if (job.status === "completed" && job.artifacts.length > 0) {
      acc[job.id] = job.artifacts.map((artifact) => artifact.id);
    }
    return acc;
  }, {});
}

export default function AIStudioClient({
  brandProfileId,
  brandName,
  initialTemplates,
  initialJobs,
  loadErrors: initialLoadErrors,
}: AIStudioClientProps) {
  const { show: showToast } = useToast();

  const [loadErrors, setLoadErrors] = React.useState<LoadErrorMap>(() => initialLoadErrors ?? {});
  const hasLoadErrors = Boolean(loadErrors.templates || loadErrors.jobs);

  const [templates] = React.useState(() =>
    [...initialTemplates].sort((a, b) => a.name.localeCompare(b.name))
  );

  const [jobs, setJobs] = React.useState(() => sortJobs(initialJobs));
  const [selectedArtifacts, setSelectedArtifacts] = React.useState<SelectedArtifactsMap>(() =>
    initialSelectedArtifacts(initialJobs)
  );
  const [expandedJobId, setExpandedJobId] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [savingJobId, setSavingJobId] = React.useState<string | null>(null);

  const form = useForm<GenerationFormValues>({
    resolver: zodResolver(generationFormSchema) as Resolver<GenerationFormValues>,
    defaultValues: {
      provider: "nano-banana",
      medium: "image",
      templateId: null,
      prompt: "",
      negativePrompt: "",
      aspectRatio: "16:9",
      durationSeconds: undefined,
      guidanceScale: undefined,
      seed: undefined,
    },
  });

  const provider = form.watch("provider");
  const medium = form.watch("medium");
  const templateId = form.watch("templateId") ?? undefined;

  React.useEffect(() => {
    const descriptor = PROVIDERS[provider];
    if (!descriptor.mediums.includes(medium)) {
      form.setValue("medium", descriptor.mediums[0], { shouldDirty: true });
    }
  }, [provider, medium, form]);

  const availableTemplates = React.useMemo(() => {
    return templates.filter(
      (template) =>
        template.provider === provider &&
        template.medium === medium
    );
  }, [templates, provider, medium]);

  const selectedTemplate = React.useMemo(
    () => availableTemplates.find((template) => template.id === templateId),
    [availableTemplates, templateId]
  );

  React.useEffect(() => {
    if (selectedTemplate?.defaultPrompt) {
      form.setValue("prompt", selectedTemplate.defaultPrompt, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
    if (selectedTemplate?.defaultNegativePrompt) {
      form.setValue("negativePrompt", selectedTemplate.defaultNegativePrompt, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
    if (selectedTemplate?.aspectRatio) {
      form.setValue("aspectRatio", selectedTemplate.aspectRatio, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
  }, [selectedTemplate, form]);

  const pendingSignature = React.useMemo(() => {
    return jobs
      .filter((job) => PENDING_STATUSES.has(job.status))
      .map((job) => `${job.id}:${job.status}`)
      .sort()
      .join("|");
  }, [jobs]);

  React.useEffect(() => {
    setSelectedArtifacts((previous) => {
      const next: SelectedArtifactsMap = { ...previous };
      for (const job of jobs) {
        if (job.status === "completed" && job.artifacts.length > 0 && !next[job.id]) {
          next[job.id] = job.artifacts.map((artifact) => artifact.id);
        }
        if (job.artifacts.length === 0 && next[job.id]) {
          delete next[job.id];
        }
      }
      return next;
    });
  }, [jobs]);

  React.useEffect(() => {
    const activeJobs = jobs.filter((job) => PENDING_STATUSES.has(job.status));
    if (activeJobs.length === 0) {
      return;
    }

    let cancelled = false;

    async function poll() {
      for (const job of activeJobs) {
        try {
          const updated = await getAiStudioJob(job.id, brandProfileId);
          if (!cancelled) {
            setJobs((prev) => upsertJob(prev, updated));
          }
        } catch (error) {
          console.error("Failed to poll job", error);
        }
      }
    }

    const interval = window.setInterval(poll, 6000);
    poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [brandProfileId, pendingSignature]);

  const previousStatusesRef = React.useRef<Map<string, AiStudioJob["status"]>>(new Map());

  React.useEffect(() => {
    for (const job of jobs) {
      const previous = previousStatusesRef.current.get(job.id);
      if (previous !== job.status) {
        previousStatusesRef.current.set(job.id, job.status);
        if (job.status === "completed") {
          showToast({
            title: "Generation complete",
            description: `${PROVIDERS[job.provider].label} finished rendering your ${job.medium}.`,
            variant: "success",
          });
        }
        if (job.status === "failed" && job.failure?.message) {
          showToast({
            title: "Generation failed",
            description: job.failure.message,
            variant: "error",
          });
        }
      }
    }
  }, [jobs, showToast]);

  const filteredTemplates = React.useMemo<AiStudioTemplate[]>(() => {
    return availableTemplates;
  }, [availableTemplates]);

  const handleTemplateSelect = React.useCallback(
    (template: AiStudioTemplate) => {
      form.setValue("templateId", template.id, { shouldDirty: true, shouldTouch: true });
    },
    [form]
  );

  const handleTemplateClear = React.useCallback(() => {
    form.setValue("templateId", null, { shouldDirty: true, shouldTouch: true });
  }, [form]);

  const handleFormSubmit: SubmitHandler<GenerationFormValues> = async (values) => {
    setIsSubmitting(true);
    try {
      const job = await createAiStudioJob({
        brandProfileId,
        provider: values.provider,
        medium: values.medium,
        prompt: values.prompt.trim(),
        negativePrompt: values.negativePrompt?.trim() || undefined,
        templateId: values.templateId ?? undefined,
        aspectRatio: values.aspectRatio ?? undefined,
        durationSeconds: values.durationSeconds,
        guidanceScale: values.guidanceScale,
        seed: values.seed,
      });
      setJobs((prev) => upsertJob(prev, job));
      setLoadErrors((current) => {
        if (!current.jobs) {
          return current;
        }
        const { jobs: _jobs, ...rest } = current;
        return rest;
      });
      setExpandedJobId(job.id);
      showToast({
        title: "Generation queued",
        description: `${PROVIDERS[job.provider].label} is spinning up your ${job.medium}.`,
        variant: "success",
      });
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Unable to queue generation job right now.";
      showToast({
        title: "Failed to queue generation",
        description: message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  async function handleRefreshJobs() {
    setIsRefreshing(true);
    try {
      const refreshed = await listAiStudioJobs({ brandProfileId, limit: 25 });
      setJobs(sortJobs(refreshed));
      setLoadErrors((current) => {
        if (!current.jobs) {
          return current;
        }
        const { jobs: _jobs, ...rest } = current;
        return rest;
      });
      showToast({
        title: "Job list refreshed",
        variant: "success",
      });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : undefined;
      showToast({
        title: "Unable to refresh jobs",
        description: message,
        variant: "error",
      });
      setLoadErrors((current) => ({
        ...current,
        jobs: message ?? "Unable to refresh jobs.",
      }));
    } finally {
      setIsRefreshing(false);
    }
  }

  function toggleArtifactSelection(jobId: string, artifactId: string, checked: boolean) {
    setSelectedArtifacts((prev) => {
      const current = new Set(prev[jobId] ?? []);
      if (checked) {
        current.add(artifactId);
      } else {
        current.delete(artifactId);
      }
      return {
        ...prev,
        [jobId]: Array.from(current),
      };
    });
  }

  async function handleSaveArtifacts(job: AiStudioJob) {
    const selected = selectedArtifacts[job.id] ?? [];
    if (selected.length === 0) {
      showToast({
        title: "No assets selected",
        description: "Choose at least one output to add to your brand library.",
        variant: "info",
      });
      return;
    }

    setSavingJobId(job.id);
    try {
      for (const artifactId of selected) {
        const artifact = job.artifacts.find((item) => item.id === artifactId);
        if (!artifact) continue;
        const file = await downloadArtifactAsFile(artifact);
        await uploadCreativeAsset(brandProfileId, "ai-studio", file);
      }

      showToast({
        title: "Assets saved",
        description: `Uploaded ${selected.length} file${selected.length > 1 ? "s" : ""} to ${brandName}.`,
        variant: "success",
      });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unable to upload media to Supabase.";
      showToast({
        title: "Upload failed",
        description: message,
        variant: "error",
      });
    } finally {
      setSavingJobId(null);
    }
  }

  const templateFilter: TemplateFilter = React.useMemo(
    () => ({ provider, medium }),
    [provider, medium]
  );

  return (
    <div className="space-y-6">
      <Flex direction="column" gap="2">
        <Heading size="6" className="text-white">Creative Studio</Heading>
        <Text color="gray">
          Generate production-ready media for <span className="text-white font-medium">{brandName}</span>.
        </Text>
      </Flex>

      {hasLoadErrors ? (
        <Callout.Root color="red" variant="surface">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            We couldn’t reach parts of the studio services.
            {loadErrors.templates ? (
              <>
                {" "}
                Templates: {loadErrors.templates}
              </>
            ) : null}
            {loadErrors.jobs ? (
              <>
                {" "}
                Jobs: {loadErrors.jobs}
              </>
            ) : null}
          </Callout.Text>
        </Callout.Root>
      ) : null}

      <Callout.Root color="blue" variant="surface">
        <Callout.Icon>
          <LightningBoltIcon />
        </Callout.Icon>
        <Callout.Text>
          Outputs automatically inherit your brand palette and typography wherever possible. Save completed renders to sync them with your brand library.
        </Callout.Text>
      </Callout.Root>

      <div className="grid gap-5 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="flex flex-col gap-5">
              <Flex direction="column" gap="1">
                <Text color="gray" size="2">Provider</Text>
                <SegmentedControl.Root
                  value={provider}
                  onValueChange={(value) => form.setValue("provider", value as AiStudioProvider, { shouldDirty: true })}
                  className="bg-white/5"
                >
                  {Object.entries(PROVIDERS).map(([key, descriptor]) => (
                    <SegmentedControl.Item key={key} value={key}>
                      <Flex align="center" gap="2">
                        <Badge color="gray">{descriptor.label}</Badge>
                      </Flex>
                    </SegmentedControl.Item>
                  ))}
                </SegmentedControl.Root>
                <Text size="1" color="gray">
                  {PROVIDERS[provider].description}
                </Text>
              </Flex>

              <Flex direction="column" gap="1">
                <Text color="gray" size="2">Medium</Text>
                <SegmentedControl.Root
                  value={medium}
                  onValueChange={(value) => form.setValue("medium", value as AiStudioMedium, { shouldDirty: true })}
                  className="bg-white/5"
                >
                  {PROVIDERS[provider].mediums.map((item) => (
                    <SegmentedControl.Item key={item} value={item}>
                      <Flex align="center" gap="2">
                        {item === "image" ? <StarIcon /> : <RocketIcon />}
                        <Text size="2" weight="medium" className="capitalize">{item}</Text>
                      </Flex>
                    </SegmentedControl.Item>
                  ))}
                </SegmentedControl.Root>
              </Flex>

              <Flex direction="column" gap="2">
                <Flex align="center" justify="between">
                  <Text color="gray" size="2">Prompt</Text>
                  <Tooltip content="Describe the visual story to render. Keep it specific and on-brand.">
                    <IconButton size="1" variant="ghost">
                      <MagicWandIcon />
                    </IconButton>
                  </Tooltip>
                </Flex>
                <TextArea
                  {...form.register("prompt")}
                  rows={6}
                  placeholder="E.g. Hyperreal product shot of the Continuum AI interface on a floating glass panel..."
                />
                {form.formState.errors.prompt ? (
                  <Text size="1" color="red">{form.formState.errors.prompt.message}</Text>
                ) : null}
              </Flex>

              <Flex direction="column" gap="1">
                <Text color="gray" size="2">Negative prompt</Text>
                <TextField.Root
                  {...form.register("negativePrompt")}
                  placeholder="Things to avoid (optional)."
                />
              </Flex>

              <Grid columns={{ initial: "1", sm: "2" }} gap="3">
                <Flex direction="column" gap="1">
                  <Text color="gray" size="2">Aspect Ratio</Text>
                  <SegmentedControl.Root
                    value={form.watch("aspectRatio") ?? "16:9"}
                    onValueChange={(value) => form.setValue("aspectRatio", value, { shouldDirty: true })}
                    className="bg-white/5"
                  >
                    {KNOWN_ASPECT_RATIOS.map((ratio) => (
                      <SegmentedControl.Item key={ratio} value={ratio}>
                        <Text size="2">{ratio}</Text>
                      </SegmentedControl.Item>
                    ))}
                  </SegmentedControl.Root>
                </Flex>

                <Flex direction="column" gap="1">
                  <Text color="gray" size="2">Duration (sec)</Text>
                  <TextField.Root
                    type="number"
                    min={1}
                    max={120}
                    placeholder={medium === "video" ? "Up to 120s" : "—"}
                    disabled={medium !== "video"}
                    {...form.register("durationSeconds", { valueAsNumber: true })}
                  />
                </Flex>

                <Flex direction="column" gap="1">
                  <Text color="gray" size="2">Guidance scale</Text>
                  <TextField.Root
                    type="number"
                    step={0.5}
                    min={0}
                    max={20}
                    placeholder="Default"
                    {...form.register("guidanceScale", { valueAsNumber: true })}
                  />
                </Flex>

                <Flex direction="column" gap="1">
                  <Text color="gray" size="2">Seed</Text>
                  <TextField.Root
                    type="number"
                    min={0}
                    placeholder="Random"
                    {...form.register("seed", { valueAsNumber: true })}
                  />
                </Flex>
              </Grid>

              {form.formState.errors.aspectRatio ? (
                <Text size="1" color="red">{form.formState.errors.aspectRatio.message}</Text>
              ) : null}

              <Flex align="center" gap="3">
                <Button type="submit" size="3" disabled={isSubmitting}>
                  <MagicWandIcon />
                  {isSubmitting ? "Generating..." : "Generate media"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => form.reset()}
                  disabled={isSubmitting}
                >
                  Reset
                </Button>
              </Flex>
            </form>
          </Card>
        </div>

        <div>
          <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10 h-full">
            <Flex direction="column" gap="4">
              <Flex align="center" justify="between">
                <Heading size="4" className="text-white flex items-center gap-2">
                  <StackIcon />
                  Templates
                </Heading>
                {templateId ? (
                  <Button size="1" variant="ghost" onClick={handleTemplateClear}>
                    Clear
                  </Button>
                ) : null}
              </Flex>
              {filteredTemplates.length === 0 ? (
                loadErrors.templates ? (
                  <Callout.Root color="red" variant="soft">
                    <Callout.Icon>
                      <ExclamationTriangleIcon />
                    </Callout.Icon>
                    <Callout.Text>{loadErrors.templates}</Callout.Text>
                  </Callout.Root>
                ) : (
                  <Callout.Root color="gray" variant="soft">
                    <Callout.Icon>
                      <ExclamationTriangleIcon />
                    </Callout.Icon>
                    <Callout.Text>
                      No templates yet for {PROVIDERS[provider].label} {medium}. Create your own prompt and save it as a favorite once you like the result.
                    </Callout.Text>
                  </Callout.Root>
                )
              ) : (
                <ScrollArea className="max-h-[520px] pr-2">
                  <Flex direction="column" gap="3">
                    {filteredTemplates.map((template) => {
                      const isActive = template.id === templateId;
                      return (
                        <Card
                          key={template.id}
                          className={`transition-all border ${isActive ? "border-blue-500/60 shadow-lg shadow-blue-500/20" : "border-white/10 hover:border-white/30"}`}
                          onClick={() => handleTemplateSelect(template)}
                        >
                          <Flex direction="column" gap="2" p="3">
                            <Flex align="center" justify="between">
                              <Heading size="3" className="text-white">{template.name}</Heading>
                              {isActive ? (
                                <Badge color="blue" size="1">
                                  Active
                                </Badge>
                              ) : null}
                            </Flex>
                            {template.description ? (
                              <Text color="gray" size="2">{template.description}</Text>
                            ) : null}
                            {template.tags && template.tags.length > 0 ? (
                              <Flex wrap="wrap" gap="2">
                                {template.tags.map((tag) => (
                                  <Badge key={tag} size="1" variant="soft">
                                    {tag}
                                  </Badge>
                                ))}
                              </Flex>
                            ) : null}
                          </Flex>
                        </Card>
                      );
                    })}
                  </Flex>
                </ScrollArea>
              )}
            </Flex>
          </Card>
        </div>
      </div>

      <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
        <Flex direction="column" gap="4">
          <Flex align="center" justify="between">
            <Flex align="center" gap="2">
              <Heading size="4" className="text-white">
                Recent jobs
              </Heading>
              <Badge color="gray" size="1">
                {jobs.length}
              </Badge>
            </Flex>
            <Button
              variant="outline"
              size="2"
              onClick={handleRefreshJobs}
              disabled={isRefreshing}
            >
              <ReloadIcon />
              Refresh
            </Button>
          </Flex>

          <Flex direction="column" gap="3">
            {jobs.length === 0 ? (
              loadErrors.jobs ? (
                <Callout.Root color="red" variant="soft">
                  <Callout.Icon>
                    <ExclamationTriangleIcon />
                  </Callout.Icon>
                  <Callout.Text>{loadErrors.jobs}</Callout.Text>
                </Callout.Root>
              ) : (
                <Card className="bg-white/5 border border-white/10">
                  <Flex direction="column" gap="2" p="4" align="center">
                    <MagicWandIcon className="h-6 w-6 text-blue-500" />
                    <Heading size="3" className="text-white">No jobs yet</Heading>
                    <Text color="gray" size="2">
                      Start by crafting a prompt and sending your first job to the studio.
                    </Text>
                  </Flex>
                </Card>
              )
            ) : (
              jobs.map((job) => {
                const statusMeta = JOB_STATUS_META[job.status];
                const isExpanded = expandedJobId === job.id;
                const artifacts = job.artifacts ?? [];
                const selected = new Set(selectedArtifacts[job.id] ?? []);
                return (
                  <Card
                    key={job.id}
                    className={`border transition-all ${isExpanded ? "border-blue-500/60 shadow-blue-500/20 shadow-lg" : "border-white/10 hover:border-white/30"}`}
                  >
                    <Flex direction="column" gap="3" p="4">
                      <Flex align="start" justify="between" gap="3">
                        <Flex direction="column" gap="1">
                          <Flex gap="2" align="center">
                            <Badge color={statusMeta.color} size="1">
                              <Flex align="center" gap="1">
                                {statusMeta.icon}
                                <span>{statusMeta.label}</span>
                              </Flex>
                            </Badge>
                            <Badge variant="soft" size="1">
                              {PROVIDERS[job.provider].label}
                            </Badge>
                            <Badge variant="soft" size="1" color={job.medium === "video" ? "blue" : "gray"}>
                              {job.medium}
                            </Badge>
                          </Flex>
                          <Text size="3" className="text-white">
                            {job.prompt}
                          </Text>
                          <Text size="1" color="gray">
                            Requested {formatDate(job.createdAt)} • Job ID {job.id}
                          </Text>
                        </Flex>
                        <Flex align="center" gap="2">
                          <Button
                            variant="ghost"
                            size="2"
                            onClick={() => setExpandedJobId((current) => (current === job.id ? null : job.id))}
                          >
                            {isExpanded ? "Hide details" : "View details"}
                          </Button>
                        </Flex>
                      </Flex>

                      {isExpanded ? (
                        <>
                          <Separator className="bg-white/10" />
                          {job.failure ? (
                            <Callout.Root color="red" variant="soft">
                              <Callout.Icon>
                                <ExclamationTriangleIcon />
                              </Callout.Icon>
                              <Callout.Text>
                                {job.failure.message}
                              </Callout.Text>
                            </Callout.Root>
                          ) : null}

                          {artifacts.length === 0 ? (
                            <Text color="gray" size="2">
                              No outputs yet. Check back once the job finishes.
                            </Text>
                          ) : (
                            <Flex direction="column" gap="3">
                              <Heading size="3" className="text-white">
                                Outputs
                              </Heading>
                              <Grid columns={{ initial: "1", md: "2", xl: "3" }} gap="3">
                                {artifacts.map((artifact) => {
                                  const previewSource = getArtifactPreviewSource(artifact);
                                  const isImage = artifact.medium === "image";
                                  const isSelected = selected.has(artifact.id);
                                  return (
                                    <Card
                                      key={artifact.id}
                                      className={`border ${isSelected ? "border-blue-500/60" : "border-white/10"}`}
                                    >
                                      <Flex direction="column" gap="2" p="3">
                                        <div className="relative overflow-hidden rounded-lg bg-black/40">
                                          {isImage ? (
                                            <img
                                              src={previewSource}
                                              alt={artifact.fileName ?? artifact.id}
                                              className="w-full h-48 object-cover"
                                            />
                                          ) : (
                                            <video
                                              src={previewSource}
                                              controls
                                              className="w-full h-48 object-cover"
                                            />
                                          )}
                                        </div>
                                        <Flex align="center" justify="between">
                                          <Flex align="center" gap="2">
                                            <Checkbox
                                              checked={isSelected}
                                              onCheckedChange={(checked) =>
                                                toggleArtifactSelection(job.id, artifact.id, Boolean(checked))
                                              }
                                              size="2"
                                              aria-label={`Select artifact ${artifact.fileName ?? artifact.id}`}
                                            />
                                            <Text size="2">Select</Text>
                                          </Flex>
                                          <Text size="1" color="gray">
                                            {artifact.fileName ?? artifact.id}
                                          </Text>
                                        </Flex>
                                      </Flex>
                                    </Card>
                                  );
                                })}
                              </Grid>
                              <Flex align="center" gap="3">
                                <Button
                                  size="2"
                                  variant="solid"
                                  onClick={() => handleSaveArtifacts(job)}
                                  disabled={savingJobId === job.id || job.status !== "completed"}
                                >
                                  <DownloadIcon />
                                  {savingJobId === job.id ? "Saving..." : "Save to brand library"}
                                </Button>
                                <Text size="1" color="gray">
                                  Saved files will land in <span className="text-white font-medium">ai-studio/</span> for {brandName}.
                                </Text>
                              </Flex>
                            </Flex>
                          )}
                        </>
                      ) : null}
                    </Flex>
                  </Card>
                );
              })
            )}
          </Flex>
        </Flex>
      </Card>
    </div>
  );
}


