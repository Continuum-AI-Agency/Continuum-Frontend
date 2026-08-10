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

export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

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
  const ports = getAutomationNodePortSpec(node);
  const inputs = Object.keys(ports.inputs);
  const outputs = Object.keys(ports.outputs);

  return (
    <div className="flex flex-col gap-2">
      <Label>Typed ports</Label>
      <div className="flex flex-wrap gap-1.5">
        {inputs.map((port) => (
          <Badge key={`in-${port}`} variant="outline">
            in · {port}
          </Badge>
        ))}
        {outputs.map((port) => (
          <Badge key={`out-${port}`} variant="violet">
            out · {port}
          </Badge>
        ))}
        {inputs.length + outputs.length === 0 ? <Badge variant="muted">No ports</Badge> : null}
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
          {issue.severity === 'error' ? 'Blocks publishing' : 'Review'}
        </AlertTitle>
        <AlertDescription className="text-xs">{issue.message}</AlertDescription>
      </Alert>
    </button>
  );
}

export type WebhookResources = {
  endpoints: AutomationWebhookEndpoint[];
  destinations: AutomationWebhookDestination[];
};

export const automationEndpointCreationBlockReason = ({
  versionState,
  saveState,
}: {
  versionState: VersionState;
  saveState: SaveState;
}): string | null => {
  if (versionState !== 'draft') {
    return 'Endpoints attach to the editable draft. Unpublish this automation first.';
  }
  if (saveState === 'saving') {
    return 'Waiting for the draft to save — the endpoint attaches to the saved draft.';
  }
  if (saveState === 'error') {
    return 'The draft could not be saved, so this node is not in the saved draft yet.';
  }
  return null;
};

export const automationEndpointCreationError = (error: unknown): string => {
  const message = errorMessage(error, 'Could not create this endpoint.');
  if (message.includes('draft_not_found')) {
    return 'The draft moved on before this request landed. Wait for “Draft saved”, then create the endpoint again.';
  }
  if (message.includes('webhook_trigger_not_found')) {
    return 'This webhook node is not in the saved draft yet. Wait for “Draft saved”, then create the endpoint again.';
  }
  return message;
};

const destinationUrlSchema = createAutomationWebhookDestinationRequestSchema.shape.url;

// The contract already encodes the rule (URL-shaped and HTTPS), so the form
// validates with it instead of a hand-rolled prefix check that would let a
// malformed https:// string round-trip to the server just to fail there.
export const automationDestinationUrlError = (url: string): string | null =>
  destinationUrlSchema.safeParse(url).success
    ? null
    : 'Enter a public HTTPS URL, for example https://hooks.example.com/continuum.';

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
  const blockedReason = automationEndpointCreationBlockReason({ versionState, saveState });
  const urlError = url ? automationDestinationUrlError(url) : null;
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
        revealSecret(result.signingSecret, `destination “${result.destination.name}”`);
        setName('');
        setUrl('');
        await onRefresh();
      } catch (creationError) {
        setError(errorMessage(creationError, 'Could not create this destination.'));
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
        revealSecret(result.signingSecret, `endpoint “${result.endpoint.name}”`);
        onEndpointCreated(result.endpoint.id);
        await onRefresh();
      } catch (creationError) {
        setError(automationEndpointCreationError(creationError));
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
        revealSecret(result.signingSecret, `endpoint “${endpoint.name}”`);
        await onRefresh();
      } catch (rotationError) {
        setError(errorMessage(rotationError, 'Could not rotate this signing secret.'));
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
            <span className="hidden xl:inline">Webhooks</span>
          </Button>
        }
      />
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!secretHeld}
      >
        <DialogHeader>
          <DialogTitle>Managed webhooks</DialogTitle>
          <DialogDescription>
            Signed inbound triggers and deterministic outbound destinations for this brand.
          </DialogDescription>
        </DialogHeader>

        {secret ? (
          <Alert>
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>Copy this signing secret now</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-xs">
                Shown once for {secretSubject}. Continuum cannot show it again.
              </p>
              <code className="block break-all rounded bg-muted p-2 text-xs">{secret}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyAutomationValue(secret, 'Signing secret')}
              >
                <Copy data-icon="inline-start" />
                Copy secret
              </Button>
              <label className="flex items-center gap-2 text-xs" htmlFor={acknowledgeId}>
                <Checkbox
                  id={acknowledgeId}
                  checked={acknowledged}
                  onCheckedChange={(checked) => setAcknowledged(checked === true)}
                />
                I&rsquo;ve copied it
              </label>
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Webhook setup failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h3 className="text-sm font-medium">Inbound endpoint</h3>
            <p className="text-xs text-muted-foreground">
              Select an inbound webhook node, then create its reveal-once secret.
            </p>
          </div>
          {selectedWebhook ? (
            selectedWebhook.config.endpointId ? (
              <Badge variant="success">Endpoint attached</Badge>
            ) : (
              <div className="space-y-2">
                <Button
                  disabled={locked || busy || secretHeld || blockedReason !== null}
                  onClick={() => void createEndpoint()}
                >
                  Create endpoint for {selectedWebhook.label}
                </Button>
                {blockedReason ? (
                  <p className="text-[11px] leading-4 text-muted-foreground">{blockedReason}</p>
                ) : null}
              </div>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              Select an Inbound webhook node on the canvas.
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
                        {endpoint.enabled ? 'Active' : 'Draft'}
                      </Badge>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              disabled={busy || secretHeld}
                              aria-label={`Rotate ${endpoint.name} signing secret`}
                            >
                              <RefreshCw aria-hidden="true" />
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Rotate this signing secret?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The current secret for “{endpoint.name}” stops working immediately.
                              Every caller still signing with it will be rejected until you give
                              them the replacement, which is shown only once.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep current secret</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void rotateSecret(endpoint)}>
                              Rotate secret
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <code className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                      {deliveryUrl}
                    </code>
                    <IconButton
                      label={`Copy ${endpoint.name} URL`}
                      className="size-7"
                      onClick={() => void copyAutomationValue(deliveryUrl, 'Delivery URL')}
                    >
                      <Copy aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              );
            })}
            {resources.endpoints.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No inbound endpoints yet.</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h3 className="text-sm font-medium">Outbound destination</h3>
            <p className="text-xs text-muted-foreground">
              Requests use Webhook-Id, Webhook-Timestamp, Webhook-Signature, and Idempotency-Key.
            </p>
          </div>
          <Input
            value={name}
            disabled={busy}
            placeholder="Destination name"
            aria-label="Destination name"
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            type="url"
            value={url}
            disabled={busy}
            placeholder="https://hooks.example.com/continuum"
            aria-label="Destination URL"
            aria-invalid={urlError !== null}
            onChange={(event) => setUrl(event.target.value)}
          />
          {urlError ? <p className="text-xs text-destructive">{urlError}</p> : null}
          <Button
            disabled={busy || secretHeld || url.length === 0 || urlError !== null}
            onClick={() => void createDestination()}
          >
            Create signed destination
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
  const selectedIssues = validation?.issues.filter((issue) => issue.nodeId === selected?.id) ?? [];
  const catalogItem = selected ? getAutomationNodeCatalogItem(selected.type) : null;
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
          <h2 className="text-xs font-medium">Inspector</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {selected ? selected.label : 'Select a node'}
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
                    <Badge variant="destructive">Unavailable</Badge>
                  ) : capability?.availability === 'needs_connection' ? (
                    <Badge variant="warning">Needs connection</Badge>
                  ) : capability?.lifecycle === 'preview' ? (
                    <Badge variant="muted">Preview</Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {catalogItem.description}
                </p>
                {capability?.reason ? (
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {capability.reason}
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
              <Label htmlFor={`node-label-${selected.id}`}>Label</Label>
              <Input
                id={`node-label-${selected.id}`}
                value={selected.label}
                disabled={locked}
                onChange={(event) => onPatch({ label: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`node-description-${selected.id}`}>Description</Label>
              <Textarea
                id={`node-description-${selected.id}`}
                value={selected.description ?? ''}
                disabled={locked}
                onChange={(event) => onPatch({ description: event.target.value })}
                rows={3}
                placeholder="Explain this step for collaborators."
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label>Configuration</Label>
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
                  const next = { ...selected, config } as AutomationWorkflowNode;
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
              <p className="text-[11px] leading-4 text-muted-foreground">
                Typed validation runs locally, again on the server, and once more before publishing.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <Label htmlFor={`node-disabled-${selected.id}`}>Disable node</Label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Keep the step in the graph without running it.
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
                    <Label>Run evidence</Label>
                    <Badge variant="outline">{execution.durationMs} ms</Badge>
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
                        title={`Live run · attempt ${nodeRun.attempt} · ${nodeRun.status}`}
                      />
                      <ToolContent>
                        {nodeRun.input !== null ? <ToolInput value={nodeRun.input} /> : null}
                        {nodeRun.output !== null ? <ToolOutput value={nodeRun.output} /> : null}
                        {nodeRun.errorMessage ? <ToolOutput value={nodeRun.errorMessage} /> : null}
                      </ToolContent>
                    </Tool>
                  ))}
                  {evidence.length === 0 && nodeRuns.length === 0 ? (
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      This step reported no evidence.
                    </p>
                  ) : null}
                  {checks.length > 0 ? (
                    <TestResults
                      title="Deterministic checks"
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
                        title={`${receipt.effect === 'simulated' ? 'Simulated' : 'Live'} · ${receipt.actionKind}`}
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
                  <Label>Node validation</Label>
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
            <h3 className="mt-3 text-sm font-medium">Inspect a workflow step</h3>
            <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">
              Select a node to edit its instructions, data bindings, conditions, and outcomes.
            </p>
          </div>
        )}

        <Separator />

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <Label>Graph validation</Label>
            <Badge variant={validation?.ok ? 'success' : 'destructive'}>
              {validation?.ok
                ? 'Ready'
                : `${issueCount(validation, 'error')} error${issueCount(validation, 'error') === 1 ? '' : 's'}`}
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
              <AlertTitle>Structural checks pass</AlertTitle>
              <AlertDescription>
                Run a server-side test before publishing this version.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
