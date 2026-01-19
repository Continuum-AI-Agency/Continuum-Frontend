import type { Edge } from '@xyflow/react';
import { StudioNode } from '../types';
import { DependencyGraph } from '../types/execution';

function isExecutableNode(node: StudioNode): boolean {
  return ['nanoGen', 'veoDirector', 'veoFast', 'extendVideo', 'string'].includes(node.type || '');
}

function topologicalSort(
  nodes: StudioNode[],
  dependencies: Map<string, string[]>,
  dependents: Map<string, string[]>
): string[] {
  const inDegree = new Map<string, number>();
  const queue: string[] = [];
  const result: string[] = [];

  for (const node of nodes) {
    const deps = dependencies.get(node.id) || [];
    inDegree.set(node.id, deps.length);
  }

  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);

    const downstreamNodes = dependents.get(nodeId) || [];
    for (const neighborId of downstreamNodes) {
      const currentDegree = inDegree.get(neighborId);
      if (currentDegree !== undefined) {
        const newDegree = currentDegree - 1;
        inDegree.set(neighborId, newDegree);
        if (newDegree === 0) {
          queue.push(neighborId);
        }
      }
    }
  }
  
  return result;
}

export function buildDependencyGraph(
  nodes: StudioNode[],
  edges: Edge[]
): DependencyGraph {
  const dependents = new Map<string, string[]>();
  const dependencies = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const node of nodes) {
    dependents.set(node.id, []);
    dependencies.set(node.id, []);
  }

  for (const edge of edges) {
    const { source, target } = edge;
    
    if (nodeIds.has(source) && nodeIds.has(target)) {
      const targetDeps = dependencies.get(target) || [];
      if (!targetDeps.includes(source)) {
        targetDeps.push(source);
        dependencies.set(target, targetDeps);
      }

      const sourceDependents = dependents.get(source) || [];
      if (!sourceDependents.includes(target)) {
        sourceDependents.push(target);
        dependents.set(source, sourceDependents);
      }
    }
  }

  const entryPoints: string[] = [];
  for (const node of nodes) {
    if (!isExecutableNode(node)) continue;

    const nodeDeps = dependencies.get(node.id) || [];
    const hasExecutableDep = nodeDeps.some((depId) => {
      const depNode = nodes.find((n) => n.id === depId);
      return depNode && isExecutableNode(depNode);
    });

    if (!hasExecutableDep) {
      entryPoints.push(node.id);
    }
  }

  const executionOrder = topologicalSort(nodes, dependencies, dependents);

  return {
    dependents,
    dependencies,
    entryPoints,
    executionOrder,
  };
}

export function getExecutableNodes(
  completedOutputs: Map<string, any>,
  dependencies: Map<string, string[]>,
  candidateNodes: string[]
): string[] {
  const executable: string[] = [];

  for (const nodeId of candidateNodes) {
    const deps = dependencies.get(nodeId) || [];
    
    const allDepsSatisfied = deps.every((depId) => completedOutputs.has(depId));
    
    if (allDepsSatisfied) {
      executable.push(nodeId);
    }
  }

  return executable;
}
