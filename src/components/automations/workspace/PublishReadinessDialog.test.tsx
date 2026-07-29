// Publishing locks the graph and activates the schedule, so this dialog is the
// last honest read on what a live run would do. Everything here is driven
// through props — no `mock.module` — so nothing leaks into sibling spec files.

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  AutomationCapabilitiesResponse,
  AutomationWorkflowDefinition,
  AutomationWorkflowNode,
  TestAutomationWorkflowResponse,
} from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createAutomationWorkflowNode } from './automationNodeCatalog';
import { PublishReadinessDialog } from './PublishReadinessDialog';

afterEach(cleanup);

// Radix focus-scope constructs a MutationObserver on open and walks up to
// HTMLFormElement; both live on the happy-dom window rather than the shared
// setup file's globals.
type LiftedGlobals = {
  MutationObserver?: typeof MutationObserver;
  HTMLFormElement?: typeof HTMLFormElement;
};
const happyDomWindow = globalThis.window as unknown as LiftedGlobals;
const testGlobals = globalThis as LiftedGlobals;
if (typeof testGlobals.MutationObserver !== 'function') {
  testGlobals.MutationObserver = happyDomWindow.MutationObserver;
}
if (typeof testGlobals.HTMLFormElement !== 'function') {
  testGlobals.HTMLFormElement = happyDomWindow.HTMLFormElement;
}

const node = (type: AutomationWorkflowNode['type'], id = `node-${type}`): AutomationWorkflowNode =>
  createAutomationWorkflowNode({ type, position: { x: 0, y: 0 }, id });

const enabled = (candidate: AutomationWorkflowNode): AutomationWorkflowNode => ({
  ...candidate,
  disabled: false,
});

const definitionOf = (...nodes: AutomationWorkflowNode[]): AutomationWorkflowDefinition => ({
  schemaVersion: 3,
  nodes,
  edges: [],
  execution: { maxRunSeconds: 900, maxParallelNodes: 4 },
});

const capabilities = (
  overrides: Partial<AutomationCapabilitiesResponse> = {},
): AutomationCapabilitiesResponse => ({
  sources: [],
  mcpReadTools: [],
  generatedAt: '2026-07-28T00:00:00.000Z',
  ...overrides,
});

const configuredPublishNode = (id = 'publish'): AutomationWorkflowNode => {
  const publish = node('action.organic_publish', id);
  return publish.type === 'action.organic_publish'
    ? { ...publish, config: { ...publish.config, accountId: '17841400000000000' } }
    : publish;
};

const passingTest = (): TestAutomationWorkflowResponse =>
  ({
    runId: 'run-1',
    validation: { ok: true, issues: [], definitionHash: 'hash' },
    nodeExecutions: [
      {
        nodeId: 'publish',
        nodeType: 'action.organic_publish',
        status: 'completed',
        selectedHandle: 'output',
        errorMessage: null,
        durationMs: 12,
      },
    ],
    evidence: [],
    checks: [],
    actionReceipts: [],
  }) as unknown as TestAutomationWorkflowResponse;

type Handlers = {
  onOpenChange: ReturnType<typeof mock>;
  onFocusNode: ReturnType<typeof mock>;
  onApplyDefinition: ReturnType<typeof mock>;
  onRunTest: ReturnType<typeof mock>;
  onConfirmPublish: ReturnType<typeof mock>;
};

const renderDialog = ({
  definition,
  capabilities: caps,
  testResult,
}: {
  definition: AutomationWorkflowDefinition | null;
  capabilities?: AutomationCapabilitiesResponse | null;
  testResult?: TestAutomationWorkflowResponse | null;
}): Handlers => {
  const handlers: Handlers = {
    onOpenChange: mock(() => {}),
    onFocusNode: mock(() => {}),
    onApplyDefinition: mock(() => {}),
    onRunTest: mock(() => {}),
    onConfirmPublish: mock(() => {}),
  };

  render(
    <PublishReadinessDialog
      open
      definition={definition}
      capabilities={caps}
      testResult={testResult}
      onOpenChange={handlers.onOpenChange}
      onFocusNode={handlers.onFocusNode}
      onApplyDefinition={handlers.onApplyDefinition}
      onRunTest={handlers.onRunTest}
      onConfirmPublish={handlers.onConfirmPublish}
    />,
  );

  return handlers;
};

const publishButton = () => screen.getByRole('button', { name: 'Publish' });

describe('PublishReadinessDialog', () => {
  test('confirms in one line when the graph is clean', () => {
    renderDialog({
      definition: definitionOf(configuredPublishNode()),
      capabilities: capabilities(),
    });

    expect(screen.getByText('Every enabled step is wired and ready to run live.')).toBeTruthy();
    expect(screen.queryByText(/would fail on a live run/)).toBeNull();
    expect((publishButton() as HTMLButtonElement).disabled).toBe(false);
  });

  test('is shown for a clean graph too, and publishing goes through the confirm', () => {
    const handlers = renderDialog({
      definition: definitionOf(configuredPublishNode()),
      capabilities: capabilities(),
    });

    fireEvent.click(publishButton());

    expect(handlers.onConfirmPublish).toHaveBeenCalledTimes(1);
  });

  test('turns a server-reported unavailable action into a focusable blocker', () => {
    const handlers = renderDialog({
      definition: definitionOf(configuredPublishNode()),
      capabilities: capabilities({
        actions: [
          {
            type: 'action.organic_publish',
            lifecycle: 'production',
            availability: 'unavailable',
            reason: 'Instagram publishing is not enabled for this brand.',
          },
        ],
      }),
    });

    expect(screen.getByText('1 step would fail on a live run')).toBeTruthy();
    expect(screen.getByText('Instagram publishing is not enabled for this brand.')).toBeTruthy();
    expect((publishButton() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Unavailable/ }));

    expect(handlers.onFocusNode).toHaveBeenCalledWith('publish');
  });

  test('emits a patch that disables every blocking node and leaves the rest alone', () => {
    const definition = definitionOf(
      enabled(node('integration.query')),
      configuredPublishNode(),
      node('action.email'),
    );
    const handlers = renderDialog({ definition, capabilities: capabilities() });

    fireEvent.click(screen.getByRole('button', { name: 'Disable this step' }));

    expect(handlers.onApplyDefinition).toHaveBeenCalledTimes(1);
    const patched = handlers.onApplyDefinition.mock.calls[0]?.[0] as AutomationWorkflowDefinition;
    expect(patched.nodes.find((entry) => entry.id === 'node-integration.query')?.disabled).toBe(
      true,
    );
    expect(patched.nodes.find((entry) => entry.id === 'publish')?.disabled).toBe(false);
    expect(patched.nodes).toHaveLength(3);
    expect(patched.edges).toEqual(definition.edges);
  });

  test('re-checks against the patched definition, clearing the blocker section', () => {
    const definition = definitionOf(enabled(node('integration.query')), configuredPublishNode());
    const { rerender } = render(
      <PublishReadinessDialog
        open
        definition={definition}
        capabilities={capabilities()}
        onOpenChange={() => {}}
        onFocusNode={() => {}}
        onApplyDefinition={() => {}}
        onRunTest={() => {}}
        onConfirmPublish={() => {}}
      />,
    );

    // One node, two placeholders — counted as one failing step, listed twice.
    expect(screen.getByText('1 step would fail on a live run')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Not configured/ })).toHaveLength(2);

    rerender(
      <PublishReadinessDialog
        open
        definition={definitionOf(
          { ...node('integration.query'), disabled: true },
          configuredPublishNode(),
        )}
        capabilities={capabilities()}
        onOpenChange={() => {}}
        onFocusNode={() => {}}
        onApplyDefinition={() => {}}
        onRunTest={() => {}}
        onConfirmPublish={() => {}}
      />,
    );

    expect(screen.queryByText(/would fail on a live run/)).toBeNull();
    expect((publishButton() as HTMLButtonElement).disabled).toBe(false);
  });

  test('surfaces needs_connection as a warning that does not block publishing', () => {
    const handlers = renderDialog({
      definition: definitionOf(configuredPublishNode()),
      capabilities: capabilities({
        actions: [
          {
            type: 'action.organic_publish',
            lifecycle: 'production',
            availability: 'needs_connection',
            reason: 'Reconnect Instagram to publish.',
          },
        ],
      }),
    });

    expect(screen.getByText('1 step will run without a connection')).toBeTruthy();
    expect(screen.getByText('Reconnect Instagram to publish.')).toBeTruthy();
    expect((publishButton() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /^Disable/ })).toBeNull();

    fireEvent.click(publishButton());
    expect(handlers.onConfirmPublish).toHaveBeenCalledTimes(1);
  });

  test('offers Run test without blocking Publish when this session has no local test', () => {
    const handlers = renderDialog({
      definition: definitionOf(configuredPublishNode()),
      capabilities: capabilities(),
      testResult: null,
    });

    expect(screen.getByText(/No test run in this session/)).toBeTruthy();
    expect((publishButton() as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Run test' }));
    expect(handlers.onRunTest).toHaveBeenCalledTimes(1);
  });

  test('reports a passing session test', () => {
    renderDialog({
      definition: definitionOf(configuredPublishNode()),
      capabilities: capabilities(),
      testResult: passingTest(),
    });

    expect(screen.getByText('Last test passed 1 node.')).toBeTruthy();
  });

  test('does not blame a preview node that is disabled on the canvas', () => {
    renderDialog({
      definition: definitionOf(node('integration.query'), configuredPublishNode()),
      capabilities: capabilities(),
    });

    expect(screen.queryByText(/would fail on a live run/)).toBeNull();
    expect((publishButton() as HTMLButtonElement).disabled).toBe(false);
  });
});
