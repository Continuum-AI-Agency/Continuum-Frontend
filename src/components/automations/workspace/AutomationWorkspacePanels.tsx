'use client';

import {
  type Automation,
  type AutomationCapabilitiesResponse,
  type AutomationNodeRun,
  type AutomationValidationIssue,
  type AutomationWebhookDestination,
  type AutomationWebhookEndpoint,
  type AutomationWorkflowDefinition,
  type AutomationWorkflowNode,
  type AutomationWorkflowValidation,
  createAutomationWebhookDestinationRequestSchema,
  getAutomationNodePortSpec,
  type TestAutomationWorkflowResponse,
} from '@continuum/contracts';
import {
  AlertCircle,
  Copy,
  Focus,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { TestResults } from '@/components/ai-elements/test-results';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { automationCapabilityDescription } from '@/i18n/automationCapability';
import { localizeAutomationsCopy } from '@/i18n/automationsCopy';
import { automationValidationMessage } from '@/i18n/automationValidation';
import { LocalizedUiError, useUiErrorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';
import {
  createAutomationWebhookDestination,
  createAutomationWebhookEndpoint,
  rotateAutomationWebhookEndpointSecret,
} from '@/lib/automations/automations';
import { resolveNodeLifecycle } from '@/lib/automations/capability-lifecycle';
import { getAutomationNodeCatalogItem } from './automationNodeCatalog';
import {
  automationWebhookDeliveryUrl,
  copyAutomationValue,
  NodeConfigurationEditor,
} from './NodeConfigurationEditor';
import type { WorkflowCanvasNode } from './WorkflowNodeCard';
import type { WorkflowNodeExecutionView } from './workflowVisualState';

/**
 * Folds a whole definition back onto the canvas nodes. The publish dialog's
 * escape hatch (`disableBlockingNodes`) hands back a definition, but the canvas
 * is the workspace's source of truth, so the patch lands node by node. Nodes the
 * patch left alone keep their object identity, which keeps the autosave effect
 * from firing on a no-op.
 */
export const applyDefinitionToCanvasNodes = ({
  nodes,
  definition,
}: {
  nodes: WorkflowCanvasNode[];
  definition: AutomationWorkflowDefinition;
}): WorkflowCanvasNode[] => {
  const patchedById = new Map(definition.nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const patched = patchedById.get(node.id);
    return !patched || patched === node.data.workflowNode
      ? node
      : { ...node, data: { ...node.data, workflowNode: patched } };
  });
};

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type VersionState = 'draft' | 'published' | 'archived';

type AutomationTranslate = ReturnType<typeof useTranslations<'automations'>>;
type ErrorFormatter = (error: unknown) => string;
export const errorMessage = (error: unknown, fallback: string, format?: ErrorFormatter): string =>
  error instanceof LocalizedUiError ? error.message : format ? format(error) : fallback;
const present = (source: string, t?: AutomationTranslate): string =>
  t ? localizeAutomationsCopy(source, t) : source;

export const issueCount = (
  validation: AutomationWorkflowValidation | null,
  severity: 'error' | 'warning',
) => validation?.issues.filter((issue) => issue.severity === severity).length ?? 0;

export function IconButton({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={label} size="icon" variant="ghost" {...props}>
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PortsSummary({ node }: { node: AutomationWorkflowNode }) {
  const uiText = useTranslations('automations');
  const ports = getAutomationNodePortSpec(node);
  const inputs = Object.keys(ports.inputs);
  const outputs = Object.keys(ports.outputs);

  return (
    <div className="flex flex-col gap-2">
      <Label>{uiText('typed_ports_053bf7b')}</Label>
      <div className="flex flex-wrap gap-1.5">
        {inputs.map((port) => (
          <Badge key={`in-${port}`} variant="outline">
            {uiText.rich('sentence_af9e6ff67d36', { v0: () => port })}
          </Badge>
        ))}
        {outputs.map((port) => (
          <Badge key={`out-${port}`} variant="violet">
            {uiText.rich('sentence_334223833e16', { v0: () => port })}
          </Badge>
        ))}
        {inputs.length + outputs.length === 0 ? (
          <Badge variant="muted">{uiText('no_ports_27719e3')}</Badge>
        ) : null}
      </div>
    </div>
  );
}

function ValidationIssueButton({
  issue,
  onSelect,
}: {
  issue: AutomationValidationIssue;
  onSelect: (nodeId: string) => void;
}) {
  const uiText = useTranslations('automations');
  return (
    <button
      type="button"
      disabled={!issue.nodeId}
      onClick={() => issue.nodeId && onSelect(issue.nodeId)}
      className="w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
    >
      <Alert variant={issue.severity === 'error' ? 'destructive' : 'default'} className="py-2.5">
        <AlertCircle aria-hidden="true" />
        <AlertTitle className="text-xs">
          {issue.severity === 'error'
            ? uiText('blocks_publishing_dfaf2ee')
            : uiText('review_aff0766')}
        </AlertTitle>
        <AlertDescription className="text-xs">
          {automationValidationMessage(issue, uiText)}
        </AlertDescription>
      </Alert>
    </button>
  );
}

export type WebhookResources = {
  endpoints: AutomationWebhookEndpoint[];
  destinations: AutomationWebhookDestination[];
};

export const automationEndpointCreationBlockReason = (
  {
    versionState,
    saveState,
  }: {
    versionState: VersionState;
    saveState: SaveState;
  },
  t?: AutomationTranslate,
): string | null => {
  if (versionState !== 'draft') {
    return present('Endpoints attach to the editable draft. Unpublish this automation first.', t);
  }
  if (saveState === 'saving') {
    return present('Waiting for the draft to save — the endpoint attaches to the saved draft.', t);
  }
  if (saveState === 'error') {
    return present('The draft could not be saved, so this node is not in the saved draft yet.', t);
  }
  return null;
};

export const automationEndpointCreationError = (
  error: unknown,
  t?: AutomationTranslate,
  format?: ErrorFormatter,
): string => {
  const structured =
    error instanceof ApiError
      ? [error.code, error.payload?.code, error.payload?.errorCode, error.payload?.error].filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
  // Older responses embedded these two stable codes in a diagnostic message.
  const legacy = error instanceof Error ? error.message : '';
  const hasCode = (code: string) =>
    structured.includes(code) || new RegExp('(?:^|[^a-z_])' + code + '(?:$|[^a-z_])').test(legacy);
  if (hasCode('draft_not_found'))
    return present(
      'The draft moved on before this request landed. Wait for “Draft saved”, then create the endpoint again.',
      t,
    );
  if (hasCode('webhook_trigger_not_found'))
    return present(
      'This webhook node is not in the saved draft yet. Wait for “Draft saved”, then create the endpoint again.',
      t,
    );
  return errorMessage(error, present('Could not create this endpoint.', t), format);
};

const destinationUrlSchema = createAutomationWebhookDestinationRequestSchema.shape.url;

// The contract already encodes the rule (URL-shaped and HTTPS), so the form
// validates with it instead of a hand-rolled prefix check that would let a
// malformed https:// string round-trip to the server just to fail there.
export const automationDestinationUrlError = (
  url: string,
  t?: AutomationTranslate,
): string | null =>
  destinationUrlSchema.safeParse(url).success
    ? null
    : present('Enter a public HTTPS URL, for example https://hooks.example.com/continuum.', t);

// A revealed signing secret exists exactly once. Closing the dialog or minting
// another one destroys it, so both are blocked until the user says they copied it.
export const canDismissRevealedSecret = ({
  secret,
  acknowledged,
}: {
  secret: string | null;
  acknowledged: boolean;
}): boolean => secret === null || acknowledged;

export type WebhookManagerClient = {
  createEndpoint: typeof createAutomationWebhookEndpoint;
  createDestination: typeof createAutomationWebhookDestination;
  rotateSecret: typeof rotateAutomationWebhookEndpointSecret;
};

const liveWebhookManagerClient: WebhookManagerClient = {
  createEndpoint: createAutomationWebhookEndpoint,
  createDestination: createAutomationWebhookDestination,
  rotateSecret: rotateAutomationWebhookEndpointSecret,
};

export function WebhookManager({
  automation,
  versionId,
  versionState,
  saveState,
  selected,
  locked,
  resources,
  onRefresh,
  onEndpointCreated,
  client = liveWebhookManagerClient,
}: {
  automation: Automation;
  versionId: string;
  versionState: VersionState;
  saveState: SaveState;
  selected: AutomationWorkflowNode | null;
  locked: boolean;
  resources: WebhookResources;
  onRefresh: () => Promise<void>;
  onEndpointCreated: (endpointId: string) => void;
  client?: WebhookManagerClient;
}) {
  const uiText = useTranslations('automations');
  const formatUiError = useUiErrorMessage();
  const acknowledgeId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [secretSubject, setSecretSubject] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedWebhook = selected?.type === 'trigger.webhook' ? selected : null;
  const blockedReason = automationEndpointCreationBlockReason({ versionState, saveState }, uiText);
  const urlError = url ? automationDestinationUrlError(url, uiText) : null;
  const secretHeld = !canDismissRevealedSecret({ secret, acknowledged });

  const revealSecret = (value: string, subject: string) => {
    setSecret(value);
    setSecretSubject(subject);
    setAcknowledged(false);
  };

  const runWebhookOperation = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const createDestination = () =>
    runWebhookOperation(async () => {
      try {
        const result = await client.createDestination({
          brandId: automation.brandId,
          name: name.trim() || 'Automation destination',
          url,
          method: 'POST',
        });
        revealSecret(
          result.signingSecret,
          uiText('m_29ab4d9909', { name: result.destination.name }),
        );
        setName('');
        setUrl('');
        await onRefresh();
      } catch (creationError) {
        setError(errorMessage(creationError, uiText('m_872538a9f9'), formatUiError));
      }
    });

  const createEndpoint = () => {
    if (!selectedWebhook) return Promise.resolve();
    return runWebhookOperation(async () => {
      try {
        const result = await client.createEndpoint({
          automationId: automation.id,
          workflowVersionId: versionId,
          nodeId: selectedWebhook.id,
          name: selectedWebhook.label,
          payloadSchema: selectedWebhook.config.payloadSchema,
        });
        revealSecret(result.signingSecret, uiText('m_d41dab22df', { name: result.endpoint.name }));
        onEndpointCreated(result.endpoint.id);
        await onRefresh();
      } catch (creationError) {
        setError(automationEndpointCreationError(creationError, uiText, formatUiError));
      }
    });
  };

  const rotateSecret = (endpoint: AutomationWebhookEndpoint) =>
    runWebhookOperation(async () => {
      try {
        const result = await client.rotateSecret({
          automationId: automation.id,
          endpointId: endpoint.id,
        });
        revealSecret(result.signingSecret, uiText('m_d41dab22df', { name: endpoint.name }));
        await onRefresh();
      } catch (rotationError) {
        setError(errorMessage(rotationError, uiText('m_4e0fd5618a'), formatUiError));
      }
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && secretHeld) return;
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Webhook data-icon="inline-start" />
            <span className="hidden xl:inline">{uiText('webhooks_45808d7')}</span>
          </Button>
        }
      />
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!secretHeld}
      >
        <DialogHeader>
          <DialogTitle>{uiText('managed_webhooks_879b1ed')}</DialogTitle>
          <DialogDescription>
            {uiText('signed_inbound_triggers_and_deterministic_out_9ed69b1')}
          </DialogDescription>
        </DialogHeader>

        {secret ? (
          <Alert>
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>{uiText('copy_this_signing_secret_now_62dfe07')}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-xs">
                {uiText.rich('sentence_2d2e8c304d64', {
                  v0: () => secretSubject,
                })}
              </p>
              <code className="block break-all rounded bg-muted p-2 text-xs">{secret}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyAutomationValue(secret, uiText('signingSecret'), uiText)}
              >
                <Copy data-icon="inline-start" />
                {uiText('copy_secret_9b80d4b')}
              </Button>
              <label className="flex items-center gap-2 text-xs" htmlFor={acknowledgeId}>
                <Checkbox
                  id={acknowledgeId}
                  checked={acknowledged}
                  onCheckedChange={(checked) => setAcknowledged(checked === true)}
                />
                {uiText('i_ve_copied_it_a93698e')}
              </label>
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{uiText('webhook_setup_failed_dc76cfa')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h3 className="text-sm font-medium">{uiText('inbound_endpoint_b70d0ed')}</h3>
            <p className="text-xs text-muted-foreground">
              {uiText('select_an_inbound_webhook_node_then_create_it_be61c9c')}
            </p>
          </div>
          {selectedWebhook ? (
            selectedWebhook.config.endpointId ? (
              <Badge variant="success">{uiText('endpoint_attached_cbea980')}</Badge>
            ) : (
              <div className="space-y-2">
                <Button
                  disabled={locked || busy || secretHeld || blockedReason !== null}
                  onClick={() => void createEndpoint()}
                >
                  {uiText.rich('sentence_7658e8e4722c', {
                    v0: () => selectedWebhook.label,
                  })}
                </Button>
                {blockedReason ? (
                  <p className="text-xs leading-4 text-muted-foreground">{blockedReason}</p>
                ) : null}
              </div>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              {uiText('select_an_inbound_webhook_node_on_the_canvas_00ac31e')}
            </p>
          )}
          <div className="space-y-2">
            {resources.endpoints.map((endpoint) => {
              const deliveryUrl = automationWebhookDeliveryUrl(endpoint.publicId);
              return (
                <div key={endpoint.id} className="rounded-md border bg-muted/30 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">{endpoint.name}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={endpoint.enabled ? 'success' : 'muted'}>
                        {endpoint.enabled ? uiText('active_9234069') : uiText('draft_ebf12ef')}
                      </Badge>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              disabled={busy || secretHeld}
                              aria-label={uiText('m_aafc3b34a4', {
                                name: endpoint.name,
                              })}
                            >
                              <RefreshCw aria-hidden="true" />
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {uiText('rotate_this_signing_secret_fefcc59')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {uiText.rich('sentence_6a6307fa5947', {
                                v0: () => endpoint.name,
                              })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {uiText('keep_current_secret_021a78e')}
                            </AlertDialogCancel>
                            <AlertDialogAction onClick={() => void rotateSecret(endpoint)}>
                              {uiText('rotate_secret_4405518')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <code className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
                      {deliveryUrl}
                    </code>
                    <IconButton
                      label={uiText('m_6578fd98f3', { name: endpoint.name })}
                      className="size-7"
                      onClick={() =>
                        void copyAutomationValue(deliveryUrl, uiText('deliveryUrl'), uiText)
                      }
                    >
                      <Copy aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              );
            })}
            {resources.endpoints.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {uiText('no_inbound_endpoints_yet_1eb865b')}
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h3 className="text-sm font-medium">{uiText('outbound_destination_7241b2c')}</h3>
            <p className="text-xs text-muted-foreground">
              {uiText('requests_use_webhook_id_webhook_timestamp_web_bd37b2e')}
            </p>
          </div>
          <Input
            value={name}
            disabled={busy}
            placeholder={uiText('destination_name_50687c1')}
            aria-label={uiText('destination_name_50687c1')}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            type="url"
            value={url}
            disabled={busy}
            placeholder="https://hooks.example.com/continuum"
            aria-label={uiText('destination_url_007f7ef')}
            aria-invalid={urlError !== null}
            onChange={(event) => setUrl(event.target.value)}
          />
          {urlError ? <p className="text-xs text-destructive">{urlError}</p> : null}
          <Button
            disabled={busy || secretHeld || url.length === 0 || urlError !== null}
            onClick={() => void createDestination()}
          >
            {uiText('create_signed_destination_88b6496')}
          </Button>
          <div className="flex flex-wrap gap-2">
            {resources.destinations.map((destination) => (
              <Badge key={destination.id} variant={destination.enabled ? 'outline' : 'muted'}>
                {destination.name}
              </Badge>
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowInspector({
  selected,
  brandId,
  locked,
  validation,
  execution,
  evidence,
  nodeRuns,
  checks,
  actionReceipts,
  sourceCapabilities,
  webhookDestinations,
  webhookEndpoints,
  onPatch,
  onSelectIssue,
  onMessage,
}: {
  selected: AutomationWorkflowNode | null;
  /**
   * Forwarded to every action picker. Without it each one falls back to its
   * raw-id text field, which is the documented degrade path for an outage —
   * not something a user should meet on the happy path.
   */
  brandId?: string;
  locked: boolean;
  validation: AutomationWorkflowValidation | null;
  execution?: WorkflowNodeExecutionView;
  evidence: TestAutomationWorkflowResponse['evidence'];
  /** Node runs of the focused LIVE run — the server test has none of these. */
  nodeRuns: AutomationNodeRun[];
  checks: TestAutomationWorkflowResponse['checks'];
  actionReceipts: TestAutomationWorkflowResponse['actionReceipts'];
  sourceCapabilities: AutomationCapabilitiesResponse | null;
  webhookDestinations: AutomationWebhookDestination[];
  webhookEndpoints: AutomationWebhookEndpoint[];
  onPatch: (patch: Partial<AutomationWorkflowNode>) => void;
  onSelectIssue: (nodeId: string) => void;
  onMessage: (message: string | null) => void;
}) {
  const uiText = useTranslations('automations');
  const formatUiError = useUiErrorMessage();
  const selectedIssues = validation?.issues.filter((issue) => issue.nodeId === selected?.id) ?? [];
  const catalogItem = selected ? getAutomationNodeCatalogItem(selected.type, uiText) : null;
  const capability = selected
    ? resolveNodeLifecycle({ node: selected, capabilities: sourceCapabilities })
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        {locked ? (
          <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Save className="size-3.5 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <h2 className="text-xs font-medium">{uiText('inspector_da188e3')}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {selected ? selected.label : uiText('select_a_node_9205fdf')}
          </p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {selected && catalogItem ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex flex-col gap-4 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{catalogItem.category}</Badge>
                  {capability?.availability === 'unavailable' ? (
                    <Badge variant="destructive">{uiText('unavailable_ca18449')}</Badge>
                  ) : capability?.availability === 'needs_connection' ? (
                    <Badge variant="warning">{uiText('needs_connection_d919fde')}</Badge>
                  ) : capability?.lifecycle === 'preview' ? (
                    <Badge variant="muted">{uiText('preview_324b134')}</Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {catalogItem.description}
                </p>
                {capability && automationCapabilityDescription(capability, uiText) ? (
                  <p className="mt-1 text-xs leading-4 text-muted-foreground">
                    {automationCapabilityDescription(capability, uiText)}
                  </p>
                ) : null}
              </div>
              {execution ? (
                <Badge
                  variant={
                    execution.status === 'completed'
                      ? 'success'
                      : execution.status === 'failed'
                        ? 'destructive'
                        : 'warning'
                  }
                >
                  {execution.status}
                </Badge>
              ) : null}
            </div>

            <Separator />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`node-label-${selected.id}`}>{uiText('label_0e66373')}</Label>
              <Input
                id={`node-label-${selected.id}`}
                value={selected.label}
                disabled={locked}
                onChange={(event) => onPatch({ label: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`node-description-${selected.id}`}>
                {uiText('description_526e008')}
              </Label>
              <Textarea
                id={`node-description-${selected.id}`}
                value={selected.description ?? ''}
                disabled={locked}
                onChange={(event) => onPatch({ description: event.target.value })}
                rows={3}
                placeholder={uiText('explain_this_step_for_collaborators_8280c84')}
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label>{uiText('configuration_b332c34')}</Label>
              <NodeConfigurationEditor
                node={selected}
                brandId={brandId}
                disabled={locked}
                sourceCapabilities={sourceCapabilities}
                webhookDestinations={webhookDestinations}
                webhookEndpoints={webhookEndpoints}
                onChange={(config) => {
                  // The server is the authority on what a source can do, so the
                  // "this one cannot run live yet" decision is resolved against
                  // the NEXT config rather than the bundled constant.
                  const next = {
                    ...selected,
                    config,
                  } as AutomationWorkflowNode;
                  const nextCapability = resolveNodeLifecycle({
                    node: next,
                    capabilities: sourceCapabilities,
                  });
                  const cannotRunLive =
                    selected.type === 'source' &&
                    (nextCapability.lifecycle === 'preview' ||
                      nextCapability.availability === 'unavailable');
                  onPatch({
                    config,
                    ...(cannotRunLive ? { disabled: true } : {}),
                  } as Partial<AutomationWorkflowNode>);
                  onMessage(null);
                }}
              />
              <p className="text-xs leading-4 text-muted-foreground">
                {uiText('typed_validation_runs_locally_again_on_the_se_4abeab3')}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <Label htmlFor={`node-disabled-${selected.id}`}>
                  {uiText('disable_node_91a6e06')}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {uiText('keep_the_step_in_the_graph_without_running_it_d4b1727')}
                </p>
              </div>
              <Switch
                id={`node-disabled-${selected.id}`}
                checked={selected.disabled}
                disabled={locked}
                onCheckedChange={(disabled) => onPatch({ disabled })}
              />
            </div>

            <PortsSummary node={selected} />

            {execution ? (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label>{uiText('run_evidence_96767cb')}</Label>
                    <Badge variant="outline">
                      {uiText('m_8636c22fb9', {
                        duration: execution.durationMs,
                      })}
                    </Badge>
                  </div>
                  {evidence.map((event) => (
                    <Tool
                      key={`${event.seq}-${event.eventType}`}
                      type={event.toolName ?? event.eventType}
                      state={
                        event.status === 'failed'
                          ? 'error'
                          : event.status === 'running'
                            ? 'running'
                            : 'output-available'
                      }
                    >
                      <ToolHeader title={event.toolName ?? event.eventType.replace('.', ' · ')} />
                      <ToolContent>
                        {event.input !== undefined ? <ToolInput value={event.input} /> : null}
                        {event.output !== undefined ? <ToolOutput value={event.output} /> : null}
                      </ToolContent>
                    </Tool>
                  ))}
                  {nodeRuns.map((nodeRun) => (
                    <Tool
                      key={`${nodeRun.id}-${nodeRun.attempt}`}
                      type={nodeRun.nodeType}
                      state={
                        nodeRun.status === 'failed'
                          ? 'error'
                          : nodeRun.status === 'running' || nodeRun.status === 'pending'
                            ? 'running'
                            : 'output-available'
                      }
                    >
                      <ToolHeader
                        title={uiText('m_71d8203345', {
                          count: nodeRun.attempt,
                          status: localizeAutomationsCopy(
                            nodeRun.status === 'pending'
                              ? 'Pending'
                              : nodeRun.status === 'running'
                                ? 'Running'
                                : nodeRun.status === 'completed'
                                  ? 'Completed'
                                  : nodeRun.status === 'failed'
                                    ? 'Failed'
                                    : 'Skipped',
                            uiText,
                          ),
                        })}
                      />
                      <ToolContent>
                        {nodeRun.input !== null ? <ToolInput value={nodeRun.input} /> : null}
                        {nodeRun.output !== null ? <ToolOutput value={nodeRun.output} /> : null}
                        {nodeRun.errorMessage ? (
                          <ToolOutput
                            value={formatUiError({
                              code: nodeRun.errorMessage,
                            })}
                          />
                        ) : null}
                      </ToolContent>
                    </Tool>
                  ))}
                  {evidence.length === 0 && nodeRuns.length === 0 ? (
                    <p className="text-xs leading-4 text-muted-foreground">
                      {uiText('this_step_reported_no_evidence_e753672')}
                    </p>
                  ) : null}
                  {checks.length > 0 ? (
                    <TestResults
                      title={uiText('deterministic_checks_e85b50e')}
                      results={checks.map((check) => ({
                        id: check.id,
                        name: check.name,
                        status: check.status,
                        error: check.status === 'fail' ? check.detail : undefined,
                      }))}
                    />
                  ) : null}
                  {actionReceipts.map((receipt) => (
                    <Tool
                      key={`${receipt.nodeId}-${receipt.actionKind}`}
                      type={receipt.actionKind}
                      state={receipt.status === 'completed' ? 'output-available' : 'error'}
                    >
                      <ToolHeader
                        title={`${receipt.effect === 'simulated' ? uiText('simulated_31fe293') : uiText('live_b64ac05')} · ${receipt.actionKind}`}
                      />
                      <ToolContent>
                        <ToolOutput value={receipt} />
                      </ToolContent>
                    </Tool>
                  ))}
                </div>
              </>
            ) : null}

            {selectedIssues.length > 0 ? (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <Label>{uiText('node_validation_4b1d146')}</Label>
                  {selectedIssues.map((issue, index) => (
                    <ValidationIssueButton
                      key={`${issue.code}-${issue.nodeId ?? index}`}
                      issue={issue}
                      onSelect={onSelectIssue}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </motion.div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-md border bg-muted">
              <Focus className="size-4 text-muted-foreground" aria-hidden="true" />
            </span>
            <h3 className="mt-3 text-sm font-medium">
              {uiText('inspect_a_workflow_step_18c8a6f')}
            </h3>
            <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">
              {uiText('select_a_node_to_edit_its_instructions_data_b_1836539')}
            </p>
          </div>
        )}

        <Separator />

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <Label>{uiText('graph_validation_bfc469b')}</Label>
            <Badge variant={validation?.ok ? 'success' : 'destructive'}>
              {validation?.ok
                ? uiText('ready_5fa7aac')
                : uiText('m_377dd3a8aa', {
                    count: issueCount(validation, 'error'),
                  })}
            </Badge>
          </div>
          {validation?.issues.length ? (
            validation.issues.map((issue, index) => (
              <ValidationIssueButton
                key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? index}`}
                issue={issue}
                onSelect={onSelectIssue}
              />
            ))
          ) : (
            <Alert>
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>{uiText('structural_checks_pass_df11fd0')}</AlertTitle>
              <AlertDescription>
                {uiText('run_a_server_side_test_before_publishing_this_cd9fb48')}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
