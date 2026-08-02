// Two seams of the workspace shell: the escape-hatch patch the publish dialog
// hands back, and the inspector's evidence block — which used to render the
// server test's evidence only, leaving a LIVE run showing a status badge and
// nothing else.

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  AutomationCapabilitiesResponse,
  AutomationNodeRun,
  AutomationWorkflowDefinition,
  AutomationWorkflowNode,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { applyDefinitionToCanvasNodes, WorkflowInspector } from './AutomationWorkspacePanels';
import { createAutomationWorkflowNode } from './automationNodeCatalog';
import { PublishReadinessDialog } from './PublishReadinessDialog';
import type { WorkflowCanvasNode } from './WorkflowNodeCard';

afterEach(cleanup);

// Radix's focus scope and scroll area reach for these on the global object,
// while happy-dom hangs them off `window`.
type LiftedGlobals = {
  MutationObserver?: typeof MutationObserver;
  HTMLFormElement?: typeof HTMLFormElement;
  ResizeObserver?: typeof ResizeObserver;
};
const happyDomWindow = globalThis.window as unknown as LiftedGlobals;
const testGlobals = globalThis as LiftedGlobals;
if (typeof testGlobals.MutationObserver !== 'function') {
  testGlobals.MutationObserver = happyDomWindow.MutationObserver;
}
if (typeof testGlobals.HTMLFormElement !== 'function') {
  testGlobals.HTMLFormElement = happyDomWindow.HTMLFormElement;
}
if (typeof testGlobals.ResizeObserver !== 'function') {
  testGlobals.ResizeObserver = happyDomWindow.ResizeObserver;
}

const workflowNode = (
  type: AutomationWorkflowNode['type'],
  id: string,
): AutomationWorkflowNode => ({
  ...createAutomationWorkflowNode({ type, position: { x: 0, y: 0 }, id }),
  disabled: false,
});

const canvasNode = (node: AutomationWorkflowNode): WorkflowCanvasNode => ({
  id: node.id,
  type: 'workflow',
  position: node.position,
  data: { workflowNode: node, locked: false, issues: [] },
});

const definitionOf = (...nodes: AutomationWorkflowNode[]): AutomationWorkflowDefinition => ({
  schemaVersion: 3,
  nodes,
  edges: [],
  execution: { maxRunSeconds: 900, maxParallelNodes: 4 },
});

describe('applyDefinitionToCanvasNodes', () => {
  test('folds the patched nodes onto the canvas', () => {
    const keep = workflowNode('trigger.manual', 'trigger');
    const blocker = workflowNode('instruction', 'blocker');
    const nodes = [canvasNode(keep), canvasNode(blocker)];

    const patched = applyDefinitionToCanvasNodes({
      nodes,
      definition: definitionOf(keep, { ...blocker, disabled: true }),
    });

    expect(patched.map((node) => node.data.workflowNode.disabled)).toEqual([false, true]);
  });

  test('keeps untouched nodes identical so the autosave does not fire on a no-op', () => {
    const keep = workflowNode('trigger.manual', 'trigger');
    const blocker = workflowNode('instruction', 'blocker');
    const nodes = [canvasNode(keep), canvasNode(blocker)];

    const patched = applyDefinitionToCanvasNodes({
      nodes,
      definition: definitionOf(keep, { ...blocker, disabled: true }),
    });

    expect(patched[0]).toBe(nodes[0]);
    expect(patched[1]).not.toBe(nodes[1]);
  });

  test('ignores definition nodes the canvas does not hold', () => {
    const keep = workflowNode('trigger.manual', 'trigger');
    const nodes = [canvasNode(keep)];

    const patched = applyDefinitionToCanvasNodes({
      nodes,
      definition: definitionOf(keep, workflowNode('instruction', 'ghost')),
    });

    expect(patched).toHaveLength(1);
    expect(patched[0]).toBe(nodes[0]);
  });
});

const nodeRun = (overrides: Partial<AutomationNodeRun> = {}): AutomationNodeRun => ({
  id: 'node-run-1',
  runId: 'run-1',
  nodeId: 'instruction-node',
  nodeType: 'instruction',
  attempt: 1,
  status: 'completed',
  selectedHandle: 'output',
  input: { prompt: 'summarise' },
  output: { text: 'done' },
  errorMessage: null,
  durationMs: 120,
  startedAt: '2026-07-28T09:00:00.000Z',
  completedAt: '2026-07-28T09:00:01.000Z',
  ...overrides,
});

const renderInspector = ({
  nodeRuns = [],
  capabilities = null,
}: {
  nodeRuns?: AutomationNodeRun[];
  capabilities?: AutomationCapabilitiesResponse | null;
} = {}) =>
  render(
    <TooltipProvider>
      <WorkflowInspector
        selected={workflowNode('instruction', 'instruction-node')}
        locked={false}
        validation={{ ok: true, issues: [], definitionHash: 'hash' }}
        execution={{
          status: 'failed',
          selectedHandle: null,
          errorMessage: 'boom',
          durationMs: 120,
          attempt: 2,
          startedAt: '2026-07-28T09:00:00.000Z',
          completedAt: '2026-07-28T09:00:01.000Z',
        }}
        evidence={[]}
        nodeRuns={nodeRuns}
        checks={[]}
        actionReceipts={[]}
        sourceCapabilities={capabilities}
        webhookDestinations={[]}
        webhookEndpoints={[]}
        onPatch={mock(() => {})}
        onSelectIssue={mock(() => {})}
        onMessage={mock(() => {})}
      />
    </TooltipProvider>,
  );

describe('WorkflowInspector run evidence', () => {
  test('renders the focused live run’s node attempts', () => {
    renderInspector({
      nodeRuns: [
        nodeRun({ attempt: 1, status: 'failed', errorMessage: 'source timed out' }),
        nodeRun({ id: 'node-run-2', attempt: 2, status: 'completed' }),
      ],
    });

    expect(screen.getByText('Live run · attempt 1 · failed')).toBeTruthy();
    expect(screen.getByText('Live run · attempt 2 · completed')).toBeTruthy();
  });

  test('says the step reported nothing rather than showing a bare status badge', () => {
    renderInspector();

    expect(screen.getByText('This step reported no evidence.')).toBeTruthy();
  });
});

// The workspace's half of the publish guardrail: the dialog hands back a
// definition, the canvas absorbs it, and the recomputed definition is what the
// dialog re-checks. This drives the real dialog against the real fold so the
// round trip is proven, not assumed.
function PublishHarness({
  initialNodes,
  onConfirmPublish,
}: {
  initialNodes: WorkflowCanvasNode[];
  onConfirmPublish: () => void;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const definition = definitionOf(...nodes.map((node) => node.data.workflowNode));

  return (
    <PublishReadinessDialog
      open
      onOpenChange={() => {}}
      definition={definition}
      capabilities={null}
      testResult={null}
      onFocusNode={() => {}}
      onApplyDefinition={(next) =>
        setNodes((current) => applyDefinitionToCanvasNodes({ nodes: current, definition: next }))
      }
      onRunTest={() => {}}
      onConfirmPublish={onConfirmPublish}
    />
  );
}

describe('publish guardrail round trip', () => {
  test('a blocker holds Publish shut until the offending step is disabled', () => {
    const onConfirmPublish = mock(() => {});
    render(
      <PublishHarness
        initialNodes={[canvasNode(workflowNode('trigger.webhook', 'hook'))]}
        onConfirmPublish={onConfirmPublish}
      />,
    );

    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/has no managed webhook binding/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Disable this step' }));

    expect(screen.queryByText(/has no managed webhook binding/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Publish' }).hasAttribute('disabled')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onConfirmPublish).toHaveBeenCalledTimes(1);
  });

  test('a clean graph goes straight to a publishable dialog', () => {
    render(
      <PublishHarness
        initialNodes={[canvasNode(workflowNode('trigger.manual', 'manual'))]}
        onConfirmPublish={mock(() => {})}
      />,
    );

    expect(screen.getByText('Every enabled step is wired and ready to run live.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publish' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('WorkflowInspector capability resolution', () => {
  test('believes the server over the bundled lifecycle constant', () => {
    renderInspector({
      capabilities: {
        sources: [],
        mcpReadTools: [],
        generatedAt: '2026-07-28T00:00:00.000Z',
        actions: [
          {
            type: 'action.email',
            lifecycle: 'production',
            availability: 'unavailable',
            reason: 'Email delivery is disabled for this brand.',
          },
        ],
      } as AutomationCapabilitiesResponse,
    });

    // The selected node is an `instruction`, which the server said nothing
    // about, so the bundled answer stands and no availability badge appears.
    expect(screen.queryByText('Unavailable')).toBeNull();
  });
});

// A prop that is simply never forwarded fails silently. `NodeConfigurationEditor`
// has always accepted `brandId` and handed it to all five action pickers, but
// `WorkflowInspector` did not declare it and no caller passed one — so every
// picker in production rendered its raw-id fallback, which is the deliberate
// degrade path for an outage and therefore looks intentional rather than broken.
//
// The assertion keys on the no-brand reason specifically, not on "is it
// degraded": with a brand in scope the picker may still degrade because the
// fetch failed, and that is a different sentence and a different bug.
describe('WorkflowInspector brand scope', () => {
  const NO_BRAND = /No brand is in scope/i;
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const renderPlannerInspector = (brandId?: string) => {
    globalThis.fetch = mock(async () => new Response('{}', { status: 500 })) as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <WorkflowInspector
            selected={createAutomationWorkflowNode({
              type: 'action.planner_upsert',
              id: 'planner',
              position: { x: 0, y: 0 },
            })}
            brandId={brandId}
            locked={false}
            validation={{ ok: true, issues: [], definitionHash: 'hash' }}
            evidence={[]}
            nodeRuns={[]}
            checks={[]}
            actionReceipts={[]}
            sourceCapabilities={null}
            webhookDestinations={[]}
            webhookEndpoints={[]}
            onPatch={mock(() => {})}
            onSelectIssue={mock(() => {})}
            onMessage={mock(() => {})}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );
  };

  test('forwards the brand through to the action pickers', () => {
    renderPlannerInspector('11111111-1111-4111-8111-111111111111');
    expect(screen.queryByText(NO_BRAND)).toBeNull();
  });

  test('claims no brand only when there genuinely is none', () => {
    renderPlannerInspector(undefined);
    expect(screen.getByText(NO_BRAND)).toBeTruthy();
  });
});
