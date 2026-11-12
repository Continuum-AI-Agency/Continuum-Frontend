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
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
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
import { toast } from '@/components/ui/toast-imperative';
import { automationCapabilityDescription } from '@/i18n/automationCapability';
import { localizeAutomationsCopy } from '@/i18n/automationsCopy';
import { getApiUrl } from '@/lib/api/config';
import { buildAutomationSourceOptions } from '@/lib/automations/source-options';
import { cn } from '@/lib/utils';
import { automationControlLabel } from './automationControlLabels';
import { AiStudioRoomPicker } from './pickers/AiStudioRoomPicker';
import { LibraryCollectionPicker } from './pickers/LibraryCollectionPicker';
import { OrganicPublishTargetPicker } from './pickers/OrganicPublishTargetPicker';
import { PaidPortfolioPicker } from './pickers/PaidPortfolioPicker';
import { PipelinePicker } from './pickers/PipelinePicker';
import { PlannerTargetPicker } from './pickers/PlannerTargetPicker';

type WorkflowConfig = AutomationWorkflowNode['config'];

export const automationWebhookDeliveryUrl = (publicId: string): string =>
  getApiUrl(`/api/automations/hooks/${publicId}`);

export async function copyAutomationValue(
  value: string,
  label: string,
  translate: ReturnType<typeof useTranslations<'automations'>>,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(translate('copiedValue', { label }));
  } catch {
    toast.error(translate('copyFailed', { label }), {
      description: translate('clipboardBlocked'),
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
  const uiText = useTranslations('automations');
  const capability = capabilities?.actions?.find((action) => action.type === type);
  if (!capability) return null;
  if (capability.availability === 'ready' && capability.lifecycle === 'production') return null;

  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
      <Badge variant="warning">
        {capability.availability === 'needs_connection'
          ? uiText('needs_connection_d919fde')
          : uiText('limited_e5125d9')}
      </Badge>
      <p className="mt-2 text-xs leading-4 text-muted-foreground">
        {automationCapabilityDescription(capability, uiText)}
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
  const uiText = useTranslations('automations');
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
        <InputGroupText className="font-mono text-2xs">
          {uiText('m_64ad09e102', { count: wordCount })}
        </InputGroupText>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <InputGroupButton
                  aria-label={uiText('add_prompt_starter_44c1033')}
                  title={uiText('add_prompt_starter_44c1033')}
                  disabled={disabled}
                >
                  <Sparkles aria-hidden="true" />
                  {uiText('quick_start_0eb95fb')}
                </InputGroupButton>
              }
            />
            <DropdownMenuContent
              align="end"
              className="automation-workflow-popover w-72 rounded-lg p-1.5"
            >
              <DropdownMenuLabel>{uiText('prompt_starters_b59058b')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {starters.map((starter) => (
                <DropdownMenuItem
                  key={starter.label}
                  className="items-start"
                  onSelect={() => appendStarter(starter.text)}
                >
                  <Lightbulb aria-hidden="true" />
                  <span>
                    <span className="block text-xs font-medium">
                      {localizeAutomationsCopy(starter.label, uiText)}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-muted-foreground">
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
              aria-label={uiText('clear_prompt_e327c46')}
              title={uiText('clear_prompt_e327c46')}
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
                    aria-label={uiText('open_large_prompt_editor_984bf31')}
                    title={uiText('open_large_prompt_editor_984bf31')}
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
                    {uiText('write_the_operating_context_this_step_should__2497c96')}
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
        <p className="text-xs leading-4 text-muted-foreground">{description}</p>
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
  const uiText = useTranslations('automations');
  const id = useId();
  const serialized = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(serialized), [serialized]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        aria-describedby={error ? `${id}-error` : undefined}
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
              setError(uiText('m_9879fa8463'));
              return;
            }
            setError(null);
            onChange(parsed as Record<string, unknown>);
          } catch {
            setError(uiText('m_9cc456f76c'));
          }
        }}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
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
  const uiText = useTranslations('automations');
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
                {option.preview ? <Badge variant="muted">{uiText('preview_324b134')}</Badge> : null}
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
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
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
  const uiText = useTranslations('automations');
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
    translate: uiText,
  });
  const patchQuery = (patch: Record<string, unknown>) =>
    onChange({ ...config, query: { ...query, ...patch } });

  return (
    <>
      <Choice
        label={uiText('source_0e570ca')}
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
              {capability.availability === 'needs_connection'
                ? uiText('needs_connection_d919fde')
                : uiText('unavailable_ca18449')}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-4 text-muted-foreground">
            {automationCapabilityDescription(capability, uiText)}
          </p>
        </div>
      ) : null}
      <Choice
        label={uiText('read_mode_76e4a96')}
        value={config.mode}
        options={[
          { value: 'live', label: uiText('live_at_run_time_9c913c2') },
          { value: 'pinned', label: uiText('pinned_records_de0378b') },
        ]}
        disabled={disabled}
        onChange={(mode) => onChange({ ...config, mode: mode as 'live' | 'pinned' })}
      />
      {config.mode === 'pinned' ? (
        <Field
          label={uiText('pinned_record_ids_7132054')}
          value={config.pinnedIds.join(', ')}
          disabled={disabled}
          onChange={(value) => onChange({ ...config, pinnedIds: textList(value) })}
          placeholder="id-1, id-2"
        />
      ) : null}
      {'search' in query ? (
        <Field
          label={uiText('search_49c266b')}
          value={String(query.search)}
          disabled={disabled}
          onChange={(search) => patchQuery({ search })}
          placeholder={uiText('optional_filters_e94edc8')}
        />
      ) : null}
      {'limit' in query ? (
        <Field
          label={uiText('result_limit_989d839')}
          type="number"
          value={Number(query.limit)}
          disabled={disabled}
          onChange={(limit) => patchQuery({ limit: Number(limit) })}
        />
      ) : null}
      {libraryQuery ? (
        <>
          <Field
            label={uiText('tags_1331275')}
            value={libraryQuery.tags.join(', ')}
            disabled={disabled}
            onChange={(tags) => patchQuery({ tags: textList(tags) })}
            placeholder={uiText('m_d19e359c18')}
          />
          <Choice
            label={uiText('review_status_a410d70')}
            value={libraryQuery.reviewStatus ?? 'any'}
            disabled={disabled}
            options={[
              { value: 'any', label: uiText('any_2b50559') },
              { value: 'draft', label: uiText('draft_ebf12ef') },
              { value: 'in_review', label: uiText('in_review_c390591') },
              { value: 'needs_changes', label: uiText('needs_changes_17fa92a') },
              { value: 'approved', label: uiText('approved_87b42e4') },
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
            label={uiText('meta_ad_account_015c9a5')}
            value={paidAnalyticsQuery.adAccountId}
            disabled={disabled}
            onChange={(adAccountId) => patchQuery({ adAccountId })}
            placeholder={uiText('m_c33e8472e2')}
          />
          <Choice
            label={uiText('date_window_3fbabec')}
            value={paidAnalyticsQuery.datePreset}
            disabled={disabled}
            options={[
              { value: 'last_7d', label: uiText('last_7_days_0603dec') },
              { value: 'last_14d', label: uiText('last_14_days_d9f1e16') },
              { value: 'last_30d', label: uiText('last_30_days_f8f03fb') },
            ]}
            onChange={(datePreset) => patchQuery({ datePreset })}
          />
          <Choice
            label={uiText('level_1709305')}
            value={paidAnalyticsQuery.level}
            disabled={disabled}
            options={['account', 'campaign', 'adset', 'ad'].map((value) => ({
              value,
              label: automationControlLabel(value, uiText),
            }))}
            onChange={(level) => patchQuery({ level })}
          />
          <Field
            label={uiText('object_id_f79ceb0')}
            value={paidAnalyticsQuery.objectId}
            disabled={disabled}
            onChange={(objectId) => patchQuery({ objectId })}
            placeholder={uiText('m_7414d45e7a')}
          />
          <Field
            label={uiText('metrics_a58da79')}
            value={paidAnalyticsQuery.metrics.join(', ')}
            disabled={disabled}
            onChange={(metrics) => patchQuery({ metrics: textList(metrics) })}
            placeholder="spend, impressions, clicks"
          />
          <Toggle
            label={uiText('include_top_ads_8dc161d')}
            checked={paidAnalyticsQuery.includeTopAds}
            disabled={disabled}
            onCheckedChange={(includeTopAds) => patchQuery({ includeTopAds })}
          />
        </>
      ) : null}
      {organicAnalyticsQuery ? (
        <>
          <Choice
            label={uiText('date_window_3fbabec')}
            value={organicAnalyticsQuery.dateRange}
            disabled={disabled}
            options={['7d', '14d', '30d', '90d'].map((value) => ({
              value,
              label: automationControlLabel(value, uiText),
            }))}
            onChange={(dateRange) => patchQuery({ dateRange })}
          />
          <Toggle
            label={uiText('include_insights_c3a4420')}
            checked={organicAnalyticsQuery.includeInsights}
            disabled={disabled}
            onCheckedChange={(includeInsights) => patchQuery({ includeInsights })}
          />
        </>
      ) : null}
      {savedPromptQuery || savedSkillQuery ? (
        <Field
          label={uiText('selected_ids_bc7be1d')}
          value={(savedPromptQuery ?? savedSkillQuery)?.ids.join(', ') ?? ''}
          disabled={disabled}
          onChange={(ids) => patchQuery({ ids: textList(ids) })}
          placeholder={uiText('leave_empty_to_search_all_6242ae0')}
        />
      ) : null}
      {previousRunQuery ? (
        <>
          <Field
            label={uiText('automation_id_f1c42f9')}
            value={previousRunQuery.automationId ?? ''}
            disabled={disabled}
            onChange={(automationId) => patchQuery({ automationId: automationId || undefined })}
            placeholder={uiText('current_brand_any_automation_5e9c33d')}
          />
          <Choice
            label={uiText('selection_ca40670')}
            value={previousRunQuery.selection}
            disabled={disabled}
            options={[
              { value: 'last_successful', label: uiText('last_successful_c4fdea6') },
              { value: 'latest', label: uiText('latest_8730d3c') },
            ]}
            onChange={(selection) => patchQuery({ selection })}
          />
        </>
      ) : null}
      {connectedPlatformQuery ? (
        <>
          <Field
            label={uiText('provider_472590a')}
            value={connectedPlatformQuery.provider}
            disabled={disabled}
            onChange={(provider) => patchQuery({ provider })}
          />
          <Field
            label={uiText('resource_eb7a842')}
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
  const uiText = useTranslations('automations');
  const { config } = node;
  const patchPolicy = (patch: Partial<typeof config.policy>) =>
    onChange({ ...config, policy: { ...config.policy, ...patch } });
  const patchValidation = (patch: Partial<typeof config.validation>) =>
    onChange({ ...config, validation: { ...config.validation, ...patch } });

  return (
    <>
      <Choice
        label={uiText('agent_11b39c9')}
        value={config.agent}
        options={[
          { value: 'jaina', label: uiText('jaina_paid_intelligence_f4c6707') },
          { value: 'organic', label: uiText('organic_agent_8baef17') },
        ]}
        disabled={disabled}
        onChange={(agent) => onChange({ ...config, agent: agent as 'jaina' | 'organic' })}
      />
      <PromptField
        label={uiText('agent_instructions_dc390e1')}
        value={config.instructions}
        disabled={disabled}
        starters={agentStarters}
        placeholder={uiText('tell_the_agent_what_to_investigate_how_to_rea_1ef6a2d')}
        description={uiText('connected_inputs_are_added_as_context_automat_5cf4305')}
        onChange={(instructions) => onChange({ ...config, instructions })}
      />
      <Choice
        label={uiText('output_contract_42a53c9')}
        value={config.outputFormat}
        options={['text', 'records', 'report'].map((value) => ({
          value,
          label: automationControlLabel(value, uiText),
        }))}
        disabled={disabled}
        onChange={(outputFormat) =>
          onChange({ ...config, outputFormat: outputFormat as 'text' | 'records' | 'report' })
        }
      />
      <Label>{uiText('stable_capabilities_5c8e506')}</Label>
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
              <Label htmlFor={`capability-${capability}`}>
                {automationControlLabel(capability, uiText)}
              </Label>
            </div>
          );
        })}
      </div>
      <Choice
        label={uiText('tool_selection_b304cd5')}
        value={config.policy.toolMode}
        options={[
          { value: 'auto', label: uiText('agent_chooses_within_capabilities_e329575') },
          { value: 'required', label: uiText('require_exact_tools_advanced_60b7295') },
        ]}
        disabled={disabled}
        onChange={(toolMode) => patchPolicy({ toolMode: toolMode as 'auto' | 'required' })}
      />
      {config.policy.toolMode === 'required' ? (
        <Field
          label={uiText('required_tool_names_cefad0d')}
          value={config.policy.requiredTools.join(', ')}
          disabled={disabled}
          onChange={(requiredTools) => patchPolicy({ requiredTools: textList(requiredTools) })}
          placeholder="get_key_metrics, get_top_ads"
        />
      ) : null}
      <Field
        label={uiText('maximum_agent_steps_b338088')}
        type="number"
        value={config.policy.maxSteps}
        disabled={disabled}
        onChange={(maxSteps) => patchPolicy({ maxSteps: Number(maxSteps) })}
      />
      <Field
        label={uiText('minimum_evidence_events_81e38e4')}
        type="number"
        value={config.validation.minimumEvidence}
        disabled={disabled}
        onChange={(minimumEvidence) =>
          patchValidation({ minimumEvidence: Number(minimumEvidence) })
        }
      />
      <Field
        label={uiText('required_report_sections_b8097f9')}
        value={config.validation.requiredReportSections.join(', ')}
        disabled={disabled}
        onChange={(requiredReportSections) =>
          patchValidation({ requiredReportSections: textList(requiredReportSections) })
        }
      />
      <Toggle
        label={uiText('require_output_schema_858661f')}
        checked={config.validation.requireSchema}
        disabled={disabled}
        onCheckedChange={(requireSchema) => patchValidation({ requireSchema })}
      />
      <Toggle
        label={uiText('require_downstream_action_receipt_bf1e62e')}
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
  const uiText = useTranslations('automations');
  const endpoint = endpointId ? endpoints.find((candidate) => candidate.id === endpointId) : null;

  if (!endpointId) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{uiText('managed_endpoint_108138a')}</Label>
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
          <Badge variant="warning">{uiText('not_attached_8d54763')}</Badge>
          <p className="mt-2 text-xs leading-4 text-muted-foreground">
            {uiText('open_webhooks_in_the_workspace_header_and_cre_b395960')}
          </p>
        </div>
      </div>
    );
  }

  const deliveryUrl = endpoint ? automationWebhookDeliveryUrl(endpoint.publicId) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{uiText('managed_endpoint_108138a')}</Label>
      <div className="rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Badge variant="success">{uiText('attached_ac6d9b7')}</Badge>
          <span className="truncate text-xs text-muted-foreground">
            {endpoint?.name ?? endpointId}
          </span>
        </div>
        {deliveryUrl ? (
          <div className="mt-2 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
              {deliveryUrl}
            </code>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={uiText('copy_delivery_url_b0b0c85')}
              onClick={() => void copyAutomationValue(deliveryUrl, uiText('deliveryUrl'), uiText)}
            >
              <Copy aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs leading-4 text-muted-foreground">
            {uiText('this_endpoint_belongs_to_another_brand_or_was_ccce06e')}
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
  const uiText = useTranslations('automations');
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
            label={uiText('provider_472590a')}
            value={node.config.provider}
            disabled={disabled}
            options={['meta', 'google', 'linkedin', 'tiktok', 'youtube'].map((value) => ({
              value,
              label: automationControlLabel(value, uiText),
            }))}
            onChange={(provider) =>
              onChange({
                ...node.config,
                provider: provider as typeof node.config.provider,
              })
            }
          />
          <Field
            label={uiText('operation_0f044fe')}
            value={node.config.operation}
            disabled={disabled}
            onChange={(operation) => onChange({ ...node.config, operation })}
          />
          <Field
            label={uiText('connection_id_f8ca8ad')}
            value={node.config.connectionId}
            disabled={disabled}
            onChange={(connectionId) => onChange({ ...node.config, connectionId })}
          />
          <JsonObjectField
            label={uiText('parameters_e68b36b')}
            value={node.config.parameters}
            disabled={disabled}
            onChange={(parameters) => onChange({ ...node.config, parameters })}
          />
          <Field
            label={uiText('input_schema_hash_742a4c3')}
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
              label={uiText('read_only_mcp_tool_f59da23')}
              value={node.config.toolName}
              disabled={disabled}
              options={sourceCapabilities.mcpReadTools.map((tool) => ({
                value: tool.name,
                label: tool.name,
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
              {uiText('no_approved_read_only_mcp_tools_are_available_c059c74')}
            </p>
          )}
          <JsonObjectField
            label={uiText('arguments_7f81607')}
            value={node.config.arguments}
            disabled={disabled}
            onChange={(argumentsValue) => onChange({ ...node.config, arguments: argumentsValue })}
          />
          <p className="font-mono text-xs text-muted-foreground">
            {uiText.rich('sentence_c080f81ef552', {
              v0: () => node.config.schemaHash.slice(0, 12),
            })}
          </p>
        </>
      );
    case 'agent':
      return <AgentEditor node={node} disabled={disabled} onChange={onChange} />;
    case 'output.formatter':
      return (
        <>
          <Choice
            label={uiText('output_contract_42a53c9')}
            value={
              node.config.contract.kind === 'native' ? node.config.contract.contractId : 'custom'
            }
            disabled={disabled}
            options={[
              ...NATIVE_CONTRACT_OPTIONS.map((option) => ({
                ...option,
                label: localizeAutomationsCopy(option.label, uiText),
              })),
              { value: 'custom', label: uiText('custom_json_schema_ea95841') },
            ]}
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
                label={uiText('contract_id_0b6d2e4')}
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
                label={uiText('contract_name_974ed1d')}
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
                label={uiText('json_schema_13a8f29')}
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
              <p className="text-xs text-muted-foreground">
                {uiText('custom_schemas_require_explicit_types_closed__b6c1fd0')}
              </p>
            </>
          ) : null}
          <PromptField
            label={uiText('formatting_instructions_2fa2413')}
            value={node.config.instructions}
            disabled={disabled}
            starters={formatterStarters}
            placeholder={uiText('describe_how_upstream_artifacts_should_be_fit_93fd3a5')}
            onChange={(instructions) => onChange({ ...node.config, instructions })}
          />
          <p className="text-xs text-muted-foreground">
            {uiText('the_formatter_has_no_tools_it_can_only_fit_la_09a7c17')}
          </p>
        </>
      );
    case 'instruction':
      return (
        <PromptField
          label={uiText('prompt_and_operating_rules_6a18a2a')}
          value={node.config.text}
          disabled={disabled}
          rows={10}
          placeholder={uiText('add_durable_context_constraints_tone_and_evid_a6deab9')}
          description={uiText('this_text_becomes_reusable_context_for_connec_f6a4ca9')}
          onChange={(text) => onChange({ text })}
        />
      );
    case 'report':
      return (
        <>
          <Field
            label={uiText('title_7e8cd20')}
            value={node.config.title}
            disabled={disabled}
            onChange={(title) => onChange({ ...node.config, title })}
          />
          <p className="text-xs leading-4 text-muted-foreground">
            {uiText('the_title_heads_the_rendered_report_objective_8c28007')}
          </p>
          <PromptField
            label={uiText('objective_3b20adc')}
            value={node.config.objective}
            disabled={disabled}
            rows={4}
            starters={agentStarters}
            placeholder={uiText('what_decision_should_this_report_help_its_aud_8e09f63')}
            onChange={(objective) => onChange({ ...node.config, objective })}
          />
          <Field
            label={uiText('audience_545c023')}
            value={node.config.audience}
            disabled={disabled}
            onChange={(audience) => onChange({ ...node.config, audience })}
          />
          <Label>{uiText('required_sections_6edb1ad')}</Label>
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
            <Plus data-icon="inline-start" />
            {uiText('add_section_7c36909')}
          </Button>
        </>
      );
    case 'trigger.schedule': {
      const schedule = node.config.schedule;
      return (
        <>
          <Choice
            label={uiText('cadence_316d43c')}
            value={schedule.kind}
            disabled={disabled}
            options={['daily', 'weekly', 'monthly', 'cron'].map((value) => ({
              value,
              label: automationControlLabel(value, uiText),
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
              label={uiText('cron_expression_9e6e7de')}
              value={schedule.expr}
              disabled={disabled}
              onChange={(expr) => onChange({ schedule: { ...schedule, expr } })}
            />
          ) : (
            <Field
              label={uiText('time_33b9347')}
              type="time"
              value={schedule.time}
              disabled={disabled}
              onChange={(time) => onChange({ schedule: { ...schedule, time } })}
            />
          )}
          {schedule.kind === 'weekly' ? (
            <Field
              label={uiText('day_of_week_0_6_0f8e4b1')}
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
              label={uiText('day_of_month_1_28_ff3ae1d')}
              type="number"
              value={schedule.dayOfMonth}
              disabled={disabled}
              onChange={(dayOfMonth) =>
                onChange({ schedule: { ...schedule, dayOfMonth: Number(dayOfMonth) } })
              }
            />
          ) : null}
          <Field
            label={uiText('timezone_4ceca1d')}
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
        <p className="text-xs text-muted-foreground">
          {uiText('this_node_has_no_additional_configuration_16e05c5')}
        </p>
      );
    case 'trigger.event':
      return (
        <Field
          label={uiText('event_type_70d8170')}
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
            label={uiText('metric_2d275a7')}
            value={node.config.metric}
            disabled={disabled}
            onChange={(metric) => onChange({ ...node.config, metric })}
          />
          <Choice
            label={uiText('operator_291101a')}
            value={node.config.operator}
            disabled={disabled}
            options={['gt', 'gte', 'lt', 'lte', 'eq', 'changed_by'].map((value) => ({
              value,
              label: automationControlLabel(value, uiText),
            }))}
            onChange={(operator) =>
              onChange({ ...node.config, operator: operator as typeof node.config.operator })
            }
          />
          <Field
            label={uiText('value_8e37953')}
            type="number"
            value={node.config.value}
            disabled={disabled}
            onChange={(value) => onChange({ ...node.config, value: Number(value) })}
          />
          <Field
            label={uiText('cooldown_minutes_67e905a')}
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
            label={uiText('payload_schema_ec9433e')}
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
            label={uiText('value_path_b42c4bb')}
            value={condition.path}
            disabled={disabled}
            onChange={(path) => onChange({ ...node.config, condition: { ...condition, path } })}
          />
          <Choice
            label={uiText('operator_291101a')}
            value={condition.operator}
            disabled={disabled}
            options={['exists', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'].map((value) => ({
              value,
              label: automationControlLabel(value, uiText),
            }))}
            onChange={(operator) =>
              onChange({
                ...node.config,
                condition: { ...condition, operator: operator as typeof condition.operator },
              })
            }
          />
          <Field
            label={uiText('compare_value_c074571')}
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
          label={uiText('iterations_4740b57')}
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
            label={uiText('value_path_b42c4bb')}
            value={node.config.path}
            disabled={disabled}
            onChange={(path) => onChange({ ...node.config, path })}
          />
          <Field
            label={uiText('cases_label_value_1b2d2ab')}
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
          label={uiText('wait_mode_a623a5d')}
          value={node.config.mode}
          disabled={disabled}
          options={[
            { value: 'all', label: uiText('all_branches_fe69615') },
            { value: 'any', label: uiText('any_branch_db79b07') },
          ]}
          onChange={(mode) => onChange({ mode: mode as 'all' | 'any' })}
        />
      );
    case 'action.email':
      return (
        <>
          <Field
            label={uiText('subject_6897128')}
            value={node.config.subject}
            disabled={disabled}
            onChange={(subject) => onChange({ ...node.config, subject })}
          />
          <Field
            label={uiText('external_recipients_195426f')}
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
            label={uiText('member_user_ids_857af97')}
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
            label={uiText('managed_destination_36aa05f')}
            value={node.config.destinationId ?? 'select-destination'}
            disabled={disabled}
            options={[
              {
                value: 'select-destination',
                label: uiText('select_a_destination_ba615e8'),
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
              <Badge variant="warning">{uiText('needs_setup_b6df244')}</Badge>
              <p className="mt-2 text-xs leading-4 text-muted-foreground">
                {(webhookDestinations ?? []).length === 0
                  ? uiText('no_signed_destinations_exist_yet_open_webhook_92d74d0')
                  : uiText('select_a_signed_destination_this_step_cannot__31d4ded')}
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {uiText('the_destination_owns_its_url_method_signing_s_1b0200a')}
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
            label={uiText('title_template_9ef05ea')}
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
            label={uiText('drafts_path_a561450')}
            value={target.itemsPath}
            disabled={disabled}
            placeholder={AUTOMATION_PLANNER_UPSERT_DEFAULTS.itemsPath}
            onChange={(itemsPath) => onChange({ ...target, itemsPath })}
          />
          <Field
            label={uiText('maximum_drafts_per_run_7910dad')}
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
            label={uiText('schedule_lookahead_hours_1ed9a28')}
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
            label={uiText('maximum_posts_per_run_11af33e')}
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
          <p className="text-xs leading-4 text-muted-foreground">
            {uiText('approved_drafts_scheduled_within_the_lookahea_037606b')}
          </p>
        </>
      );
    }
    case 'action.ai_studio_generate': {
      const request = resolveAutomationAiStudioGenerateConfig(node.config);
      // A pipeline declares its own generators, its own media and its own outputs, and it
      // runs in a throwaway workspace of its own. Leaving Generator, Outputs and the
      // workspace picker on screen would offer three settings the run ignores.
      const onPipeline = request.pipelineId !== null;
      return (
        <>
          <ActionCapabilityNotice type={node.type} capabilities={sourceCapabilities} />
          <PipelinePicker
            brandId={brandId}
            value={request.pipelineId}
            disabled={disabled}
            onChange={(pipelineId) =>
              onChange({
                ...request,
                pipelineId,
                // A pipeline produces its own declared outputs; the adapter refuses any
                // other count, so switching to one cannot leave a stale 4 behind.
                ...(pipelineId === null ? {} : { maxOutputs: 1 }),
              })
            }
          />
          {onPipeline ? null : (
            <Choice
              label={uiText('generator_1ade60a')}
              value={request.generator}
              disabled={disabled}
              options={automationAiStudioGeneratorSchema.options.map((generator) => ({
                value: generator,
                label: automationControlLabel(generator, uiText),
              }))}
              onChange={(generator) =>
                onChange({
                  ...request,
                  generator: generator as AutomationAiStudioGenerator,
                })
              }
            />
          )}
          <PromptField
            label={
              onPipeline
                ? uiText('text_sent_to_the_pipeline_s_input_ports_c93310c')
                : uiText('generation_instructions_4d296f5')
            }
            value={request.instructions}
            disabled={disabled}
            placeholder={uiText('describe_the_asset_to_create_including_format_9d9cc4c')}
            onChange={(instructions) => onChange({ ...request, instructions })}
          />
          {onPipeline ? null : (
            <Field
              label={uiText('outputs_per_run_fc5df04')}
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
          )}
          {onPipeline ? null : (
            <AiStudioRoomPicker
              brandId={brandId}
              value={request.roomId}
              disabled={disabled}
              onChange={(roomId) => onChange({ ...request, roomId })}
            />
          )}
          <p className="text-xs leading-4 text-muted-foreground">
            {onPipeline
              ? uiText('this_text_is_written_to_every_text_input_port_ecc0ce5')
              : uiText('an_automation_runs_headless_so_it_can_only_re_ab0f362')}
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
            label={uiText('operation_0f044fe')}
            value={target.operation}
            disabled={disabled}
            options={paidOptimizerOperationOptions.map((option) => ({
              ...option,
              label: localizeAutomationsCopy(option.label, uiText),
            }))}
            onChange={(operation) =>
              onChange({
                ...target,
                operation: operation as AutomationPaidOptimizerOperation,
              })
            }
          />
          <Field
            label={uiText('maximum_budget_change_per_apply_27465c6')}
            type="number"
            value={target.maxBudgetDeltaPct ?? ''}
            disabled={disabled}
            placeholder={uiText('no_cap_59db211')}
            onChange={(raw) => onChange({ ...target, maxBudgetDeltaPct: boundedPercent(raw) })}
          />
          <p className="text-xs leading-4 text-muted-foreground">
            {uiText('pausing_an_ad_is_human_only_and_there_is_no_e_1e347c2')}
          </p>
        </>
      );
    }
  }
}
