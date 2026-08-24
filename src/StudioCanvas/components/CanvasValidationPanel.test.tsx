// The review queue for the graph's own complaints. It lives inside a React Flow
// <Panel>, so it needs the flow store, and its list lives in a Popover that only mounts
// once the trigger is clicked.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { GraphIssue } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

import { CanvasValidationPanel } from './CanvasValidationPanel';

afterEach(() => {
  cleanup();
});

function issue(overrides: Partial<GraphIssue> = {}): GraphIssue {
  return {
    code: 'missing_prompt',
    message: 'Add a prompt before running this node.',
    nodeId: 'node-1',
    severity: 'error',
    phase: 'run',
    ...overrides,
  };
}

function renderPanel(issues: GraphIssue[]) {
  const onFocusIssue = mock((_nodeId: string) => {});
  const view = render(
    <ReactFlowProvider>
      <CanvasValidationPanel issues={issues} onFocusIssue={onFocusIssue} />
    </ReactFlowProvider>,
  );
  return { ...view, onFocusIssue };
}

// Click the trigger by its visible text rather than by [data-slot="popover-trigger"]:
// four other suites replace @/components/ui/popover with a pass-through stub, and
// mock.module is process-wide, so the slot attribute is not there in a full-suite run.
// The text button is present either way, and the stub mounts the content eagerly.
function openQueue(view: ReturnType<typeof renderPanel>) {
  fireEvent.click(view.getByText(/ to review$/));
}

describe('CanvasValidationPanel', () => {
  it('renders nothing when the graph has no issues', () => {
    const { container } = renderPanel([]);

    expect(container.textContent).toBe('');
    expect(container.querySelector('button')).toBeNull();
  });

  it('counts the issues on the trigger', () => {
    const { getByText } = renderPanel([issue(), issue({ nodeId: 'node-2' })]);

    expect(getByText('2 to review')).toBeDefined();
  });

  it('labels a single issue in the singular and several in the plural', () => {
    const single = renderPanel([issue()]);
    expect(
      single.container.querySelector('[aria-label="1 workflow validation issue"]'),
    ).not.toBeNull();
    cleanup();

    const several = renderPanel([issue(), issue({ nodeId: 'node-2' })]);
    expect(
      several.container.querySelector('[aria-label="2 workflow validation issues"]'),
    ).not.toBeNull();
  });

  it('lists every issue message once the queue is opened', () => {
    const view = renderPanel([
      issue({ message: 'Add a prompt before running this node.' }),
      issue({ nodeId: 'node-2', code: 'dangling_edge', message: 'This edge points nowhere.' }),
    ]);
    openQueue(view);

    expect(view.getByText('Add a prompt before running this node.')).toBeDefined();
    expect(view.getByText('This edge points nowhere.')).toBeDefined();
  });

  it('heads a run-phase issue with "Before running" and any other phase with "Connection"', () => {
    const view = renderPanel([
      issue({ phase: 'run' }),
      issue({ nodeId: 'node-2', code: 'invalid_connection', phase: 'edit', message: 'Bad wire.' }),
    ]);
    openQueue(view);

    expect(view.getByText('Before running')).toBeDefined();
    expect(view.getByText('Connection')).toBeDefined();
  });

  it('focuses the node an issue names when its row is clicked', () => {
    const view = renderPanel([issue({ nodeId: 'node-42' })]);
    openQueue(view);

    fireEvent.click(view.getByText('Add a prompt before running this node.'));

    expect(view.onFocusIssue).toHaveBeenCalledTimes(1);
    expect(view.onFocusIssue).toHaveBeenCalledWith('node-42');
  });

  it('does nothing for an issue that names no node', () => {
    const view = renderPanel([
      issue({ nodeId: undefined, edgeId: 'edge-1', code: 'dangling_edge', phase: 'edit' }),
    ]);
    openQueue(view);

    fireEvent.click(view.getByText('Add a prompt before running this node.'));

    expect(view.onFocusIssue).toHaveBeenCalledTimes(0);
  });
});
