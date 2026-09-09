'use client';

import {
  type MediaAsset,
  type PipelineCapabilityV2,
  type PipelineInvocationInput,
  type PipelineInvocationRequest,
  type PipelineRunArtifact,
  type PipelineRunReceipt,
  pipelineInvocationRequestSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Box, ChevronDown, FileImage, Loader2, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ELEMENT_CATEGORY_LABEL, useElements } from '@/lib/ai-studio/elements';
import { startPipelineRun, waitForPipelineRun } from '@/lib/ai-studio/pipelines';
import { useStudioLibraryBrowser } from '@/lib/creative-assets/useStudioLibraryBrowser';
import { cn } from '@/lib/utils';

type PinnedAsset = { asset_id: string; version_id: string };
type FormValues = {
  inputs: Record<string, string | PinnedAsset[]>;
  controls: Record<string, unknown>;
};
type PipelineRunExecutor = (
  invocation: PipelineInvocationRequest,
  signal: AbortSignal,
) => Promise<PipelineRunReceipt>;

const pinnedAssetSchema = z.object({ asset_id: z.string().uuid(), version_id: z.string().uuid() });

function inputValueSchema(input: PipelineCapabilityV2['inputs'][number]) {
  if (input.kind === 'asset') {
    return z.array(pinnedAssetSchema).min(input.min_items).max(input.max_items);
  }
  if (input.kind === 'element') {
    const selected = z.string().uuid('Choose an Element');
    return input.required ? selected : z.union([selected, z.literal('')]);
  }
  let text = z.string();
  const minimum = input.required ? Math.max(1, input.min_length ?? 0) : (input.min_length ?? 0);
  if (minimum > 0) text = text.min(minimum, `${input.label} is too short`);
  if (input.max_length) text = text.max(input.max_length, `${input.label} is too long`);
  return input.required ? text : z.union([z.literal(''), text]);
}

function controlValueSchema(control: PipelineCapabilityV2['controls'][number]) {
  const allowUntouched = (schema: z.ZodType) =>
    !control.required && control.default === undefined ? z.union([z.literal(''), schema]) : schema;
  if (control.kind === 'boolean') return allowUntouched(z.boolean());
  if (control.kind === 'enum') {
    return allowUntouched(z.enum(control.options as [string, ...string[]]));
  }
  if (control.kind === 'string') {
    let text = z.string();
    if (control.min_length) text = text.min(control.min_length);
    if (control.max_length) text = text.max(control.max_length);
    return allowUntouched(text);
  }
  let number = control.kind === 'integer' ? z.number().int() : z.number();
  if (control.minimum !== undefined) number = number.min(control.minimum);
  if (control.maximum !== undefined) number = number.max(control.maximum);
  return allowUntouched(number);
}

function buildFormSchema(capability: PipelineCapabilityV2) {
  const inputs = Object.fromEntries(
    capability.inputs.map((input) => [input.input_id, inputValueSchema(input)]),
  );
  const controls = Object.fromEntries(
    capability.controls.map((control) => [control.control_id, controlValueSchema(control)]),
  );
  return z.object({ inputs: z.object(inputs), controls: z.object(controls) });
}

function defaultValues(capability: PipelineCapabilityV2): FormValues {
  return {
    inputs: Object.fromEntries(
      capability.inputs.map((input) => [input.input_id, input.kind === 'asset' ? [] : '']),
    ),
    controls: Object.fromEntries(
      capability.controls.map((control) => [
        control.control_id,
        control.default ?? (control.required && control.kind === 'boolean' ? false : ''),
      ]),
    ),
  };
}

function mediaMatches(asset: MediaAsset, media: string): boolean {
  if (media === 'other') return true;
  if (media === 'audio') return asset.mimeType.toLowerCase().startsWith('audio/');
  return asset.kind === media;
}

function AssetInput({
  brandId,
  input,
  selected,
  onChange,
}: {
  brandId: string;
  input: Extract<PipelineCapabilityV2['inputs'][number], { kind: 'asset' }>;
  selected: PinnedAsset[];
  onChange: (value: PinnedAsset[]) => void;
}) {
  const initialKind = input.media === 'image' || input.media === 'video' ? input.media : 'all';
  const { assets, loading, query, setQuery, error } = useStudioLibraryBrowser(brandId, {
    initialFilters: { kind: initialKind },
  });
  const choices = assets.filter(
    (asset) => mediaMatches(asset, input.media) && Boolean(asset.headVersionId),
  );

  const toggle = (asset: MediaAsset) => {
    if (!asset.headVersionId) return;
    const exists = selected.some((item) => item.asset_id === asset.id);
    if (exists) {
      onChange(selected.filter((item) => item.asset_id !== asset.id));
      return;
    }
    const next = [...selected, { asset_id: asset.id, version_id: asset.headVersionId }];
    onChange(input.max_items === 1 ? next.slice(-1) : next.slice(0, input.max_items));
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={`Search ${input.label}`}
        placeholder={`Search ${input.media} assets…`}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {loading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden /> Reading the Library…
        </p>
      ) : (
        <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto">
          {choices.map((asset) => {
            const active = selected.some((item) => item.asset_id === asset.id);
            return (
              <button
                key={asset.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(asset)}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                )}
              >
                {asset.kind === 'video' ? (
                  <Play className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <FileImage className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs">{asset.title ?? asset.fileName}</span>
                  <span className="block font-mono text-3xs text-muted-foreground">
                    exact version {asset.headVersionId?.slice(0, 8)}
                  </span>
                </span>
              </button>
            );
          })}
          {choices.length === 0 ? (
            <p className="col-span-2 text-xs text-muted-foreground">
              No versioned {input.media} assets found.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ElementInput({
  brandId,
  input,
  selectedId,
  onChange,
}: {
  brandId: string;
  input: Extract<PipelineCapabilityV2['inputs'][number], { kind: 'element' }>;
  selectedId: string;
  onChange: (value: string) => void;
}) {
  const { elements, isLoading, isError } = useElements(brandId);
  const choices = elements.filter((element) => input.allowed_categories.includes(element.category));

  if (isLoading) return <p className="text-xs text-muted-foreground">Reading Elements…</p>;
  if (isError) return <p className="text-xs text-destructive">Could not read Elements.</p>;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {choices.map((element) => (
        <button
          key={element.id}
          type="button"
          aria-pressed={selectedId === element.id}
          onClick={() => onChange(element.id)}
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selectedId === element.id
              ? 'border-primary bg-primary/5'
              : 'border-border hover:bg-muted/50',
          )}
        >
          <Box className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-xs">{element.name}</span>
            <span className="block text-3xs text-muted-foreground">
              {ELEMENT_CATEGORY_LABEL[element.category]} Element
            </span>
          </span>
        </button>
      ))}
      {choices.length === 0 ? (
        <p className="col-span-2 text-xs text-muted-foreground">
          No matching Elements. Create one in AI Studio first.
        </p>
      ) : null}
    </div>
  );
}

function ControlInput({
  id,
  control,
  value,
  onChange,
}: {
  id: string;
  control: PipelineCapabilityV2['controls'][number];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (control.kind === 'boolean') {
    return (
      <Checkbox id={id} checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked)} />
    );
  }
  if (control.kind === 'enum') {
    return (
      <Select value={String(value)} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={control.label}>
          <SelectValue items={Object.fromEntries(control.options.map((item) => [item, item]))} />
        </SelectTrigger>
        <SelectContent>
          {control.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (control.kind === 'string') {
    return (
      <Input id={id} value={String(value)} onChange={(event) => onChange(event.target.value)} />
    );
  }
  return (
    <Input
      id={id}
      type="number"
      value={typeof value === 'number' ? value : ''}
      min={control.minimum}
      max={control.maximum}
      step={control.step}
      onChange={(event) => onChange(event.target.valueAsNumber)}
    />
  );
}

function artifactIdentity(artifact: PipelineRunArtifact): string {
  if (artifact.kind === 'asset') {
    return `asset ${artifact.asset.asset_id.slice(0, 8)} · version ${artifact.asset.version_id.slice(0, 8)}`;
  }
  return `Candidate Element · ${artifact.candidate.category} · ${artifact.candidate.member_assets.length} member${artifact.candidate.member_assets.length === 1 ? '' : 's'}`;
}

function PipelineReceipt({
  capability,
  receipt,
}: {
  capability: PipelineCapabilityV2;
  receipt: PipelineRunReceipt;
}) {
  if (receipt.error) {
    return (
      <div role="alert" className="border-t border-border pt-3 text-xs text-destructive">
        <p className="font-medium">{receipt.error.message}</p>
        <p className="font-mono text-3xs">{receipt.error.code}</p>
      </div>
    );
  }

  const cost = receipt.cost;
  return (
    <section
      className="flex flex-col gap-3 border-t border-border pt-3"
      aria-label="Pipeline outputs"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Run outputs</p>
        <Pill variant={receipt.status === 'completed' ? 'success' : 'muted'}>
          <PillIndicator
            variant={receipt.status === 'completed' ? 'success' : 'info'}
            pulse={receipt.status === 'queued' || receipt.status === 'running'}
          />
          {receipt.status}
        </Pill>
      </div>
      {capability.outputs.map((output) => {
        const artifacts = receipt.artifacts.filter(
          (artifact) => artifact.output_id === output.output_id,
        );
        return (
          <section key={output.output_id} aria-labelledby={`pipeline-output-${output.output_id}`}>
            <p id={`pipeline-output-${output.output_id}`} className="text-xs font-medium">
              {output.label}
            </p>
            {artifacts.map((artifact) => (
              <div key={artifact.artifact_id} className="mt-1 border-l border-border pl-2 text-xs">
                {artifact.kind === 'element_candidate' ? (
                  <p className="font-medium">{artifact.candidate.name}</p>
                ) : null}
                <p className="font-mono text-3xs text-muted-foreground">
                  {artifactIdentity(artifact)}
                </p>
                {artifact.kind === 'element_candidate' ? (
                  <p className="font-mono text-3xs text-muted-foreground">
                    reference {artifact.candidate.reference_asset.asset_id.slice(0, 8)} · version{' '}
                    {artifact.candidate.reference_asset.version_id.slice(0, 8)}
                  </p>
                ) : null}
              </div>
            ))}
          </section>
        );
      })}
      {cost ? (
        <p className="text-3xs text-muted-foreground">
          {cost.amount_minor === null
            ? 'Cost not recorded'
            : `${(cost.amount_minor / 100).toFixed(2)} ${cost.currency}`}{' '}
          · {cost.generation_count} generations · quality{' '}
          {Math.round((receipt.quality?.score ?? 0) * 100)}%
        </p>
      ) : null}
    </section>
  );
}

function invocationInputs(
  capability: PipelineCapabilityV2,
  values: FormValues,
): Record<string, PipelineInvocationInput> {
  const resolved: Record<string, PipelineInvocationInput> = {};
  for (const input of capability.inputs) {
    const value = values.inputs[input.input_id];
    if (input.kind === 'asset' && Array.isArray(value) && value.length > 0) {
      resolved[input.input_id] = { kind: 'asset', assets: value };
    } else if (input.kind === 'element' && typeof value === 'string' && value) {
      resolved[input.input_id] = { kind: 'element', element_id: value };
    } else if (input.kind === 'text' && typeof value === 'string' && value.trim()) {
      resolved[input.input_id] = { kind: 'text', value: value.trim() };
    }
  }
  return resolved;
}

async function executePipelineRun(
  invocation: PipelineInvocationRequest,
  signal: AbortSignal,
): Promise<PipelineRunReceipt> {
  const accepted = await startPipelineRun(invocation);
  return accepted.status === 'queued' || accepted.status === 'running'
    ? waitForPipelineRun(invocation.brand_profile_id, accepted.run_id, { signal })
    : accepted;
}

export function PipelineInvocationForm({
  brandId,
  capability,
  executePipeline = executePipelineRun,
}: {
  brandId: string;
  capability: PipelineCapabilityV2;
  executePipeline?: PipelineRunExecutor;
}) {
  const schema = useMemo(() => buildFormSchema(capability), [capability]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(capability),
  });
  const [receipt, setReceipt] = useState<PipelineRunReceipt | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const runAbort = useRef<AbortController | null>(null);

  useEffect(() => () => runAbort.current?.abort(), []);

  const submit = form.handleSubmit(async (values) => {
    setRunning(true);
    setRunError(null);
    runAbort.current?.abort();
    const controller = new AbortController();
    runAbort.current = controller;
    try {
      const invocation = pipelineInvocationRequestSchema.parse({
        brand_profile_id: brandId,
        pipeline_id: capability.pipeline_id,
        identity: capability.identity,
        idempotency_key: crypto.randomUUID(),
        origin: 'client',
        inputs: invocationInputs(capability, values),
        controls: Object.fromEntries(
          Object.entries(values.controls).filter(([, value]) => value !== ''),
        ),
      }) as PipelineInvocationRequest;
      const settled = await executePipeline(invocation, controller.signal);
      setReceipt(settled);
    } catch (error) {
      if (!controller.signal.aborted) {
        setRunError(error instanceof Error ? error.message : 'The pipeline could not be started.');
      }
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="pipeline-invocation-form">
      <div className="flex flex-col gap-3">
        {capability.inputs.map((input) => (
          <Controller
            key={input.input_id}
            control={form.control}
            name={`inputs.${input.input_id}`}
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-1.5">
                <Label
                  {...(input.kind === 'text'
                    ? { htmlFor: `pipeline-input-${input.input_id}` }
                    : { id: `pipeline-input-${input.input_id}-label` })}
                >
                  {input.label}
                  <span aria-hidden>{input.required ? ' *' : ' (optional)'}</span>
                </Label>
                {input.description ? (
                  <p className="text-xs text-muted-foreground">{input.description}</p>
                ) : null}
                {input.kind === 'text' ? (
                  <Textarea
                    id={`pipeline-input-${input.input_id}`}
                    rows={3}
                    value={String(field.value)}
                    onChange={field.onChange}
                  />
                ) : input.kind === 'asset' ? (
                  <fieldset aria-labelledby={`pipeline-input-${input.input_id}-label`}>
                    <AssetInput
                      brandId={brandId}
                      input={input}
                      selected={(field.value as PinnedAsset[]) ?? []}
                      onChange={field.onChange}
                    />
                  </fieldset>
                ) : (
                  <fieldset aria-labelledby={`pipeline-input-${input.input_id}-label`}>
                    <ElementInput
                      brandId={brandId}
                      input={input}
                      selectedId={String(field.value)}
                      onChange={field.onChange}
                    />
                  </fieldset>
                )}
                {fieldState.error ? (
                  <p className="text-xs text-destructive">{fieldState.error.message}</p>
                ) : null}
              </div>
            )}
          />
        ))}
      </div>

      {capability.controls.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center justify-between border-t border-border pt-2 text-xs font-medium">
            Advanced controls
            <ChevronDown className="size-3.5 transition-transform group-data-[panel-open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-3 pt-3">
            {capability.controls.map((control) => (
              <Controller
                key={control.control_id}
                control={form.control}
                name={`controls.${control.control_id}`}
                render={({ field, fieldState }) => (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`pipeline-control-${control.control_id}`}>
                      {control.label}
                    </Label>
                    <ControlInput
                      id={`pipeline-control-${control.control_id}`}
                      control={control}
                      value={field.value}
                      onChange={field.onChange}
                    />
                    {control.description ? (
                      <p className="text-xs text-muted-foreground">{control.description}</p>
                    ) : null}
                    {fieldState.error ? (
                      <p className="text-xs text-destructive">{fieldState.error.message}</p>
                    ) : null}
                  </div>
                )}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {runError ? (
        <p role="alert" className="text-xs text-destructive">
          {runError}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={running}>
        {running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        {running ? 'Running…' : 'Run pipeline'}
      </Button>
      {receipt ? <PipelineReceipt capability={capability} receipt={receipt} /> : null}
    </form>
  );
}
