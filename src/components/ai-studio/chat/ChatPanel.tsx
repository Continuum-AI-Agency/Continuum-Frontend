'use client';

import type { ChatPanelModelId, ImageSize } from '@continuum/contracts';
import {
  CHAT_PANEL_MODEL_IDS,
  getStatusBadgeLabel,
  imageSizeSchema,
  imageSizesForModel,
  isModelSelectable,
  MODEL_CATALOG,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ExclamationTriangleIcon,
  MagicWandIcon,
  MixerVerticalIcon,
  PaperPlaneIcon,
  StopIcon,
} from '@radix-ui/react-icons';
import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Pill } from '@/components/kibo-ui/pill';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { getAspectsForModel, getMediumForModel } from '@/lib/schemas/chatImageRequest';
import { VEO_RESOLUTION_DURATION_NOTE } from '@/lib/schemas/chatImageRequest';
import type {
  PromptTemplate,
  PromptTemplateCreateInput,
  PromptTemplateUpdateInput,
} from '@/lib/schemas/promptTemplates';
import { PromptTemplatePicker } from './PromptTemplatePicker';

type ChatPanelModel = ChatPanelModelId;

type FormValues = {
  model: ChatPanelModel;
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
  imageSize?: ImageSize;
  negativePrompt?: string;
  seed?: number;
  cfgScale?: number;
  steps?: number;
};

const chatPanelFormSchema = z.object({
  model: z.enum(CHAT_PANEL_MODEL_IDS),
  prompt: z.string().min(1, 'Prompt is required'),
  aspectRatio: z.string().optional(),
  durationSeconds: z.number().optional(),
  resolution: z.string().optional(),
  imageSize: imageSizeSchema.optional(),
  negativePrompt: z.string().optional(),
  seed: z.number().optional(),
  cfgScale: z.number().optional(),
  steps: z.number().optional(),
});

type ChatPanelProps = {
  disabled?: boolean;
  isStreaming?: boolean;
  isEnriching?: boolean;
  onEnrich?: (currentPrompt: string) => Promise<void>;
  enrichedValue?: string | null;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  onModelChange?: (model: ChatPanelModel) => void;
  getAspectsForModel: typeof getAspectsForModel;
  mediumForModel: typeof getMediumForModel;
  hasAnyReferences?: boolean;
  brandColors?: string[];
  brandTypography?: { primary: string | null; secondary: string | null };
  refsSummary?: { refCount: number; hasFirst: boolean; hasLast: boolean };
  promptTemplates?: {
    templates: PromptTemplate[];
    isLoading: boolean;
    onCreate: (input: Omit<PromptTemplateCreateInput, 'brandProfileId'>) => Promise<void>;
    onUpdate: (input: PromptTemplateUpdateInput) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
  };
};

const MODEL_OPTIONS = MODEL_CATALOG.filter(
  (m): m is (typeof MODEL_CATALOG)[number] & { id: ChatPanelModel } =>
    (CHAT_PANEL_MODEL_IDS as readonly string[]).includes(m.id),
);

const NANO_RES_OPTIONS = [
  { value: '1024x1024', label: '1024 x 1024 (1:1)' },
  { value: '1344x768', label: '1344 x 768 (16:9)' },
  { value: '768x1344', label: '768 x 1344 (9:16)' },
  { value: '1248x832', label: '1248 x 832 (3:2)' },
  { value: '832x1248', label: '832 x 1248 (2:3)' },
  { value: '1184x864', label: '1184 x 864 (4:3)' },
  { value: '864x1184', label: '864 x 1184 (3:4)' },
  { value: '1152x896', label: '1152 x 896 (5:4)' },
  { value: '896x1152', label: '896 x 1152 (4:5)' },
  { value: '1536x672', label: '1536 x 672 (21:9)' },
];

export function ChatPanel({
  disabled,
  isStreaming,
  isEnriching,
  onEnrich,
  enrichedValue,
  onSubmit,
  onCancel,
  onModelChange,
  getAspectsForModel,
  mediumForModel,
  hasAnyReferences,
  brandColors,
  brandTypography,
  refsSummary,
  promptTemplates,
}: ChatPanelProps) {
  const brandAccent = brandColors?.[0];
  const brandFont = brandTypography?.primary ?? undefined;
  const form = useForm<FormValues>({
    resolver: zodResolver(chatPanelFormSchema),
    defaultValues: {
      model: 'nano-banana',
      prompt: '',
      aspectRatio: getAspectsForModel('nano-banana')[0] ?? '1:1',
      resolution: '1024x1024',
      durationSeconds: 8,
      imageSize: '1K',
    },
    mode: 'onSubmit',
  });

  const model = form.watch('model');
  const medium = mediumForModel(model);
  const resolution = form.watch('resolution');
  const durationSeconds = form.watch('durationSeconds');
  // Veo 3.1 only renders 1080p at an 8-second duration; 720p accepts 4/6/8s.
  const resolutionRequires8s = medium === 'video' && resolution === '1080p';
  const aspectOptions = React.useMemo(
    () => getAspectsForModel(model, hasAnyReferences),
    [getAspectsForModel, model, hasAnyReferences],
  );

  React.useEffect(() => {
    if (resolutionRequires8s && durationSeconds !== 8) {
      form.setValue('durationSeconds', 8);
    }
  }, [resolutionRequires8s, durationSeconds, form]);

  React.useEffect(() => {
    onModelChange?.(model);
    // reset aspect if current is not allowed
    const currentAspect = form.getValues('aspectRatio') ?? '';
    if (!aspectOptions.includes(currentAspect)) {
      form.setValue('aspectRatio', aspectOptions[0] ?? '1:1');
    }
    if (model === 'nano-banana') {
      const current = form.getValues('resolution');
      form.setValue('resolution', current || '1024x1024');
      form.setValue('imageSize', undefined);
    } else if (model === 'gemini-3-pro-image') {
      form.setValue('resolution', '');
      form.setValue('imageSize', form.getValues('imageSize') || '1K');
    } else {
      const current = form.getValues('resolution');
      const allowedVideoResolutions = ['720p', '1080p'];
      const nextResolution = allowedVideoResolutions.includes(current ?? '') ? current : '720p';
      form.setValue('resolution', nextResolution);
      form.setValue('imageSize', undefined);
      const currentDuration = form.getValues('durationSeconds');
      // Veo 3.1 renders 1080p only at 8s; force 8s there, and default to 8s when unset.
      if (nextResolution === '1080p' && currentDuration !== 8) {
        form.setValue('durationSeconds', 8);
      } else if (!currentDuration) {
        form.setValue('durationSeconds', 8);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, aspectOptions, medium]);

  React.useEffect(() => {
    if (enrichedValue) {
      form.setValue('prompt', enrichedValue);
    }
  }, [enrichedValue, form]);

  const handleSubmit = form.handleSubmit(
    (values) => onSubmit(values),
    (errors) => {
      const firstError = Object.values(errors).find((err) => err?.message);
      if (firstError?.message) {
        form.setError('prompt', { message: firstError.message });
      }
    },
  );

  return (
    <div
      className="rounded-xl p-6 shadow-2xl"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--gray-6)',
        color: 'var(--gray-12)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="space-y-0.5">
          <span className="font-medium">Generate</span>
          <span className="block text-xs text-gray-400">
            Model-aware controls with advanced tucked away.
          </span>
        </div>
        <Pill variant="muted">{medium === 'image' ? 'Image' : 'Video'}</Pill>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(e);
        }}
      >
        <div className="space-y-1">
          <span className="block text-xs text-gray-400">Model</span>
          <Select
            value={model}
            onValueChange={(value) => form.setValue('model', value as ChatPanelModel)}
            disabled={disabled || isStreaming}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((option) => {
                const badgeLabel = getStatusBadgeLabel(option.status);
                const selectable = isModelSelectable(option.status);
                return (
                  <SelectItem key={option.id} value={option.id} disabled={!selectable}>
                    <div className="flex items-center gap-2">
                      <span>{option.label}</span>
                      {badgeLabel ? (
                        <Pill variant={option.status === 'beta' ? 'teal' : 'muted'}>
                          {badgeLabel}
                        </Pill>
                      ) : null}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className="block text-xs text-gray-400">Prompt</span>
          <div className="relative">
            <Textarea
              value={form.watch('prompt')}
              onChange={(e) => form.setValue('prompt', e.target.value)}
              placeholder="Describe what you want to see"
              rows={6}
              className="min-h-[clamp(240px,60dvh,500px)] pr-10"
              disabled={disabled || isStreaming || isEnriching}
            />
            <div className="absolute right-2 top-2 flex flex-col gap-2">
              {onEnrich && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          aria-label="Align to Brand"
                          disabled={disabled || isStreaming || isEnriching || !form.watch('prompt')}
                          onClick={(e) => {
                            e.preventDefault();
                            onEnrich(form.getValues('prompt'));
                          }}
                          style={
                            brandAccent
                              ? { color: brandAccent, fontFamily: brandFont }
                              : { fontFamily: brandFont }
                          }
                        >
                          {isEnriching ? <div className="animate-spin">◌</div> : <MagicWandIcon />}
                        </Button>
                      }
                    />
                    <TooltipContent>
                      Align to Brand — rewrites your prompt using your brand's colors, typography,
                      and voice
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {promptTemplates ? (
                <PromptTemplatePicker
                  templates={promptTemplates.templates}
                  isLoading={promptTemplates.isLoading}
                  currentPrompt={form.watch('prompt')}
                  onSelect={(template) => form.setValue('prompt', template.prompt)}
                  onCreate={promptTemplates.onCreate}
                  onUpdate={promptTemplates.onUpdate}
                  onDelete={promptTemplates.onDelete}
                />
              ) : null}
            </div>
          </div>
          {form.formState.errors.prompt ? (
            <span className="block text-xs text-destructive">
              {form.formState.errors.prompt.message}
            </span>
          ) : null}
        </div>

        {model === 'nano-banana' ? (
          <div className="space-y-1">
            <span className="block text-xs text-gray-400">Resolution</span>
            <Select
              value={form.watch('resolution') ?? '1024x1024'}
              onValueChange={(value) => form.setValue('resolution', value)}
              disabled={disabled || isStreaming}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select resolution" />
              </SelectTrigger>
              <SelectContent>
                {NANO_RES_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : medium === 'video' ? (
          <div className="space-y-1">
            <span className="block text-xs text-gray-400">Resolution</span>
            <Select
              value={form.watch('resolution') ?? '720p'}
              onValueChange={(value) => form.setValue('resolution', value)}
              disabled={disabled || isStreaming}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select resolution" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-1">
          <span className="block text-xs text-gray-400">Aspect ratio</span>
          <div className="flex flex-wrap gap-2">
            {aspectOptions.map((ratio) => (
              <Button
                key={ratio}
                size="sm"
                variant={form.watch('aspectRatio') === ratio ? 'default' : 'outline'}
                onClick={(e) => {
                  e.preventDefault();
                  form.setValue('aspectRatio', ratio);
                }}
                disabled={disabled || isStreaming}
              >
                {ratio}
              </Button>
            ))}
          </div>
        </div>

        {model === 'gemini-3-pro-image' ? (
          <div className="space-y-1">
            <span className="block text-xs text-gray-400">Image size</span>
            <div className="flex flex-wrap gap-2">
              {imageSizesForModel('nano-banana-pro').map((size) => (
                <Button
                  key={size}
                  size="sm"
                  variant={form.watch('imageSize') === size ? 'default' : 'outline'}
                  onClick={(e) => {
                    e.preventDefault();
                    form.setValue('imageSize', size);
                  }}
                  disabled={disabled || isStreaming}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {medium === 'video' ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Duration (seconds)</span>
              <span className="text-xs text-gray-400">Default 8s</span>
            </div>
            <RadioGroup
              value={String(form.watch('durationSeconds') ?? '8')}
              onValueChange={(value) =>
                form.setValue('durationSeconds', Number(value) as 4 | 6 | 8)
              }
              className="flex gap-4"
              disabled={disabled || isStreaming}
            >
              {([4, 6, 8] as const).map((d) => {
                const optionDisabled = resolutionRequires8s && d !== 8;
                return (
                  <label
                    key={d}
                    htmlFor={`duration-${d}`}
                    className={`flex items-center gap-1.5 text-sm ${
                      optionDisabled ? 'opacity-40' : ''
                    }`}
                  >
                    <RadioGroupItem
                      id={`duration-${d}`}
                      value={String(d)}
                      disabled={optionDisabled}
                    />
                    {d}
                  </label>
                );
              })}
            </RadioGroup>
            {resolutionRequires8s ? (
              <span className="block text-xs text-gray-400">{VEO_RESOLUTION_DURATION_NOTE}</span>
            ) : null}
          </div>
        ) : null}

        <Separator className="my-2 bg-white/10" />

        <details
          className="rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-white/20"
          open={false}
        >
          <summary className="flex cursor-pointer items-center gap-2 text-sm text-gray-200">
            <MixerVerticalIcon /> Advanced
          </summary>
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <span className="block text-xs text-gray-400">Negative prompt</span>
              <Textarea
                value={form.watch('negativePrompt') ?? ''}
                onChange={(e) => form.setValue('negativePrompt', e.target.value || undefined)}
                rows={2}
                className="min-h-[72px]"
                disabled={disabled || isStreaming}
              />
            </div>
            {model !== 'nano-banana' ? (
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  placeholder="Seed"
                  value={form.watch('seed') ?? ''}
                  onChange={(e) =>
                    form.setValue('seed', e.target.value ? Number(e.target.value) : undefined)
                  }
                  disabled={disabled || isStreaming}
                />
                <Input
                  type="number"
                  placeholder="CFG"
                  value={form.watch('cfgScale') ?? ''}
                  onChange={(e) =>
                    form.setValue('cfgScale', e.target.value ? Number(e.target.value) : undefined)
                  }
                  disabled={disabled || isStreaming}
                />
                <Input
                  type="number"
                  placeholder="Steps"
                  value={form.watch('steps') ?? ''}
                  onChange={(e) =>
                    form.setValue('steps', e.target.value ? Number(e.target.value) : undefined)
                  }
                  disabled={disabled || isStreaming}
                />
              </div>
            ) : (
              <span className="block text-xs text-gray-400">
                Advanced knobs not required for Nano Banana.
              </span>
            )}
          </div>
        </details>

        <Alert className="border-white/10 bg-white/5">
          <ExclamationTriangleIcon />
          <AlertDescription className="text-gray-300">
            {refsSummary?.refCount
              ? `${refsSummary.refCount} reference image${refsSummary.refCount === 1 ? '' : 's'} attached.`
              : 'No reference images attached.'}
            {medium === 'video'
              ? ` ${refsSummary?.hasFirst ? 'First frame set.' : ''} ${refsSummary?.hasLast ? 'Last frame set.' : ''}`
              : ''}
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={disabled || isStreaming}>
            <PaperPlaneIcon /> {isStreaming ? 'Streaming' : 'Generate'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-destructive text-destructive hover:text-destructive"
            onClick={onCancel}
            disabled={!isStreaming}
          >
            <StopIcon /> Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
