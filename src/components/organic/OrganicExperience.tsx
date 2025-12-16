"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Text,
  TextArea,
  TextField,
  Switch,
} from "@radix-ui/themes";
import {
  Controller,
  type Control,
  type FieldErrors,
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";

import { useToast } from "@/components/ui/ToastProvider";
import { CreativeAssetLibrary } from "@/components/creative-assets";
import {
  ORGANIC_PLATFORM_KEYS,
  type OrganicPlatformKey,
} from "@/lib/organic/platforms";
import type { CreativeAssetDragPayload } from "@/lib/creative-assets/drag";
import { createSignedAssetUrl } from "@/lib/creative-assets/storageClient";
import type {
  ContentGridRow,
  DailyDetailsRequestPayload,
  DetailedPostTemplate,
  GenerationRequestPayload,
  WeeklyGrid,
} from "@/lib/organic/types";
import {
  detailedPostTemplateSchema,
  weeklyGridSchema,
} from "@/lib/organic/types";
import { WeeklyGridEditor } from "./WeeklyGridEditor";
import { DailyTemplatesPanel } from "./DailyTemplatesPanel";
import { PromptSelector } from "./PromptSelector";
import { TrendSelector } from "./TrendSelector";
import type { PostingState } from "./types";
import type { PromptDefinition, PromptFormValue } from "@/lib/organic/prompts";
import { promptFormValueSchema, toPromptFormValue } from "@/lib/organic/prompts";
import { useOrganicPromptLibrary, type PromptInput } from "@/lib/organic/usePromptLibrary";
import { type Trend } from "@/lib/organic/trends";

type OrganicPlatformAccount = {
  platform: OrganicPlatformKey;
  label: string;
  connected: boolean;
  accountId: string | null;
};

type OrganicExperienceProps = {
  brandName: string;
  brandDescription: string;
  platformAccounts: OrganicPlatformAccount[];
  brandProfileId: string;
  trends: Trend[];
};

type ProgressEntry = {
  status: string;
  message?: string | null;
  at: string;
};

type GridState = {
  progress: ProgressEntry[];
  gridError: string | null;
  weeklyGrid: WeeklyGrid | null;
  isGeneratingGrid: boolean;
};

type DailyState = {
  dailyTemplates: DetailedPostTemplate[];
  postingState: PostingState;
  isGeneratingDetails: boolean;
};

const PLAN_STORAGE_KEY = "continuum.organic.plan";

type GridActions = {
  submit: (payload: GenerationRequestPayload) => Promise<void>;
  reset: () => void;
  setGrid: (grid: WeeklyGrid) => void;
};

type DailyActions = {
  generateDetails: (payload: DailyDetailsRequestPayload) => Promise<void>;
  togglePostReady: (dayPlatform: string, ready: boolean) => void;
  updateSchedule: (dayPlatform: string, scheduledAt: string) => void;
  attachMedia: (dayPlatform: string, url: string) => void;
  reset: () => void;
};

const GRID_INITIAL_STATE: GridState = {
  progress: [],
  gridError: null,
  weeklyGrid: null,
  isGeneratingGrid: false,
};

const DAILY_INITIAL_STATE: DailyState = {
  dailyTemplates: [],
  postingState: {},
  isGeneratingDetails: false,
};

type GridAction =
  | { type: "reset" }
  | { type: "start" }
  | { type: "progress"; status: string; message?: string | null }
  | { type: "complete"; grid: WeeklyGrid }
  | { type: "error"; message: string }
  | { type: "setGrid"; grid: WeeklyGrid };

function gridReducer(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case "reset":
      return GRID_INITIAL_STATE;
    case "start":
      return {
        ...state,
        progress: [],
        gridError: null,
        weeklyGrid: null,
        isGeneratingGrid: true,
      };
    case "progress":
      return {
        ...state,
        progress: [
          ...state.progress,
          {
            status: action.status,
            message: action.message ?? null,
            at: new Date().toISOString(),
          },
        ],
      };
    case "complete":
      return {
        ...state,
        weeklyGrid: action.grid,
        isGeneratingGrid: false,
      };
    case "error":
      return {
        ...state,
        isGeneratingGrid: false,
        gridError: action.message,
      };
    case "setGrid":
      return {
        ...state,
        weeklyGrid: action.grid,
      };
    default:
      return state;
  }
}

type DailyAction =
  | { type: "reset" }
  | { type: "start" }
  | { type: "append"; template: DetailedPostTemplate }
  | { type: "ready"; dayPlatform: string; ready: boolean }
  | { type: "schedule"; dayPlatform: string; scheduledAt: string }
  | { type: "attach"; dayPlatform: string; url: string }
  | { type: "finish" }
  | { type: "error" };

function dailyReducer(state: DailyState, action: DailyAction): DailyState {
  switch (action.type) {
    case "reset":
      return DAILY_INITIAL_STATE;
    case "start":
      return {
        dailyTemplates: [],
        postingState: {},
        isGeneratingDetails: true,
      };
    case "append":
      return {
        ...state,
        dailyTemplates: [...state.dailyTemplates, action.template],
      };
    case "ready":
      return {
        ...state,
        postingState: {
          ...state.postingState,
          [action.dayPlatform]: {
            ready: action.ready,
            scheduledAt: state.postingState[action.dayPlatform]?.scheduledAt ?? "",
          },
        },
      };
    case "schedule":
      return {
        ...state,
        postingState: {
          ...state.postingState,
          [action.dayPlatform]: {
            ready: state.postingState[action.dayPlatform]?.ready ?? false,
            scheduledAt: action.scheduledAt,
          },
        },
      };
    case "attach":
      return {
        ...state,
        dailyTemplates: state.dailyTemplates.map((template) =>
          template.day_platform === action.dayPlatform
            ? {
                ...template,
                media_url: action.url,
                media_urls: [action.url],
              }
            : template
        ),
      };
    case "finish":
      return {
        ...state,
        isGeneratingDetails: false,
      };
    case "error":
      return {
        ...state,
        dailyTemplates: [],
        isGeneratingDetails: false,
      };
    default:
      return state;
  }
}

const LANGUAGE_VALUES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
] as const;

type SupportedLanguage = (typeof LANGUAGE_VALUES)[number];

const LANGUAGE_OPTIONS: Array<{ value: SupportedLanguage; label: string }> =
  LANGUAGE_VALUES.map((value) => ({ value, label: value }));

const PROMPT_PRESETS = [
  {
    id: "seasonal",
    label: "Seasonal Moment",
    prompt:
      "Plan a week of posts celebrating an upcoming seasonal event for our brand.",
  },
  {
    id: "product-launch",
    label: "Product Launch",
    prompt:
      "Create a 7-day organic content plan that builds excitement for a new product launch with daily teasers.",
  },
  {
    id: "community",
    label: "Community Spotlight",
    prompt:
      "Generate a weekly plan highlighting community stories, user-generated content, and engagement prompts.",
  },
  {
    id: "educational",
    label: "Educational Series",
    prompt:
      "Design a week of educational posts that share tips, how-tos, and thought leadership aligned to our brand.",
  },
] as const;

const platformFieldSchema = z.object({
  enabled: z.boolean(),
  accountId: z.string().trim().optional(),
});

const formSchema = z
  .object({
    language: z.enum(LANGUAGE_VALUES),
    userPrompt: z.string().min(1, "Enter a prompt or choose a preset"),
    generationPrompt: z
      .string()
      .trim()
      .optional()
      .refine(
        (value) => (value ? value.length <= 600 : true),
        "Additional context must be under 600 characters."
      ),
    platforms: z.object(
      ORGANIC_PLATFORM_KEYS.reduce(
        (shape, key) => {
          shape[key] = platformFieldSchema;
          return shape;
        },
        {} as Record<OrganicPlatformKey, typeof platformFieldSchema>
      )
    ),
    selectedTrendIds: z.array(z.string()).max(5).default([]),
    prompt: promptFormValueSchema,
  })
  .superRefine((value, ctx) => {
    const selected = Object.entries(value.platforms).filter(
      ([, config]) => config.enabled
    );
    if (selected.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platforms"],
        message: "Select at least one platform.",
      });
      return;
    }
    for (const [platform, config] of selected) {
      if (!config.accountId || config.accountId.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["platforms", platform, "accountId"],
          message: "Account id is required when enabled.",
        });
      }
    }
  });

type FormInputValues = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

export function OrganicExperience({
  brandDescription,
  brandName,
  platformAccounts,
  brandProfileId,
  trends,
}: OrganicExperienceProps) {
  const { show } = useToast();
  const promptLibrary = useOrganicPromptLibrary(brandProfileId);
  const { prompts, addCustomPrompt, removeCustomPrompt, defaultPrompt } = promptLibrary;
  const activePlatforms = useMemo(
    () =>
      platformAccounts
        .filter((account) => account.connected && account.accountId)
        .map((account) => account.platform),
    [platformAccounts]
  );

  const { form, applyPromptPreset, resetForm } = useOrganicForm(platformAccounts, defaultPrompt);
  const grid = useGridGeneration(show);
  const details = useDailyDetails(show);
  const copyCaption = useCopyCaption(show);
  const attachMediaToTemplate = details.actions.attachMedia;
  const togglePostReadyAction = details.actions.togglePostReady;
  const updateScheduleAction = details.actions.updateSchedule;
  const generateDetailsAction = details.actions.generateDetails;
  const resetDetails = details.actions.reset;
  const submitGrid = grid.actions.submit;
  const resetGrid = grid.actions.reset;
  const setServerGrid = grid.actions.setGrid;
  const [isEditingGrid, setIsEditingGrid] = useState(false);
  const [draftGrid, setDraftGrid] = useState<ContentGridRow[]>([]);

  useEffect(() => {
    if (grid.state.weeklyGrid) {
      setDraftGrid(grid.state.weeklyGrid.grid.map((row) => ({ ...row })));
    } else {
      setDraftGrid([]);
      setIsEditingGrid(false);
    }
  }, [grid.state.weeklyGrid]);

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      const payload = buildGenerationPayload(values);
      await submitGrid(payload);
      resetDetails();
    },
    [resetDetails, submitGrid]
  );

  const handleGenerateDetails = useCallback(async () => {
    if (!grid.state.weeklyGrid) return;
    const payload = buildDailyDetailsPayload(
      form.getValues(),
      grid.state.weeklyGrid
    );
    if (!payload) {
      show({
        title: "Select platforms",
        description: "Enable at least one platform to generate templates.",
        variant: "warning",
      });
      return;
    }
    await generateDetailsAction(payload);
  }, [generateDetailsAction, form, grid.state.weeklyGrid, show]);

  const handleReset = useCallback(() => {
    resetGrid();
    resetDetails();
    resetForm();
  }, [resetForm, resetDetails, resetGrid]);

  const language = form.watch("language");

  const handleAssetDrop = useCallback(
    async (payload: CreativeAssetDragPayload, template: DetailedPostTemplate) => {
      try {
        const signedUrl = await createSignedAssetUrl(payload.path, 300);
        attachMediaToTemplate(template.day_platform, signedUrl);
        show({
          title: "Asset attached",
          description: `${payload.name} linked to ${template.day_platform}.`,
          variant: "success",
        });
      } catch (error) {
        show({
          title: "Failed to attach asset",
          description: (error as Error)?.message ?? "Could not create access link.",
          variant: "error",
        });
      }
    },
    [attachMediaToTemplate, show]
  );

  const handleStartGridEditing = useCallback(() => {
    if (!grid.state.weeklyGrid) return;
    setDraftGrid(grid.state.weeklyGrid.grid.map((row) => ({ ...row })));
    setIsEditingGrid(true);
  }, [grid.state.weeklyGrid]);

  const handleCancelGridEditing = useCallback(() => {
    if (grid.state.weeklyGrid) {
      setDraftGrid(grid.state.weeklyGrid.grid.map((row) => ({ ...row })));
    } else {
      setDraftGrid([]);
    }
    setIsEditingGrid(false);
  }, [grid.state.weeklyGrid]);

  const handleGridFieldChange = useCallback(
    (index: number, key: keyof ContentGridRow, value: string) => {
      setDraftGrid((current) =>
        current.map((row, rowIndex) => {
          if (rowIndex !== index) return row;
          const next: ContentGridRow = { ...row };
          if (key === "num_slides") {
            const trimmed = value.trim();
            next.num_slides = trimmed.length === 0 || Number.isNaN(Number(trimmed)) ? undefined : Number(trimmed);
            return next;
          }
          (next as Record<string, unknown>)[key as string] = value;
          return next;
        })
      );
    },
    []
  );

  const handleSaveGridEdits = useCallback(() => {
    if (!grid.state.weeklyGrid) return;
    try {
      const parsed = weeklyGridSchema.parse({ grid: draftGrid });
      setServerGrid(parsed);
      setDraftGrid(parsed.grid.map((row) => ({ ...row })));
      setIsEditingGrid(false);
      show({ title: "Grid updated", variant: "success" });
    } catch (error) {
      show({
        title: "Invalid grid edits",
        description: (error as Error)?.message ?? "Please review your changes.",
        variant: "error",
      });
    }
  }, [draftGrid, grid.state.weeklyGrid, setServerGrid, show]);

  const handleSavePlan = useCallback(() => {
    if (!grid.state.weeklyGrid) return;
    const storageKey = `${PLAN_STORAGE_KEY}:${brandProfileId}`;
    const formValues = form.getValues();
    const payload = {
      weeklyGrid: grid.state.weeklyGrid,
      dailyTemplates: details.state.dailyTemplates,
      userPrompt: formValues.userPrompt,
      generationPrompt: formValues.generationPrompt,
      language: formValues.language,
      prompt: formValues.prompt,
      selectedTrendIds: formValues.selectedTrendIds,
    };
    const json = JSON.stringify(payload, null, 2);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, json);
      }
    } catch {
      // ignore storage failures
    }
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `continuum-organic-plan-${new Date().toISOString()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // ignore download failures
    }
    show({ title: "Plan saved", description: "JSON exported to your device.", variant: "success" });
  }, [brandProfileId, details.state.dailyTemplates, form, grid.state.weeklyGrid, show]);

  return (
    <Flex
      direction={{ initial: "column", xl: "row" }}
      gap="6"
      align="start"
    >
      <Flex direction="column" gap="5" className="flex-1">
        <HeroCard
          brandName={brandName}
          brandDescription={brandDescription}
        />

        <GenerationForm
          form={form}
          platformAccounts={platformAccounts}
          gridError={grid.state.gridError}
          isGeneratingGrid={grid.state.isGeneratingGrid}
          onSubmit={handleSubmit}
          onReset={handleReset}
          onPromptPreset={applyPromptPreset}
          prompts={prompts}
          onCreatePrompt={addCustomPrompt}
          onDeletePrompt={removeCustomPrompt}
          trends={trends}
          activePlatforms={activePlatforms}
          maxTrendSelections={5}
        />

        <ProgressTimeline entries={grid.state.progress} />

        {grid.state.weeklyGrid ? (
          <WeeklyGridEditor
            grid={grid.state.weeklyGrid}
            draftGrid={draftGrid}
            isEditing={isEditingGrid}
            isGeneratingDetails={details.state.isGeneratingDetails}
            onGenerateDetails={handleGenerateDetails}
            onStartEdit={handleStartGridEditing}
            onCancelEdit={handleCancelGridEditing}
            onSaveEdit={handleSaveGridEdits}
            onSavePlan={handleSavePlan}
            onFieldChange={handleGridFieldChange}
          />
        ) : (
          <EmptyState />
        )}

        {details.state.dailyTemplates.length > 0 && (
          <DailyTemplatesPanel
            templates={details.state.dailyTemplates}
            postingState={details.state.postingState}
            language={language}
            onCopyCaption={copyCaption}
            onToggleReady={togglePostReadyAction}
            onScheduleChange={updateScheduleAction}
            onAssetDrop={handleAssetDrop}
          />
        )}
      </Flex>
      <Box className="w-full flex-shrink-0 xl:w-[400px]">
        <CreativeAssetLibrary brandProfileId={brandProfileId} />
      </Box>
    </Flex>
  );
}

function useOrganicForm(
  platformAccounts: OrganicPlatformAccount[],
  defaultPrompt: PromptFormValue
): {
  form: UseFormReturn<FormInputValues, unknown, FormValues>;
  applyPromptPreset: (prompt: string) => void;
  resetForm: () => void;
} {
  const form = useForm<FormInputValues, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: makeDefaultValues(platformAccounts, defaultPrompt),
  });

  const applyPromptPreset = useCallback(
    (prompt: string) => {
      form.setValue("userPrompt", prompt, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    [form]
  );

  const resetForm = useCallback(() => {
    form.reset(makeDefaultValues(platformAccounts, defaultPrompt));
  }, [defaultPrompt, form, platformAccounts]);

  return { form, applyPromptPreset, resetForm };
}

function useGridGeneration(show: ReturnType<typeof useToast>["show"]): {
  state: GridState;
  actions: GridActions;
} {
  const [state, dispatch] = useReducer(gridReducer, GRID_INITIAL_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);

  const cleanupStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const appendProgress = useCallback((status: string, message?: string | null) => {
    dispatch({ type: "progress", status, message });
  }, []);

  const handleComplete = useCallback(
    (grid: WeeklyGrid) => {
      cleanupStream();
      dispatch({ type: "complete", grid });
      appendProgress("complete", "Weekly grid ready.");
      show({
        title: "Content plan ready",
        description: "Review the seven-day plan before generating post details.",
        variant: "success",
      });
    },
    [appendProgress, cleanupStream, show]
  );

  const handleError = useCallback(
    (message: string) => {
      cleanupStream();
      dispatch({ type: "error", message });
      appendProgress("error", message);
      show({ title: "Generation failed", description: message, variant: "error" });
    },
    [appendProgress, cleanupStream, show]
  );

  const startStream = useCallback(
    (jobId: string) => {
      cleanupStream();
      const source = new EventSource(
        `/api/organic/generate-grid/events?job_id=${encodeURIComponent(jobId)}`
      );
      eventSourceRef.current = source;

      source.addEventListener("progress", (event) => {
        const payload = safeJson((event as MessageEvent).data);
        const message =
          (payload as { message?: string; detail?: string })?.message ??
          (payload as { detail?: string })?.detail ??
          null;
        const status = (payload as { status?: string })?.status ?? "progress";
        appendProgress(status, message);
      });

      source.addEventListener("complete", (event) => {
        const payload = safeJson((event as MessageEvent).data);
        const parsed = weeklyGridSchema.safeParse(
          (payload as { grid?: unknown; weekly_grid?: unknown })?.grid ??
            (payload as { weekly_grid?: unknown })?.weekly_grid ??
            payload
        );
        if (parsed.success) {
          handleComplete(parsed.data);
        } else {
          handleError("Received an invalid grid from the generation service.");
        }
      });

      source.addEventListener("error", (event) => {
        const payload = safeJson((event as MessageEvent).data);
        const message =
          (payload as { message?: string })?.message ??
          (payload as { error?: string })?.error ??
          (payload as { detail?: string })?.detail ??
          "An internal error occurred during content generation.";
        handleError(message);
      });

      source.onerror = () => {
        handleError("The generation stream closed unexpectedly.");
      };
    },
    [appendProgress, cleanupStream, handleComplete, handleError]
  );

  const submit = useCallback(
    async (payload: GenerationRequestPayload) => {
      dispatch({ type: "start" });
      try {
        const jobId = await queueGridJob(payload);
        appendProgress("queued", "Queued content generation job.");
        startStream(jobId);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to start the organic content job.";
        handleError(message);
      }
    },
    [appendProgress, handleError, startStream]
  );

  const reset = useCallback(() => {
    cleanupStream();
    dispatch({ type: "reset" });
  }, [cleanupStream]);

  const setGrid = useCallback((grid: WeeklyGrid) => {
    dispatch({ type: "setGrid", grid });
  }, []);

  return {
    state,
    actions: { submit, reset, setGrid },
  };
}

function useDailyDetails(show: ReturnType<typeof useToast>["show"]): {
  state: DailyState;
  actions: DailyActions;
} {
  const abortRef = useRef<AbortController | null>(null);
  const [state, dispatch] = useReducer(dailyReducer, DAILY_INITIAL_STATE);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const togglePostReady = useCallback((dayPlatform: string, ready: boolean) => {
    dispatch({ type: "ready", dayPlatform, ready });
  }, []);

  const updateSchedule = useCallback(
    (dayPlatform: string, scheduledAt: string) => {
      dispatch({ type: "schedule", dayPlatform, scheduledAt });
    },
    []
  );

  const attachMedia = useCallback((dayPlatform: string, url: string) => {
    dispatch({ type: "attach", dayPlatform, url });
  }, []);

  const generateDetails = useCallback(
    async (payload: DailyDetailsRequestPayload) => {
      reset();
      const controller = new AbortController();
      abortRef.current = controller;
      dispatch({ type: "start" });
      try {
        await requestDailyTemplates(payload, controller.signal, (template) => {
          dispatch({ type: "append", template });
        });
        show({
          title: "Post templates ready",
          description: "Review each day’s scripts, captions, and hashtags.",
          variant: "success",
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate detailed content.";
        show({
          title: "Template generation failed",
          description: message,
          variant: "error",
        });
        dispatch({ type: "error" });
      } finally {
        dispatch({ type: "finish" });
      }
    },
    [reset, show]
  );

  return {
    state,
    actions: {
      generateDetails,
      togglePostReady,
      updateSchedule,
      attachMedia,
      reset,
    },
  };
}

function GenerationForm({
  form,
  platformAccounts,
  gridError,
  isGeneratingGrid,
  onSubmit,
  onReset,
  onPromptPreset,
  prompts,
  onCreatePrompt,
  onDeletePrompt,
  trends,
  activePlatforms,
  maxTrendSelections,
}: {
  form: UseFormReturn<FormInputValues, unknown, FormValues>;
  platformAccounts: OrganicPlatformAccount[];
  gridError: string | null;
  isGeneratingGrid: boolean;
  onSubmit: (values: FormValues) => Promise<void>;
  onReset: () => void;
  onPromptPreset: (prompt: string) => void;
  prompts: PromptDefinition[];
  onCreatePrompt: (input: PromptInput) => PromptDefinition;
  onDeletePrompt: (promptId: string) => void;
  trends: Trend[];
  activePlatforms: OrganicPlatformKey[];
  maxTrendSelections?: number;
}) {
  const {
    control,
    formState: { errors },
    handleSubmit,
    getValues,
    setValue,
  } = form;

  useEffect(() => {
    const current = getValues("prompt");
    if (!prompts.some((prompt) => prompt.id === current?.id)) {
      const fallback = prompts[0];
      if (fallback) {
        setValue("prompt", toPromptFormValue(fallback));
      }
    }
  }, [getValues, prompts, setValue]);

  return (
    <Card>
      <Box p="4">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid columns={{ initial: "1", xl: "2" }} gap="5">
            <Flex direction="column" gap="4">
              <Box>
                <Heading size="4" mb="2">
                  Campaign Objective
                </Heading>
                <Controller
                  name="userPrompt"
                  control={control}
                  render={({ field }) => (
                    <TextArea
                      {...field}
                      rows={4}
                      placeholder="Describe the theme or objective for this week's content."
                    />
                  )}
                />
                {errors.userPrompt?.message && (
                  <Text size="1" color="red">
                    {errors.userPrompt.message}
                  </Text>
                )}
              </Box>
              <PromptPresetList onSelect={onPromptPreset} />
              <Box>
                <Heading size="4" mb="2">
                  Additional Context
                </Heading>
                <Controller
                  name="generationPrompt"
                  control={control}
                  render={({ field }) => (
                    <TextArea
                      {...field}
                      rows={3}
                      placeholder="Optional: share extra notes, brand guardrails, or hero products."
                    />
                  )}
                />
                {errors.generationPrompt?.message && (
                  <Text size="1" color="red">
                    {errors.generationPrompt.message}
                  </Text>
                )}
              </Box>
              <Box>
                <Heading size="4" mb="2">
                  Language
                </Heading>
                <Controller
                  name="language"
                  control={control}
                  render={({ field }) => (
                    <select
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(event.target.value as SupportedLanguage)
                      }
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-gray-700 dark:bg-gray-950"
                    >
                      {LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                />
              </Box>
              <Controller
                name="prompt"
                control={control}
                render={({ field }) => (
                  <PromptSelector
                    prompts={prompts}
                    value={field.value}
                    onChange={(prompt) => field.onChange(toPromptFormValue(prompt))}
                    onCreatePrompt={(input) => {
                      const created = onCreatePrompt(input);
                      field.onChange(toPromptFormValue(created));
                      return created;
                    }}
                    onDeletePrompt={(promptId) => {
                      onDeletePrompt(promptId);
                      const remaining = prompts.filter((prompt) => prompt.id !== promptId);
                      const fallback = remaining[0] ?? prompts[0];
                      if (fallback) {
                        field.onChange(toPromptFormValue(fallback));
                      }
                    }}
                  />
                )}
              />
            </Flex>
            <Flex direction="column" gap="4">
              <Box>
                <Heading size="4" mb="3">
                  Target Platforms
                </Heading>
                <PlatformSelector
                  control={control}
                  errors={errors}
                  platformAccounts={platformAccounts}
                />
              </Box>
              <Controller
                name="selectedTrendIds"
                control={control}
                render={({ field }) => (
                  <TrendSelector
                    trends={trends}
                    selectedTrendIds={field.value ?? []}
                    activePlatforms={activePlatforms}
                    maxSelections={maxTrendSelections}
                    onToggleTrend={(trendId) => {
                      const set = new Set(field.value ?? []);
                      if (set.has(trendId)) {
                        set.delete(trendId);
                      } else {
                        if (typeof maxTrendSelections === "number" && set.size >= maxTrendSelections) {
                          return;
                        }
                        set.add(trendId);
                      }
                      field.onChange(Array.from(set));
                    }}
                  />
                )}
              />
            </Flex>
          </Grid>

          {gridError && (
            <Card mt="4" size="1" style={{ borderColor: "var(--red-8)" }}>
              <Box p="3">
                <Text color="red" size="2" weight="medium">
                  {gridError}
                </Text>
              </Box>
            </Card>
          )}

          <Flex gap="3" justify="end" mt="5">
            <Button type="button" variant="soft" color="gray" onClick={onReset}>
              Reset
            </Button>
            <Button type="submit" disabled={isGeneratingGrid}>
              {isGeneratingGrid ? "Generating…" : "Generate Weekly Grid"}
            </Button>
          </Flex>
        </form>
      </Box>
    </Card>
  );
}

type PlatformSelectorProps = {
  control: Control<FormInputValues, unknown, FormValues>;
  errors: FieldErrors<FormInputValues>;
  platformAccounts: OrganicPlatformAccount[];
};

function PlatformSelector({
  control,
  errors,
  platformAccounts,
}: PlatformSelectorProps) {
  return (
    <Flex direction="column" gap="3">
      {platformAccounts.map((account) => {
        const accountErrors =
          errors.platforms && typeof errors.platforms === "object"
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((errors.platforms as any)[account.platform]?.accountId as {
                message?: string;
              } | undefined)
            : undefined;

        return (
          <Card key={account.platform}>
            <Box p="3">
              <Flex align="center" justify="between" mb="3">
                <Flex direction="column" gap="1">
                  <Text weight="medium">{account.label}</Text>
                  <Text size="1" color="gray">
                    {account.connected
                      ? "Connected account ready for generation."
                      : "Connect this account in onboarding to enable generation."}
                  </Text>
                </Flex>
                <Controller
                  name={`platforms.${account.platform}.enabled`}
                  control={control}
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                      disabled={!account.connected}
                      color="violet"
                    />
                  )}
                />
              </Flex>
              <Controller
                name={`platforms.${account.platform}.accountId`}
                control={control}
                render={({ field }) => (
                  <TextField.Root
                    {...field}
                    placeholder="Account ID"
                    disabled={!account.connected}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                )}
              />
              {accountErrors?.message && (
                <Text size="1" color="red">
                  {accountErrors.message}
                </Text>
              )}
            </Box>
          </Card>
        );
      })}
    </Flex>
  );
}

function PromptPresetList({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <Flex direction="column" gap="2">
      <Text size="2" weight="medium">
        Jump-start with a preset
      </Text>
      <Flex gap="2" wrap="wrap">
        {PROMPT_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant="soft"
            size="1"
            type="button"
            onClick={() => onSelect(preset.prompt)}
          >
            {preset.label}
          </Button>
        ))}
      </Flex>
    </Flex>
  );
}

function ProgressTimeline({ entries }: { entries: ProgressEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card>
      <Box p="4">
        <Heading size="4" mb="3">
          Generation Progress
        </Heading>
        <Flex direction="column" gap="2">
          {entries.map((entry, index) => (
            <Flex key={`${entry.status}-${entry.at}-${index}`} align="center" gap="3">
              <Badge color={badgeColor(entry.status)}>{entry.status}</Badge>
              <Text size="2">{entry.message ?? "Processing…"}</Text>
              <Text size="1" color="gray">
                {new Date(entry.at).toLocaleTimeString()}
              </Text>
            </Flex>
          ))}
        </Flex>
      </Box>
    </Card>
  );
}

function HeroCard({
  brandName,
  brandDescription,
}: {
  brandName: string;
  brandDescription: string;
}) {
  return (
    <Card>
      <Box p="4">
        <Heading size="5">{brandName || "Organic Command Center"}</Heading>
        <Text color="gray" size="2">
          {brandDescription ||
            "Generate cohesive, on-brand content across every channel in a single flow."}
        </Text>
      </Box>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <Box p="4">
        <Heading size="4">Your content plan will appear here</Heading>
        <Text color="gray">
          Configure your platforms and prompt above to create a seven-day organic content plan.
        </Text>
      </Box>
    </Card>
  );
}

function buildGenerationPayload(values: FormValues): GenerationRequestPayload {
  const platformAccountIds = Object.entries(values.platforms).reduce<
    Record<string, string>
  >((acc, [key, config]) => {
    if (config.enabled && config.accountId) {
      acc[key] = config.accountId.trim();
    }
    return acc;
  }, {});
  const normalizedPrompt = {
    id: values.prompt.id,
    name: values.prompt.name,
    description: values.prompt.description?.trim() || undefined,
    content: values.prompt.content.trim(),
    source: values.prompt.source,
  } as GenerationRequestPayload["prompt"];
  return {
    language: values.language,
    userPrompt: values.userPrompt.trim(),
    generationPrompt: values.generationPrompt?.trim() || undefined,
    platformAccountIds: platformAccountIds as GenerationRequestPayload["platformAccountIds"],
    selectedTrendIds: values.selectedTrendIds ?? [],
    prompt: normalizedPrompt,
  };
}

function buildDailyDetailsPayload(
  values: FormInputValues,
  weeklyGrid: WeeklyGrid
): DailyDetailsRequestPayload | null {
  const platformAccountIds = Object.entries(values.platforms).reduce<
    Record<string, string>
  >((acc, [key, config]) => {
    if (config.enabled && config.accountId) {
      acc[key] = config.accountId.trim();
    }
    return acc;
  }, {});
  if (Object.keys(platformAccountIds).length === 0) {
    return null;
  }
  return {
    platformAccountIds:
      platformAccountIds as DailyDetailsRequestPayload["platformAccountIds"],
    weeklyGrid,
    language: values.language,
    selectedTrendIds: values.selectedTrendIds ?? [],
  };
}

async function streamDetailedTemplates(
  response: Response,
  onTemplate: (template: DetailedPostTemplate) => void
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = detailedPostTemplateSchema.safeParse(safeJson(trimmed));
      if (parsed.success) {
        onTemplate(parsed.data);
      }
    }
  }
  const tail = buffer.trim();
  if (tail.length > 0) {
    const parsed = detailedPostTemplateSchema.safeParse(safeJson(tail));
    if (parsed.success) {
      onTemplate(parsed.data);
    }
  }
}


function useCopyCaption(show: ReturnType<typeof useToast>["show"]) {
  return useCallback(
    (caption: string) => {
      navigator.clipboard
        .writeText(caption)
        .then(() => show({ title: "Caption copied", variant: "success" }))
        .catch(() =>
          show({
            title: "Copy failed",
            description: "Your browser blocked clipboard access.",
            variant: "error",
          })
        );
    },
    [show]
  );
}

async function queueGridJob(payload: GenerationRequestPayload): Promise<string> {
  const response = await fetch("/api/organic/generate-grid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await safeParseJson(response);
    const message =
      typeof data?.error === "string"
        ? data.error
        : "Failed to queue organic content generation.";
    throw new Error(message);
  }

  const parsed = (await response.json()) as { jobId?: string };
  if (!parsed?.jobId) {
    throw new Error("Generation service did not return a job identifier.");
  }

  return parsed.jobId;
}

async function requestDailyTemplates(
  payload: DailyDetailsRequestPayload,
  signal: AbortSignal,
  onTemplate: (template: DetailedPostTemplate) => void
) {
  const response = await fetch("/api/organic/generate-daily-details-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const data = await safeParseJson(response);
    const message =
      typeof data?.error === "string"
        ? data.error
        : "Failed to generate detailed post templates.";
    throw new Error(message);
  }

  await streamDetailedTemplates(response, onTemplate);
}

function makeDefaultValues(
  platformAccounts: OrganicPlatformAccount[],
  defaultPrompt: PromptFormValue
): FormInputValues {
  const platformDefaults = ORGANIC_PLATFORM_KEYS.reduce(
    (acc, key) => {
      const account = platformAccounts.find((item) => item.platform === key);
      const hasAccountId = Boolean(account?.accountId);
      acc[key] = {
        enabled: Boolean(account?.connected && hasAccountId),
        accountId: account?.accountId ?? "",
      };
      return acc;
    },
    {} as Record<OrganicPlatformKey, z.infer<typeof platformFieldSchema>>
  );
  return {
    language: "English",
    userPrompt: "",
    generationPrompt: "",
    selectedTrendIds: [],
    prompt: { ...defaultPrompt },
    platforms: platformDefaults,
  };
}

async function safeParseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function badgeColor(status: string) {
  if (status === "complete") return "green";
  if (status === "error") return "red";
  if (status === "queued" || status === "started") return "blue";
  return "gray";
}
