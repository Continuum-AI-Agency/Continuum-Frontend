import { describe, it, expect } from 'bun:test';
import { buildDependencyGraph, getExecutableNodes } from './buildDependencyGraph';
import { StudioNode } from '../types';
import { Edge } from '@xyflow/react';

describe('buildDependencyGraph', () => {
  it('should build dependency graph correctly', () => {
    const nodes: StudioNode[] = [
      { id: '1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: '2', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
      { id: '3', position: { x: 0, y: 0 }, data: {}, type: 'veoDirector' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: '1', target: '2' },
      { id: 'e2', source: '2', target: '3' },
    ];

    const graph = buildDependencyGraph(nodes, edges);

    expect(graph.dependencies.get('2')).toContain('1');
    expect(graph.dependencies.get('3')).toContain('2');
    expect(graph.dependents.get('1')).toContain('2');
    expect(graph.dependents.get('2')).toContain('3');
  });

  it('should identify entry points (nodes with no executable dependencies)', () => {
    const nodes: StudioNode[] = [
      { id: '1', position: { x: 0, y: 0 }, data: {}, type: 'string' }, 
      { id: '2', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' }, 
      { id: '3', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' }, 
    ];

    const edges: Edge[] = [
      { id: 'e1', source: '1', target: '2' },
      { id: 'e2', source: '2', target: '3' },
    ];

    const graph = buildDependencyGraph(nodes, edges);
    expect(graph.entryPoints).toContain('1');
    expect(graph.entryPoints).not.toContain('2');
    expect(graph.entryPoints).not.toContain('3');
  });

  it('should sort nodes topologically', () => {
    const nodes: StudioNode[] = [
      { id: '1', position: { x: 0, y: 0 }, data: {}, type: 'default' },
      { id: '2', position: { x: 0, y: 0 }, data: {}, type: 'default' },
      { id: '3', position: { x: 0, y: 0 }, data: {}, type: 'default' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: '1', target: '2' },
      { id: 'e2', source: '2', target: '3' },
    ];

    const graph = buildDependencyGraph(nodes, edges);
    // Should be 1 -> 2 -> 3
    expect(graph.executionOrder).toEqual(['1', '2', '3']);
  });
});

describe('getExecutableNodes', () => {
  it('should return nodes whose dependencies are satisfied', () => {
    const completedOutputs = new Map<string, any>();
    completedOutputs.set('1', { value: 'done' });

    const dependencies = new Map<string, string[]>();
    dependencies.set('2', ['1']);
    dependencies.set('3', ['2']);

    const candidateNodes = ['2', '3'];

    const executable = getExecutableNodes(completedOutputs, dependencies, candidateNodes);
    expect(executable).toContain('2');
    expect(executable).not.toContain('3');
  });

  it('should return nodes with no dependencies', () => {
    const completedOutputs = new Map<string, any>();
    const dependencies = new Map<string, string[]>();
    dependencies.set('1', []);

    const candidateNodes = ['1'];
    const executable = getExecutableNodes(completedOutputs, dependencies, candidateNodes);
    expect(executable).toContain('1');
  });
});
