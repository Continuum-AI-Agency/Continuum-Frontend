import { describe, it, expect } from 'bun:test';
import { serializeWorkflowSnapshot, normalizeWorkflowSnapshot } from './workflowSerialization';
import type { StudioNode } from '../types';
import type { Edge } from '@xyflow/react';

const buildNode = (overrides: Partial<StudioNode> = {}): StudioNode => ({
  id: 'node-1',
  type: 'string',
  position: { x: 0, y: 0 },
  data: {
    value: 'hello',
    isExecuting: true,
    isComplete: true,
    error: 'boom',
    executionTime: 12,
    isToolbarVisible: true,
  },
  ...overrides,
});

const buildEdge = (overrides: Partial<Edge> = {}): Edge => ({
  id: 'edge-1',
  source: 'node-1',
  target: 'node-2',
  sourceHandle: 'text',
  targetHandle: 'prompt',
  data: { dataType: 'text' },
  ...overrides,
});

describe('workflowSerialization', () => {
  it('strips runtime fields from node data on serialize', () => {
    const snapshot = serializeWorkflowSnapshot(
      [buildNode(), buildNode({ id: 'node-2', data: { value: 'world' } })],
      [buildEdge({ source: 'node-1', target: 'node-2' })],
      'bezier'
    );

    const firstNode = snapshot.nodes[0];
    expect(firstNode.data).toEqual({ value: 'hello' });
  });

  it('drops edges referencing missing nodes', () => {
    const snapshot = normalizeWorkflowSnapshot(
      {
        nodes: [buildNode({ id: 'node-1' })],
        edges: [
          buildEdge({ source: 'node-1', target: 'node-2' }),
          buildEdge({ source: 'node-2', target: 'node-1' }),
        ],
      },
      'bezier'
    );

    expect(snapshot.edges).toHaveLength(0);
  });

  it('normalizes edge data defaults when serializing', () => {
    const snapshot = serializeWorkflowSnapshot(
      [buildNode({ id: 'node-1' }), buildNode({ id: 'node-2', data: { value: 'ok' } })],
      [buildEdge({ source: 'node-1', target: 'node-2', data: {} })],
      'smoothstep'
    );

    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.edges).toHaveLength(1);
    expect(snapshot.edges[0].data).toEqual(expect.objectContaining({ pathType: 'smoothstep' }));
  });
});
