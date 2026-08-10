'use client';

import {
  AUTOMATION_PLANNER_UPSERT_DEFAULTS,
  AUTOMATION_REGISTERED_NATIVE_OUTPUT_CONTRACT_IDS,
  type AutomationActionNodeType,
  type AutomationAiStudioGenerator,
  type AutomationCapabilitiesResponse,
  type AutomationPaidOptimizerOperation,
  type AutomationSourceKind,
  type AutomationWebhookDestination,
  type AutomationWebhookEndpoint,
  type AutomationWorkflowNode,
  automationAgentCapabilitySchema,
  automationAiStudioGeneratorSchema,
  isRegisteredNativeOutputContractId,
  parseAutomationSourceQuery,
  resolveAutomationAiStudioGenerateConfig,
  resolveAutomationLibrarySaveConfig,
  resolveAutomationOrganicPublishConfig,
  resolveAutomationPaidOptimizerConfig,
  resolveAutomationPlannerUpsertConfig,
} from '@continuum/contracts';
import { Copy, Expand, Lightbulb, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { getApiUrl } from '@/lib/api/config';
import { buildAutomationSourceOptions } from '@/lib/automations/source-options';
import { cn } from '@/lib/utils';
import { AiStudioRoomPicker } from './pickers/AiStudioRoomPicker';
import { LibraryCollectionPicker } from './pickers/LibraryCollectionPicker';
import { OrganicPublishTargetPicker } from './pickers/OrganicPublishTargetPicker';
import { PaidPortfolioPicker } from './pickers/PaidPortfolioPicker';
import { PlannerTargetPicker } from './pickers/PlannerTargetPicker';

type WorkflowConfig = AutomationWorkflowNode['config'];

export const automationWebhookDeliveryUrl = (publicId: string): string =>
  getApiUrl(`/api/automations/hooks/${publicId}`);

export async function copyAutomationValue(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy the ${label.toLowerCase()}`, {
      description: 'Your browser blocked clipboard access — select the text and copy it manually.',
    });
  }
}

type PromptStarter = {
  label: string;
  text: string;
};

const instructionStarters: PromptStarter[] = [
  {
    label: 'Evidence-first rules',
    text: 'Use only the connected context. State assumptions explicitly, cite the supporting records, and flag missing evidence instead of inventing details.',
  },
  {
    label: 'Prioritized analysis',
    text: 'Identify the most important findings, explain why each matters, and order the recommended actions by expected impact and urgency.',
  },
  {
    label: 'Executive summary',
    text: 'Write for a busy decision-maker. Lead with the conclusion, keep the supporting evidence concise, and finish with clear next actions.',
  },
];

const agentStarters: PromptStarter[] = [
  {
    label: 'Analyze and recommend',
    text: 'Analyze the connected context. Identify the most important findings, support each finding with evidence, and recommend the next actions in priority order.',
  },
  {
    label: 'Compare performance',
    text: 'Compare performance across the connected records. Explain material changes, likely causes, risks, and practical next steps.',
  },
  {
    label: 'Create a brief',
    text: 'Create a concise executive brief for the configured audience. Separate observed evidence from interpretation and recommendations.',
  },
];

const formatterStarters: PromptStarter[] = [
  {
    label: 'Faithful mapping',
    text: 'Map the upstream artifacts into the selected contract without changing factual values. Use null for unavailable optional fields and do not invent evidence.',
  },
  {
    label: 'Executive structure',
    text: 'Prioritize the decision, evidence, risks, and next actions. Keep every field concise and preserve the source labels.',
  },
];

const NATIVE_CONTRACT_LABELS: Record<string, string> = {
  'report.document': 'Report document',
  'webhook.payload': 'Webhook payload',
  'planner.draft': 'Planner draft',
};

/**
 * Derived from the registry rather than hand-listed. The hand-listed version
 * omitted `planner.draft`, which IS registered — so the formatter could never
 * be pointed at it and the content-to-planner chain was unbuildable in the UI
 * despite the adapter being wired. Deriving means registered and offerable
 * cannot drift apart again in either direction.
 */
const NATIVE_CONTRACT_OPTIONS = AUTOMATION_REGISTERED_NATIVE_OUTPUT_CONTRACT_IDS.map((id) => ({
  value: id,
  label: NATIVE_CONTRACT_LABELS[id] ?? id,
}));

const textList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const appendPromptStarter = (value: string, starter: string): string =>
  value.trim() ? `${value.trim()}\n\n${starter}` : starter;

/** Keeps a numeric bound editable without letting a half-typed value (or a
 *  cleared field) write a number the config schema would reject. */
export function boundedInteger(raw: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** `null` is a real value here — it means "no cap" — so an empty field must
 *  clear the cap rather than fall back to the previous number. */
export function boundedPercent(raw: string): number | null {
  if (raw.trim().length === 0) return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, parsed));
}

export const paidOptimizerOperationOptions = [
  { value: 'run_cycle', label: 'Run an optimization cycle' },
  { value: 'apply_approved', label: 'Apply human-approved recommendations' },
] as const satisfies ReadonlyArray<{ value: AutomationPaidOptimizerOperation; label: string }>;

/** Surfaces what the backend says about an action before a run proves it. The
 *  capabilities response carries `actions` optionally, so an older backend
 *  simply yields no notice rather than a false "unavailable". */
function ActionCapabilityNotice({
  type,
  capabilities,
}: {
  type: AutomationActionNodeType;
  capabilities: AutomationCapabilitiesResponse | null;
}) {
  const capability = capabilities?.actions?.find((action) => action.type === type);
  if (!capability) return null;
  if (capability.availability === 'ready' && capability.lifecycle === 'production') return null;

  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
      <Badge variant="warning">
        {capability.availability === 'needs_connection' ? 'Needs connection' : 'Limited'}
      </Badge>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        {capability.reason ??
          'This action is not fully available in this environment yet. A run may fail preflight.'}
      </p>
    </div>
  );
}

function PromptField({
  label,
  value,
  onChange,
  disabled,
  description,
  placeholder,
  starters = instructionStarters,
  rows = 7,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  description?: string;
  placeholder?: string;
  starters?: PromptStarter[];
  rows?: number;
}) {
  const id = useId();
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const appendStarter = (text: string) => onChange(appendPromptStarter(value, text));

  const editor = (expanded = false) => (
    <InputGroup
      className={cn(
        'automation-prompt-surface rounded-lg border-border/80 bg-muted/20 shadow-none',
        expanded && 'min-h-[22rem] items-stretch',
      )}
    >
      <InputGroupTextarea
        id={expanded ? `${id}-expanded` : id}
        rows={expanded ? 16 : rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={expanded ? 'min-h-[18rem] resize-y text-sm leading-6' : 'leading-5'}
        onChange={(event) => onChange(event.target.value)}
      />
      <InputGroupAddon align="block-end" className="justify-between border-t">
        <InputGroupText className="font-mono text-[10px]">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </InputGroupText>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <InputGroupButton
                  aria-label="Add prompt starter"
                  title="Add prompt starter"
                  disabled={disabled}
                >
                  <Sparkles aria-hidden="true" />
                  Quick start
                </InputGroupButton>
              }
            />
            <DropdownMenuContent
              align="end"
              className="automation-workflow-popover w-72 rounded-lg p-1.5"
            >
              <DropdownMenuLabel>Prompt starters</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {starters.map((starter) => (
                <DropdownMenuItem
                  key={starter.label}
                  className="items-start"
                  onSelect={() => appendStarter(starter.text)}
                >
                  <Lightbulb aria-hidden="true" />
                  <span>
                    <span className="block text-xs font-medium">{starter.label}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                      {starter.text}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {value ? (
            <InputGroupButton
              size="icon-xs"
              aria-label="Clear prompt"
              title="Clear prompt"
              disabled={disabled}
              onClick={() => onChange('')}
            >
              <Trash2 aria-hidden="true" />
            </InputGroupButton>
          ) : null}
          {!expanded ? (
            <Dialog>
              <DialogTrigger
                render={
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Open large prompt editor"
                    title="Open large prompt editor"
                    disabled={disabled}
                  >
                    <Expand aria-hidden="true" />
                  </InputGroupButton>
                }
              />
              <DialogContent className="automation-workflow-popover rounded-lg sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{label}</DialogTitle>
                  <DialogDescription>
                    Write the operating context this step should follow on every run.
                  </DialogDescription>
                </DialogHeader>
                {editor(true)}
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </InputGroupAddon>
    </InputGroup>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {description ? (
        <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
      ) : null}
      {editor()}
    </div>
  );
}

function JsonObjectField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(serialized), [serialized]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Textarea
        rows={6}
        className="font-mono text-xs"
        value={draft}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          try {
            const parsed: unknown = JSON.parse(next);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error('Enter a JSON object.');
            }
            setError(null);
            onChange(parsed as Record<string, unknown>);
          } catch (parseError) {
            setError(parseError instanceof Error ? parseError.message : 'Invalid JSON object.');
          }
        }}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: 'text' | 'number' | 'time' | 'url' | 'email';
  placeholder?: string;
}) {
  const id = `automation-field-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{
    value: string;
    label: string;
    disabled?: boolean;
    preview?: boolean;
  }>;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              <span className="flex items-center gap-2">
                {option.label}
                {option.preview ? <Badge variant="muted">Preview</Badge> : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div>
        <Label>{label}</Label>
        {description ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SourceEditor({
  node,
  disabled,
  onChange,
  sourceCapabilities,
}: {
  node: Extract<AutomationWorkflowNode, { type: 'source' }>;
  disabled: boolean;
  onChange: (config: WorkflowConfig) => void;
  sourceCapabilities: AutomationCapabilitiesResponse | null;
}) {
  const { config } = node;
  const query = parseAutomationSourceQuery(config.source, config.query);
  const libraryQuery =
    config.source === 'library' ? parseAutomationSourceQuery('library', config.query) : null;
  const paidAnalyticsQuery =
    config.source === 'paid_analytics'
      ? parseAutomationSourceQuery('paid_analytics', config.query)
      : null;
  const organicAnalyticsQuery =
    config.source === 'organic_analytics'
      ? parseAutomationSourceQuery('organic_analytics', config.query)
      : null;
  const savedPromptQuery =
    config.source === 'saved_prompt'
      ? parseAutomationSourceQuery('saved_prompt', config.query)
      : null;
  const savedSkillQuery =
    config.source === 'saved_skill'
      ? parseAutomationSourceQuery('saved_skill', config.query)
      : null;
  const previousRunQuery =
    config.source === 'previous_run'
      ? parseAutomationSourceQuery('previous_run', config.query)
      : null;
  const connectedPlatformQuery =
    config.source === 'connected_platform'
      ? parseAutomationSourceQuery('connected_platform', config.query)
      : null;
  const capability = sourceCapabilities?.sources.find((item) => item.source === config.source);
  // Server truth, with the bundled enum as the "capabilities have not loaded"
  // fallback so the editor still works offline or mid-fetch.
  const sourceOptions = buildAutomationSourceOptions({
    capabilities: sourceCapabilities,
    selected: config.source,
  });
  const patchQuery = (patch: Record<string, unknown>) =>
    onChange({ ...config, query: { ...query, ...patch } });

  return (
    <>
      <Choice
        label="Source"
        value={config.source}
        options={sourceOptions}
        disabled={disabled}
        onChange={(value) => {
          const source = value as AutomationSourceKind;
          onChange({
            ...config,
            source,
            query: parseAutomationSourceQuery(source, {}),
          });
        }}
      />
      {capability && capability.availability !== 'ready' ? (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
          <div className="flex items-center gap-2">
            <Badge variant={capability.lifecycle === 'preview' ? 'muted' : 'warning'}>
              {capability.availability.replace('_', ' ')}
            </Badge>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{capability.reason}</p>
        </div>
      ) : null}
      <Choice
        label="Read mode"
        value={config.mode}
        options={[
          { value: 'live', label: 'Live at run time' },
          { value: 'pinned', label: 'Pinned records' },
        ]}
        disabled={disabled}
        onChange={(mode) => onChange({ ...config, mode: mode as 'live' | 'pinned' })}
      />
      {config.mode === 'pinned' ? (
        <Field
          label="Pinned record IDs"
          value={config.pinnedIds.join(', ')}
          disabled={disabled}
          onChange={(value) => onChange({ ...config, pinnedIds: textList(value) })}
          placeholder="id-1, id-2"
        />
      ) : null}
      {'search' in query ? (
        <Field
          label="Search"
          value={String(query.search)}
          disabled={disabled}
          onChange={(search) => patchQuery({ search })}
          placeholder="Optional filters"
        />
      ) : null}
      {'limit' in query ? (
        <Field
          label="Result limit"
          type="number"
          value={Number(query.limit)}
          disabled={disabled}
          onChange={(limit) => patchQuery({ limit: Number(limit) })}
        />
      ) : null}
      {libraryQuery ? (
        <>
          <Field
            label="Tags"
            value={libraryQuery.tags.join(', ')}
            disabled={disabled}
            onChange={(tags) => patchQuery({ tags: textList(tags) })}
            placeholder="approved, campaign"
          />
          <Choice
            label="Review status"
            value={libraryQuery.reviewStatus ?? 'any'}
            disabled={disabled}
            options={[
              { value: 'any', label: 'Any' },
              { value: 'draft', label: 'Draft' },
              { value: 'in_review', label: 'In review' },
              { value: 'needs_changes', label: 'Needs changes' },
              { value: 'approved', label: 'Approved' },
            ]}
            onChange={(reviewStatus) =>
              patchQuery({ reviewStatus: reviewStatus === 'any' ? undefined : reviewStatus })
            }
          />
        </>
      ) : null}
      {paidAnalyticsQuery ? (
        <>
          <Field
            label="Meta ad account"
            value={paidAnalyticsQuery.adAccountId}
            disabled={disabled}
            onChange={(adAccountId) => patchQuery({ adAccountId })}
            placeholder="auto or act_…"
          />
          <Choice
            label="Date window"
            value={paidAnalyticsQuery.datePreset}
            disabled={disabled}
            options={[
              { value: 'last_7d', label: 'Last 7 days' },
              { value: 'last_14d', label: 'Last 14 days' },
              { value: 'last_30d', label: 'Last 30 days' },
            ]}
            onChange={(datePreset) => patchQuery({ datePreset })}
          />
          <Choice
            label="Level"
            value={paidAnalyticsQuery.level}
            disabled={disabled}
            options={['account', 'campaign', 'adset', 'ad'].map((value) => ({
              value,
              label: value,
            }))}
            onChange={(level) => patchQuery({ level })}
          />
          <Field
            label="Object ID"
            value={paidAnalyticsQuery.objectId}
            disabled={disabled}
            onChange={(objectId) => patchQuery({ objectId })}
            placeholder="auto or campaign/ad set ID"
          />
          <Field
            label="Metrics"
            value={paidAnalyticsQuery.metrics.join(', ')}
            disabled={disabled}
            onChange={(metrics) => patchQuery({ metrics: textList(metrics) })}
            placeholder="spend, impressions, clicks"
          />
          <Toggle
            label="Include top ads"
            checked={paidAnalyticsQuery.includeTopAds}
            disabled={disabled}
            onCheckedChange={(includeTopAds) => patchQuery({ includeTopAds })}
          />
        </>
      ) : null}
      {organicAnalyticsQuery ? (
        <>
          <Choice
            label="Date window"
            value={organicAnalyticsQuery.dateRange}
            disabled={disabled}
            options={['7d', '14d', '30d', '90d'].map((value) => ({ value, label: value }))}
            onChange={(dateRange) => patchQuery({ dateRange })}
          />
          <Toggle
            label="Include insights"
            checked={organicAnalyticsQuery.includeInsights}
            disabled={disabled}
            onCheckedChange={(includeInsights) => patchQuery({ includeInsights })}
          />
        </>
      ) : null}
      {savedPromptQuery || savedSkillQuery ? (
        <Field
          label="Selected IDs"
          value={(savedPromptQuery ?? savedSkillQuery)?.ids.join(', ') ?? ''}
          disabled={disabled}
          onChange={(ids) => patchQuery({ ids: textList(ids) })}
          placeholder="Leave empty to search all"
        />
      ) : null}
      {previousRunQuery ? (
        <>
          <Field
            label="Automation ID"
            value={previousRunQuery.automationId ?? ''}
            disabled={disabled}
            onChange={(automationId) => patchQuery({ automationId: automationId || undefined })}
            placeholder="Current brand, any automation"
          />
          <Choice
            label="Selection"
            value={previousRunQuery.selection}
            disabled={disabled}
            options={[
              { value: 'last_successful', label: 'Last successful' },
              { value: 'latest', label: 'Latest' },
            ]}
            onChange={(selection) => patchQuery({ selection })}
          />
        </>
      ) : null}
      {connectedPlatformQuery ? (
        <>
          <Field
            label="Provider"
            value={connectedPlatformQuery.provider}
            disabled={disabled}
            onChange={(provider) => patchQuery({ provider })}
          />
          <Field
            label="Resource"
            value={connectedPlatformQuery.resource}
            disabled={disabled}
            onChange={(resource) => patchQuery({ resource })}
          />
        </>
      ) : null}
    </>
  );
}

function AgentEditor({
  node,
  disabled,
  onChange,
}: {
  node: Extract<AutomationWorkflowNode, { type: 'agent' }>;
  disabled: boolean;
  onChange: (config: WorkflowConfig) => void;
}) {
  const { config } = node;
  const patchPolicy = (patch: Partial<typeof config.policy>) =>
    onChange({ ...config, policy: { ...config.policy, ...patch } });
  const patchValidation = (patch: Partial<typeof config.validation>) =>
    onChange({ ...config, validation: { ...config.validation, ...patch } });

  return (
    <>
      <Choice
        label="Agent"
        value={config.agent}
        options={[
          { value: 'jaina', label: 'Jaina · paid intelligence' },
          { value: 'organic', label: 'Organic agent' },
        ]}
        disabled={disabled}
        onChange={(agent) => onChange({ ...config, agent: agent as 'jaina' | 'organic' })}
      />
      <PromptField
        label="Agent instructions"
        value={config.instructions}
        disabled={disabled}
        starters={agentStarters}
        placeholder="Tell the agent what to investigate, how to reason, and what a useful answer includes."
        description="Connected inputs are added as context automatically."
        onChange={(instructions) => onChange({ ...config, instructions })}
      />
      <Choice
        label="Output contract"
        value={config.outputFormat}
        options={['text', 'records', 'report'].map((value) => ({ value, label: value }))}
        disabled={disabled}
        onChange={(outputFormat) =>
          onChange({ ...config, outputFormat: outputFormat as 'text' | 'records' | 'report' })
        }
      />
      <Label>Stable capabilities</Label>
      <div className="grid gap-2 rounded-md border p-3">
        {automationAgentCapabilitySchema.options.map((capability) => {
          const checked = config.policy.capabilities.includes(capability);
          return (
            <div key={capability} className="flex items-center gap-2 text-xs">
              <Checkbox
                id={`capability-${capability}`}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) =>
                  patchPolicy({
                    capabilities: next
                      ? [...config.policy.capabilities, capability]
                      : config.policy.capabilities.filter((item) => item !== capability),
                  })
                }
              />
              <Label htmlFor={`capability-${capability}`}>{capability}</Label>
            </div>
          );
        })}
      </div>
      <Choice
        label="Tool selection"
        value={config.policy.toolMode}
        options={[
          { value: 'auto', label: 'Agent chooses within capabilities' },
          { value: 'required', label: 'Require exact tools · Advanced' },
        ]}
        disabled={disabled}
        onChange={(toolMode) => patchPolicy({ toolMode: toolMode as 'auto' | 'required' })}
      />
      {config.policy.toolMode === 'required' ? (
        <Field
          label="Required tool names"
          value={config.policy.requiredTools.join(', ')}
          disabled={disabled}
          onChange={(requiredTools) => patchPolicy({ requiredTools: textList(requiredTools) })}
          placeholder="get_key_metrics, get_top_ads"
        />
      ) : null}
      <Field
        label="Maximum agent steps"
        type="number"
        value={config.policy.maxSteps}
        disabled={disabled}
        onChange={(maxSteps) => patchPolicy({ maxSteps: Number(maxSteps) })}
      />
      <Field
        label="Minimum evidence events"
        type="number"
        value={config.validation.minimumEvidence}
        disabled={disabled}
        onChange={(minimumEvidence) =>
          patchValidation({ minimumEvidence: Number(minimumEvidence) })
        }
      />
      <Field
        label="Required report sections"
        value={config.validation.requiredReportSections.join(', ')}
        disabled={disabled}
        onChange={(requiredReportSections) =>
          patchValidation({ requiredReportSections: textList(requiredReportSections) })
        }
      />
      <Toggle
        label="Require output schema"
        checked={config.validation.requireSchema}
        disabled={disabled}
        onCheckedChange={(requireSchema) => patchValidation({ requireSchema })}
      />
      <Toggle
        label="Require downstream action receipt"
        checked={config.validation.requireActionReceipt}
        disabled={disabled}
        onCheckedChange={(requireActionReceipt) => patchValidation({ requireActionReceipt })}
      />
    </>
  );
}

/**
 * The endpoint id is minted by the Webhooks dialog and written back into the
 * node — a user typing one here could only ever break the binding, so this is
 * read-only on purpose and shows the delivery URL the caller actually needs.
 */
function ManagedEndpointSummary({
  endpointId,
  endpoints,
}: {
  endpointId: string | undefined;
  endpoints: AutomationWebhookEndpoint[];
}) {
  const endpoint = endpointId ? endpoints.find((candidate) => candidate.id === endpointId) : null;

  if (!endpointId) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Managed endpoint</Label>
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
          <Badge variant="warning">Not attached</Badge>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            Open Webhooks in the workspace header and create an endpoint for this node. Publishing
            is blocked until one is attached.
          </p>
        </div>
      </div>
    );
  }

  const deliveryUrl = endpoint ? automationWebhookDeliveryUrl(endpoint.publicId) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Managed endpoint</Label>
      <div className="rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Badge variant="success">Attached</Badge>
          <span className="truncate text-[11px] text-muted-foreground">
            {endpoint?.name ?? endpointId}
          </span>
        </div>
        {deliveryUrl ? (
          <div className="mt-2 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
              {deliveryUrl}
            </code>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Copy delivery URL"
              onClick={() => void copyAutomationValue(deliveryUrl, 'Delivery URL')}
            >
              <Copy aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            This endpoint belongs to another brand or was deleted. Create a new one from Webhooks.
          </p>
        )}
      </div>
    </div>
  );
}

export function NodeConfigurationEditor({
  node,
  disabled,
  onChange,
  sourceCapabilities,
  webhookDestinations,
  webhookEndpoints,
  brandId,
}: {
  node: AutomationWorkflowNode;
  disabled: boolean;
  onChange: (config: WorkflowConfig) => void;
  sourceCapabilities: AutomationCapabilitiesResponse | null;
  webhookDestinations?: AutomationWebhookDestination[];
  webhookEndpoints?: AutomationWebhookEndpoint[];
  /** Scopes every action picker's list. Absent ⇒ each picker degrades to its
   *  raw-id field rather than offering a list it cannot scope. */
  brandId?: string;
}) {
  switch (node.type) {
    case 'source':
      return (
        <SourceEditor
          node={node}
          disabled={disabled}
          onChange={onChange}
          sourceCapabilities={sourceCapabilities}
        />
      );
    case 'integration.query':
      return (
        <>
          <Choice
            label="Provider"
            value={node.config.provider}
            disabled={disabled}
            options={['meta', 'google', 'linkedin', 'tiktok', 'youtube'].map((value) => ({
              value,
              label: value,
            }))}
            onChange={(provider) =>
              onChange({
                ...node.config,
                provider: provider as typeof node.config.provider,
              })
            }
          />
          <Field
            label="Operation"
            value={node.config.operation}
            disabled={disabled}
            onChange={(operation) => onChange({ ...node.config, operation })}
          />
          <Field
            label="Connection ID"
            value={node.config.connectionId}
            disabled={disabled}
            onChange={(connectionId) => onChange({ ...node.config, connectionId })}
          />
          <JsonObjectField
            label="Parameters"
            value={node.config.parameters}
            disabled={disabled}
            onChange={(parameters) => onChange({ ...node.config, parameters })}
          />
          <Field
            label="Input schema hash"
            value={node.config.schemaHash}
            disabled={disabled}
            onChange={(schemaHash) => onChange({ ...node.config, schemaHash })}
          />
        </>
      );
    case 'mcp.read':
      return (
        <>
          {sourceCapabilities?.mcpReadTools.length ? (
            <Choice
              label="Read-only MCP tool"
              value={node.config.toolName}
              disabled={disabled}
              options={sourceCapabilities.mcpReadTools.map((tool) => ({
                value: tool.name,
                label: tool.name.replaceAll('_', ' '),
              }))}
              onChange={(toolName) => {
                const tool = sourceCapabilities.mcpReadTools.find(
                  (candidate) => candidate.name === toolName,
                );
                if (tool) {
                  onChange({
                    ...node.config,
                    toolName,
                    schemaHash: tool.schemaHash,
                  });
                }
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              No approved read-only MCP tools are available from this environment.
            </p>
          )}
          <JsonObjectField
            label="Arguments"
            value={node.config.arguments}
            disabled={disabled}
            onChange={(argumentsValue) => onChange({ ...node.config, arguments: argumentsValue })}
          />
          <p className="font-mono text-[11px] text-muted-foreground">
            Schema {node.config.schemaHash.slice(0, 12)}
          </p>
        </>
      );
    case 'agent':
      return <AgentEditor node={node} disabled={disabled} onChange={onChange} />;
    case 'output.formatter':
      return (
        <>
          <Choice
            label="Output contract"
            value={
              node.config.contract.kind === 'native' ? node.config.contract.contractId : 'custom'
            }
            disabled={disabled}
            options={[...NATIVE_CONTRACT_OPTIONS, { value: 'custom', label: 'Custom JSON schema' }]}
            onChange={(contractId) => {
              if (isRegisteredNativeOutputContractId(contractId)) {
                onChange({
                  ...node.config,
                  contract: { kind: 'native', contractId, version: 1 },
                });
              } else if (contractId === 'custom') {
                onChange({
                  ...node.config,
                  contract: {
                    kind: 'custom',
                    contractId: 'custom.workflow_output',
                    version: 1,
                    name: 'Custom workflow output',
                    schema: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', maxLength: 300 },
                        summary: { type: 'string', maxLength: 4_000 },
                      },
                      required: ['title', 'summary'],
                      additionalProperties: false,
                    },
                  },
                });
              }
            }}
          />
          {node.config.contract.kind === 'custom' ? (
            <>
              <Field
                label="Contract ID"
                value={node.config.contract.contractId}
                disabled={disabled}
                onChange={(contractId) => {
                  const contract = node.config.contract;
                  if (contract.kind !== 'custom') return;
                  onChange({
                    ...node.config,
                    contract: { ...contract, contractId },
                  });
                }}
                placeholder="custom.workflow_output"
              />
              <Field
                label="Contract name"
                value={node.config.contract.name}
                disabled={disabled}
                onChange={(name) => {
                  const contract = node.config.contract;
                  if (contract.kind !== 'custom') return;
                  onChange({
                    ...node.config,
                    contract: { ...contract, name },
                  });
                }}
              />
              <JsonObjectField
                label="JSON Schema"
                value={node.config.contract.schema}
                disabled={disabled}
                onChange={(schema) => {
                  const contract = node.config.contract;
                  if (contract.kind !== 'custom') return;
                  onChange({
                    ...node.config,
                    contract: { ...contract, schema },
                  });
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Custom schemas require explicit types, closed objects, required properties, bounded
                arrays, and no recursive references.
              </p>
            </>
          ) : null}
          <PromptField
            label="Formatting instructions"
            value={node.config.instructions}
            disabled={disabled}
            starters={formatterStarters}
            placeholder="Describe how upstream artifacts should be fitted into the output contract."
            onChange={(instructions) => onChange({ ...node.config, instructions })}
          />
          <p className="text-xs text-muted-foreground">
            The formatter has no tools. It can only fit labeled upstream artifacts into this
            validated contract.
          </p>
        </>
      );
    case 'instruction':
      return (
        <PromptField
          label="Prompt and operating rules"
          value={node.config.text}
          disabled={disabled}
          rows={10}
          placeholder="Add durable context, constraints, tone, and evidence rules for downstream agents."
          description="This text becomes reusable context for connected steps."
          onChange={(text) => onChange({ text })}
        />
      );
    case 'report':
      return (
        <>
          <Field
            label="Title"
            value={node.config.title}
            disabled={disabled}
            onChange={(title) => onChange({ ...node.config, title })}
          />
          <p className="text-[11px] leading-4 text-muted-foreground">
            The title heads the rendered report. Objective, audience and sections describe the
            report you want written — they shape the upstream formatter&rsquo;s target rather than
            this step. A formatter that returns complete markdown is passed through as authored.
          </p>
          <PromptField
            label="Objective"
            value={node.config.objective}
            disabled={disabled}
            rows={4}
            starters={agentStarters}
            placeholder="What decision should this report help its audience make?"
            onChange={(objective) => onChange({ ...node.config, objective })}
          />
          <Field
            label="Audience"
            value={node.config.audience}
            disabled={disabled}
            onChange={(audience) => onChange({ ...node.config, audience })}
          />
          <Label>Required sections</Label>
          {node.config.sections.map((section, index) => (
            <div key={section.id} className="space-y-2 rounded-md border p-3">
              <div className="flex gap-2">
                <Input
                  value={section.heading}
                  disabled={disabled}
                  onChange={(event) => {
                    const sections = [...node.config.sections];
                    sections[index] = { ...section, heading: event.target.value };
                    onChange({ ...node.config, sections });
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={disabled || node.config.sections.length === 1}
                  onClick={() =>
                    onChange({
                      ...node.config,
                      sections: node.config.sections.filter((item) => item.id !== section.id),
                    })
                  }
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
              <Textarea
                value={section.guidance}
                disabled={disabled}
                onChange={(event) => {
                  const sections = [...node.config.sections];
                  sections[index] = { ...section, guidance: event.target.value };
                  onChange({ ...node.config, sections });
                }}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={disabled || node.config.sections.length >= 24}
            onClick={() =>
              onChange({
                ...node.config,
                sections: [
                  ...node.config.sections,
                  {
                    id: `section-${crypto.randomUUID().slice(0, 6)}`,
                    heading: 'New section',
                    guidance: '',
                    required: true,
                  },
                ],
              })
            }
          >
            <Plus data-icon="inline-start" /> Add section
          </Button>
        </>
      );
    case 'trigger.schedule': {
      const schedule = node.config.schedule;
      return (
        <>
          <Choice
            label="Cadence"
            value={schedule.kind}
            disabled={disabled}
            options={['daily', 'weekly', 'monthly', 'cron'].map((value) => ({
              value,
              label: value,
            }))}
            onChange={(kind) => {
              const timezone = schedule.timezone;
              const next =
                kind === 'daily'
                  ? { kind: 'daily' as const, time: '09:00', timezone }
                  : kind === 'weekly'
                    ? { kind: 'weekly' as const, dayOfWeek: 1, time: '09:00', timezone }
                    : kind === 'monthly'
                      ? { kind: 'monthly' as const, dayOfMonth: 1, time: '09:00', timezone }
                      : { kind: 'cron' as const, expr: '0 9 * * 1', timezone };
              onChange({ schedule: next });
            }}
          />
          {schedule.kind === 'cron' ? (
            <Field
              label="Cron expression"
              value={schedule.expr}
              disabled={disabled}
              onChange={(expr) => onChange({ schedule: { ...schedule, expr } })}
            />
          ) : (
            <Field
              label="Time"
              type="time"
              value={schedule.time}
              disabled={disabled}
              onChange={(time) => onChange({ schedule: { ...schedule, time } })}
            />
          )}
          {schedule.kind === 'weekly' ? (
            <Field
              label="Day of week · 0–6"
              type="number"
              value={schedule.dayOfWeek}
              disabled={disabled}
              onChange={(dayOfWeek) =>
                onChange({ schedule: { ...schedule, dayOfWeek: Number(dayOfWeek) } })
              }
            />
          ) : null}
          {schedule.kind === 'monthly' ? (
            <Field
              label="Day of month · 1–28"
              type="number"
              value={schedule.dayOfMonth}
              disabled={disabled}
              onChange={(dayOfMonth) =>
                onChange({ schedule: { ...schedule, dayOfMonth: Number(dayOfMonth) } })
              }
            />
          ) : null}
          <Field
            label="Timezone"
            value={schedule.timezone}
            disabled={disabled}
            onChange={(timezone) => onChange({ schedule: { ...schedule, timezone } })}
          />
        </>
      );
    }
    case 'trigger.manual':
    case 'logic.parallel':
      return (
        <p className="text-xs text-muted-foreground">This node has no additional configuration.</p>
      );
    case 'trigger.event':
      return (
        <Field
          label="Event type"
          value={node.config.eventType}
          disabled={disabled}
          onChange={(eventType) =>
            onChange({ ...node.config, eventType: eventType as typeof node.config.eventType })
          }
        />
      );
    case 'trigger.metric':
      return (
        <>
          <Field
            label="Metric"
            value={node.config.metric}
            disabled={disabled}
            onChange={(metric) => onChange({ ...node.config, metric })}
          />
          <Choice
            label="Operator"
            value={node.config.operator}
            disabled={disabled}
            options={['gt', 'gte', 'lt', 'lte', 'eq', 'changed_by'].map((value) => ({
              value,
              label: value,
            }))}
            onChange={(operator) =>
              onChange({ ...node.config, operator: operator as typeof node.config.operator })
            }
          />
          <Field
            label="Value"
            type="number"
            value={node.config.value}
            disabled={disabled}
            onChange={(value) => onChange({ ...node.config, value: Number(value) })}
          />
          <Field
            label="Cooldown minutes"
            type="number"
            value={node.config.cooldownMinutes}
            disabled={disabled}
            onChange={(cooldownMinutes) =>
              onChange({ ...node.config, cooldownMinutes: Number(cooldownMinutes) })
            }
          />
        </>
      );
    case 'trigger.webhook':
      return (
        <>
          <ManagedEndpointSummary
            endpointId={node.config.endpointId}
            endpoints={webhookEndpoints ?? []}
          />
          <JsonObjectField
            label="Payload schema"
            value={node.config.payloadSchema}
            disabled={disabled}
            onChange={(payloadSchema) => onChange({ ...node.config, payloadSchema })}
          />
        </>
      );
    case 'logic.if': {
      const condition = node.config.condition;
      return (
        <>
          <Field
            label="Value path"
            value={condition.path}
            disabled={disabled}
            onChange={(path) => onChange({ ...node.config, condition: { ...condition, path } })}
          />
          <Choice
            label="Operator"
            value={condition.operator}
            disabled={disabled}
            options={['exists', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'].map((value) => ({
              value,
              label: value,
            }))}
            onChange={(operator) =>
              onChange({
                ...node.config,
                condition: { ...condition, operator: operator as typeof condition.operator },
              })
            }
          />
          <Field
            label="Compare value"
            value={condition.value == null ? '' : String(condition.value)}
            disabled={disabled}
            onChange={(value) => onChange({ ...node.config, condition: { ...condition, value } })}
          />
        </>
      );
    }
    case 'logic.repeat_until':
      return (
        <Field
          label="Iterations"
          type="number"
          value={node.config.iterations}
          disabled={disabled}
          onChange={(iterations) => onChange({ iterations: Number(iterations) })}
        />
      );
    case 'logic.switch':
      return (
        <>
          <Field
            label="Value path"
            value={node.config.path}
            disabled={disabled}
            onChange={(path) => onChange({ ...node.config, path })}
          />
          <Field
            label="Cases · label=value"
            value={node.config.cases.map((item) => `${item.label}=${item.value}`).join(', ')}
            disabled={disabled}
            onChange={(value) =>
              onChange({
                ...node.config,
                cases: textList(value).map((entry, index) => {
                  const [label, caseValue = label] = entry.split('=');
                  return { id: `case-${index + 1}`, label, value: caseValue };
                }),
              })
            }
          />
        </>
      );
    case 'logic.join':
      return (
        <Choice
          label="Wait mode"
          value={node.config.mode}
          disabled={disabled}
          options={[
            { value: 'all', label: 'All branches' },
            { value: 'any', label: 'Any branch' },
          ]}
          onChange={(mode) => onChange({ mode: mode as 'all' | 'any' })}
        />
      );
    case 'action.email':
      return (
        <>
          <Field
            label="Subject"
            value={node.config.subject}
            disabled={disabled}
            onChange={(subject) => onChange({ ...node.config, subject })}
          />
          <Field
            label="External recipients"
            value={node.config.recipients.externalEmails.join(', ')}
            disabled={disabled}
            onChange={(value) =>
              onChange({
                ...node.config,
                recipients: { ...node.config.recipients, externalEmails: textList(value) },
              })
            }
            placeholder="name@example.com"
          />
          <Field
            label="Member user IDs"
            value={node.config.recipients.memberUserIds.join(', ')}
            disabled={disabled}
            onChange={(value) =>
              onChange({
                ...node.config,
                recipients: { ...node.config.recipients, memberUserIds: textList(value) },
              })
            }
          />
        </>
      );
    case 'action.outbound_webhook':
      return (
        <>
          <Choice
            label="Managed destination"
            value={node.config.destinationId ?? 'select-destination'}
            disabled={disabled}
            options={[
              {
                value: 'select-destination',
                label: 'Select a destination',
                disabled: true,
              },
              ...(webhookDestinations ?? []).map((destination) => ({
                value: destination.id,
                label: `${destination.name} · ${destination.method}`,
                disabled: !destination.enabled,
              })),
            ]}
            onChange={(destinationId) => {
              const destination = (webhookDestinations ?? []).find(
                (candidate) => candidate.id === destinationId,
              );
              if (destination) {
                onChange({
                  ...node.config,
                  destinationId,
                  method: destination.method,
                });
              }
            }}
          />
          {node.config.destinationId ? null : (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
              <Badge variant="warning">Needs setup</Badge>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                {(webhookDestinations ?? []).length === 0
                  ? 'No signed destinations exist yet. Open Webhooks in the workspace header to create one.'
                  : 'Select a signed destination. This step cannot run or publish until one is chosen.'}
              </p>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            The destination owns its URL, method, signing secret, and retry ledger.
          </p>
        </>
      );
    case 'action.library_save': {
      // Written through the resolver, so a draft still carrying the legacy
      // `folderId` alias is read correctly and upgraded on the next save.
      const target = resolveAutomationLibrarySaveConfig(node.config);
      return (
        <>
          <ActionCapabilityNotice type={node.type} capabilities={sourceCapabilities} />
          <LibraryCollectionPicker
            brandId={brandId}
            value={target.collectionId}
            disabled={disabled}
            onChange={(collectionId) => onChange({ ...target, collectionId })}
          />
          <Field
            label="Title template"
            value={target.titleTemplate}
            disabled={disabled}
            onChange={(titleTemplate) => onChange({ ...target, titleTemplate })}
          />
        </>
      );
    }
    case 'action.planner_upsert': {
      const target = resolveAutomationPlannerUpsertConfig(node.config);
      return (
        <>
          <ActionCapabilityNotice type={node.type} capabilities={sourceCapabilities} />
          <PlannerTargetPicker
            brandId={brandId}
            value={{ platform: target.platform, accountId: target.accountId }}
            disabled={disabled}
            onChange={(next) => onChange({ ...target, ...next })}
          />
          <Field
            label="Drafts path"
            value={target.itemsPath}
            disabled={disabled}
            placeholder={AUTOMATION_PLANNER_UPSERT_DEFAULTS.itemsPath}
            onChange={(itemsPath) => onChange({ ...target, itemsPath })}
          />
          <Field
            label="Maximum drafts per run"
            type="number"
            value={target.maxDrafts}
            disabled={disabled}
            onChange={(maxDrafts) =>
              onChange({
                ...target,
                maxDrafts: boundedInteger(maxDrafts, target.maxDrafts, 1, 50),
              })
            }
          />
        </>
      );
    }
    case 'action.organic_publish': {
      const selector = resolveAutomationOrganicPublishConfig(node.config);
      return (
        <>
          <ActionCapabilityNotice type={node.type} capabilities={sourceCapabilities} />
          <OrganicPublishTargetPicker
            brandId={brandId}
            value={{ platform: selector.platform, accountId: selector.accountId }}
            disabled={disabled}
            onChange={(next) => onChange({ ...selector, ...next })}
          />
          <Field
            label="Schedule lookahead (hours)"
            type="number"
            value={selector.lookaheadHours}
            disabled={disabled}
            onChange={(lookaheadHours) =>
              onChange({
                ...selector,
                lookaheadHours: boundedInteger(lookaheadHours, selector.lookaheadHours, 1, 168),
              })
            }
          />
          <Field
            label="Maximum posts per run"
            type="number"
            value={selector.maxPosts}
            disabled={disabled}
            onChange={(maxPosts) =>
              onChange({
                ...selector,
                maxPosts: boundedInteger(maxPosts, selector.maxPosts, 1, 25),
              })
            }
          />
          <p className="text-[11px] leading-4 text-muted-foreground">
            Approved drafts scheduled within the lookahead are published. A past-due draft is caught
            up, which is why there is no lower bound.
          </p>
        </>
      );
    }
    case 'action.ai_studio_generate': {
      const request = resolveAutomationAiStudioGenerateConfig(node.config);
      return (
        <>
          <ActionCapabilityNotice type={node.type} capabilities={sourceCapabilities} />
          <Choice
            label="Generator"
            value={request.generator}
            disabled={disabled}
            options={automationAiStudioGeneratorSchema.options.map((generator) => ({
              value: generator,
              label: generator === 'image' ? 'Image' : 'Video',
            }))}
            onChange={(generator) =>
              onChange({
                ...request,
                generator: generator as AutomationAiStudioGenerator,
              })
            }
          />
          <PromptField
            label="Generation instructions"
            value={request.instructions}
            disabled={disabled}
            placeholder="Describe the asset to create, including format, composition, and constraints."
            onChange={(instructions) => onChange({ ...request, instructions })}
          />
          <Field
            label="Outputs per run"
            type="number"
            value={request.maxOutputs}
            disabled={disabled}
            onChange={(maxOutputs) =>
              onChange({
                ...request,
                maxOutputs: boundedInteger(maxOutputs, request.maxOutputs, 1, 4),
              })
            }
          />
          <AiStudioRoomPicker
            brandId={brandId}
            value={request.roomId}
            disabled={disabled}
            onChange={(roomId) => onChange({ ...request, roomId })}
          />
          <p className="text-[11px] leading-4 text-muted-foreground">
            An automation runs headless, so it can only reach the image and video generators. A
            saved Studio workflow is replayed by the canvas in a browser and cannot be scheduled.
          </p>
        </>
      );
    }
    case 'action.paid_optimizer': {
      const target = resolveAutomationPaidOptimizerConfig(node.config);
      return (
        <>
          <ActionCapabilityNotice type={node.type} capabilities={sourceCapabilities} />
          <PaidPortfolioPicker
            brandId={brandId}
            value={target.portfolioId}
            disabled={disabled}
            onChange={(portfolioId) => onChange({ ...target, portfolioId })}
          />
          <Choice
            label="Operation"
            value={target.operation}
            disabled={disabled}
            options={paidOptimizerOperationOptions}
            onChange={(operation) =>
              onChange({
                ...target,
                operation: operation as AutomationPaidOptimizerOperation,
              })
            }
          />
          <Field
            label="Maximum budget change per apply (%)"
            type="number"
            value={target.maxBudgetDeltaPct ?? ''}
            disabled={disabled}
            placeholder="No cap"
            onChange={(raw) => onChange({ ...target, maxBudgetDeltaPct: boundedPercent(raw) })}
          />
          <p className="text-[11px] leading-4 text-muted-foreground">
            Pausing an ad is human-only and there is no entity-addressed budget write, so an
            automation either runs a cycle or applies what a human already approved.
          </p>
        </>
      );
    }
  }
}
