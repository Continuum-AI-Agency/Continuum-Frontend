import { describe, expect, test } from 'bun:test';
import { createAutomationWorkflowNode } from './automationNodeCatalog';
import type { WorkflowCanvasNode } from './WorkflowNodeCard';
import {
  evaluateWorkflowConnection,
  findCompatibleWorkflowConnection,
  isWorkflowConnectionValid,
} from './workflowCanvasModel';

const canvasNode = (
  workflowNode: ReturnType<typeof createAutomationWorkflowNode>,
): WorkflowCanvasNode => ({
  id: workflowNode.id,
  type: 'workflow',
  position: workflowNode.position,
  data: { workflowNode, locked: false, issues: [] },
});

describe('workflow canvas connection guard', () => {
  const trigger = canvasNode(
    createAutomationWorkflowNode({
      type: 'trigger.manual',
      id: 'trigger',
      position: { x: 0, y: 0 },
    }),
  );
  const instruction = canvasNode(
    createAutomationWorkflowNode({
      type: 'instruction',
      id: 'instruction',
      position: { x: 200, y: 0 },
    }),
  );
  const source = canvasNode(
    createAutomationWorkflowNode({
      type: 'source',
      id: 'source',
      position: { x: 400, y: 0 },
    }),
  );
  const email = canvasNode(
    createAutomationWorkflowNode({
      type: 'action.email',
      id: 'email',
      position: { x: 600, y: 0 },
    }),
  );
  const secondInstruction = canvasNode(
    createAutomationWorkflowNode({
      type: 'instruction',
      id: 'instruction-2',
      position: { x: 400, y: 0 },
    }),
  );

  test('accepts compatible ports and rejects duplicate or incompatible connections', () => {
    const connection = {
      source: 'trigger',
      sourceHandle: 'output',
      target: 'instruction',
      targetHandle: 'input',
    };

    expect(
      isWorkflowConnectionValid({ connection, nodes: [trigger, instruction], edges: [] }),
    ).toBe(true);
    expect(
      isWorkflowConnectionValid({
        connection,
        nodes: [trigger, instruction],
        edges: [{ id: 'existing', ...connection }],
      }),
    ).toBe(false);
    expect(
      isWorkflowConnectionValid({
        connection: {
          source: 'source',
          sourceHandle: 'output',
          target: 'email',
          targetHandle: 'input',
        },
        nodes: [source, email],
        edges: [],
      }),
    ).toBe(false);
  });

  test('rejects a connection that would introduce a graph cycle', () => {
    expect(
      isWorkflowConnectionValid({
        connection: {
          source: 'instruction-2',
          sourceHandle: 'output',
          target: 'instruction',
          targetHandle: 'input',
        },
        nodes: [instruction, secondInstruction],
        edges: [
          {
            id: 'forward',
            source: 'instruction',
            sourceHandle: 'output',
            target: 'instruction-2',
            targetHandle: 'input',
          },
        ],
      }),
    ).toBe(false);
  });

  test('explains why a connection is rejected', () => {
    expect(
      evaluateWorkflowConnection({
        connection: {
          source: 'source',
          sourceHandle: 'output',
          target: 'email',
          targetHandle: 'input',
        },
        nodes: [source, email],
        edges: [],
      }),
    ).toEqual({
      valid: false,
      code: 'incompatible_ports',
      reason: 'Records output cannot connect to this input.',
    });

    expect(
      evaluateWorkflowConnection({
        connection: {
          source: 'instruction-2',
          sourceHandle: 'output',
          target: 'instruction',
          targetHandle: 'input',
        },
        nodes: [instruction, secondInstruction],
        edges: [
          {
            id: 'forward',
            source: 'instruction',
            sourceHandle: 'output',
            target: 'instruction-2',
            targetHandle: 'input',
          },
        ],
      }),
    ).toMatchObject({ valid: false, code: 'cycle' });
  });

  test('finds valid handles for a context-menu connected step', () => {
    expect(
      findCompatibleWorkflowConnection({
        sourceId: 'trigger',
        targetId: 'instruction',
        nodes: [trigger, instruction],
        edges: [],
      }),
    ).toEqual({
      source: 'trigger',
      sourceHandle: 'output',
      target: 'instruction',
      targetHandle: 'input',
    });

    expect(
      findCompatibleWorkflowConnection({
        sourceId: 'source',
        targetId: 'email',
        nodes: [source, email],
        edges: [],
      }),
    ).toBeNull();
  });
});
