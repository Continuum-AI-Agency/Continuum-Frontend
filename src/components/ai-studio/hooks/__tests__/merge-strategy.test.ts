import { describe, it, expect } from 'vitest';
import { mergeNodes, mergeEdges } from '../merge-strategy';
import type { StudioNode } from '@/StudioCanvas/types';
import type { Edge } from '@xyflow/react';

describe('mergeNodes', () => {
  it('returns empty array when both local and remote are empty', () => {
    const result = mergeNodes([], [], []);
    expect(result).toEqual([]);
  });

  it('adds remote node to empty local array', () => {
    const remote: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'test' },
      } as StudioNode,
    ];

    const result = mergeNodes([], remote, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('node1');
  });

  it('preserves local node not in remote (not yet saved)', () => {
    const local: StudioNode[] = [
      {
        id: 'node-local',
        type: 'string',
        position: { x: 100, y: 100 },
        data: { value: 'local only' },
      } as StudioNode,
    ];

    const remote: StudioNode[] = [
      {
        id: 'node-remote',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'remote' },
      } as StudioNode,
    ];

    const result = mergeNodes(local, remote, []);
    expect(result).toHaveLength(2);
    expect(result.find(n => n.id === 'node-local')).toBeDefined();
    expect(result.find(n => n.id === 'node-remote')).toBeDefined();
  });

  it('removes node from local via deletedIds', () => {
    const local: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'test' },
      } as StudioNode,
      {
        id: 'node2',
        type: 'string',
        position: { x: 100, y: 100 },
        data: { value: 'test2' },
      } as StudioNode,
    ];

    const remote: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'test' },
      } as StudioNode,
    ];

    const result = mergeNodes(local, remote, ['node2']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('node1');
    expect(result.find(n => n.id === 'node2')).toBeUndefined();
  });

  it('preserves selected state from local node during merge', () => {
    const local: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'old value' },
        selected: true,
      } as StudioNode,
    ];

    const remote: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 50, y: 50 },
        data: { value: 'new value' },
      } as StudioNode,
    ];

    const result = mergeNodes(local, remote, []);
    expect(result).toHaveLength(1);
    expect(result[0].position).toEqual({ x: 50, y: 50 });
    expect(result[0].data).toEqual({ value: 'new value' });
    expect(result[0].selected).toBe(true);
  });

  it('preserves dragging state from local node during merge', () => {
    const local: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'test' },
        dragging: true,
      } as StudioNode,
    ];

    const remote: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 100, y: 100 },
        data: { value: 'test' },
      } as StudioNode,
    ];

    const result = mergeNodes(local, remote, []);
    expect(result[0].dragging).toBe(true);
  });

  it('preserves isExecuting state from local node during merge', () => {
    const local: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'old', isExecuting: true },
      } as StudioNode,
    ];

    const remote: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 50, y: 50 },
        data: { value: 'new' },
      } as StudioNode,
    ];

    const result = mergeNodes(local, remote, []);
    expect(result[0].data.value).toBe('new');
    expect((result[0].data as any).isExecuting).toBe(true);
  });

  it('updates existing node from remote (LWW)', () => {
    const local: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'old' },
      } as StudioNode,
    ];

    const remote: StudioNode[] = [
      {
        id: 'node1',
        type: 'string',
        position: { x: 200, y: 200 },
        data: { value: 'new' },
      } as StudioNode,
    ];

    const result = mergeNodes(local, remote, []);
    expect(result).toHaveLength(1);
    expect(result[0].position).toEqual({ x: 200, y: 200 });
    expect(result[0].data).toEqual({ value: 'new' });
  });
});

describe('mergeEdges', () => {
  it('returns empty array when both local and remote are empty', () => {
    const result = mergeEdges([], [], []);
    expect(result).toEqual([]);
  });

  it('adds remote edge to empty local array', () => {
    const remote: Edge[] = [
      {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
      },
    ];

    const result = mergeEdges([], remote, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('edge1');
  });

  it('preserves local edge not in remote', () => {
    const local: Edge[] = [
      {
        id: 'edge-local',
        source: 'node1',
        target: 'node2',
      },
    ];

    const remote: Edge[] = [
      {
        id: 'edge-remote',
        source: 'node3',
        target: 'node4',
      },
    ];

    const result = mergeEdges(local, remote, []);
    expect(result).toHaveLength(2);
    expect(result.find(e => e.id === 'edge-local')).toBeDefined();
    expect(result.find(e => e.id === 'edge-remote')).toBeDefined();
  });

  it('removes edge from local via deletedIds', () => {
    const local: Edge[] = [
      { id: 'edge1', source: 'node1', target: 'node2' },
      { id: 'edge2', source: 'node3', target: 'node4' },
    ];

    const remote: Edge[] = [
      { id: 'edge1', source: 'node1', target: 'node2' },
    ];

    const result = mergeEdges(local, remote, ['edge2']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('edge1');
  });

  it('preserves selected state from local edge during merge', () => {
    const local: Edge[] = [
      {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        selected: true,
      },
    ];

    const remote: Edge[] = [
      {
        id: 'edge1',
        source: 'node1',
        target: 'node3',
      },
    ];

    const result = mergeEdges(local, remote, []);
    expect(result[0].target).toBe('node3');
    expect(result[0].selected).toBe(true);
  });
});
