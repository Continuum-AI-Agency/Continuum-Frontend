'use client';

// A "Technique" is a saved canvas selection with a declared port contract — the
// reusable piece you drop into any canvas and wire up, rather than a whole
// workflow you load over the top of your work.
//
// It has two tiers and ZERO new tables:
//   brand  — a `canvas_workflows` row flagged with `metadata.technique`
//            (exactly the lane starters already ride, see ./starters.ts)
//   global — a `workflow_library` row with visibility='global', whose
//            `content.metadata.technique` carries the same block
//
// Both tiers are normalised into one `AiStudioWorkflow` here, so the apply path
// is the single `useApplyWorkflow` the Load-workflow dialog and the composer's
// starter picker already share. A picker only ever sees TechniqueItem.

import {
  type CanvasTechniquePort,
  parseTechniqueMetadata,
  type WorkflowFragmentKind,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import type { WorkflowLibraryItem } from '@/lib/schemas/workflowLibrary';
import { useApplyWorkflow } from '@/StudioCanvas/hooks/useApplyWorkflow';
import { useWorkflowLibrary } from './useWorkflowLibrary';
import { listAiStudioWorkflowsAction } from './workflowActions';

export const brandTechniquesQueryKey = (brandProfileId?: string) =>
  ['brand-techniques', brandProfileId] as const;

export type TechniqueTier = 'brand' | 'global';

export type TechniqueItem = {
  id: string;
  name: string;
  description?: string;
  kind: WorkflowFragmentKind;
  tier: TechniqueTier;
  inputPorts: CanvasTechniquePort[];
  outputPorts: CanvasTechniquePort[];
  nodeCount: number;
  edgeCount: number;
  /** Exactly what useApplyWorkflow consumes — the picker never unpacks this. */
  workflow: AiStudioWorkflow;
};

export function isTechnique(workflow: AiStudioWorkflow): boolean {
  return parseTechniqueMetadata(workflow.metadata) !== undefined;
}

const toItem = (
  workflow: AiStudioWorkflow,
  tier: TechniqueTier,
  metadata: Record<string, unknown> | undefined,
): TechniqueItem | null => {
  const technique = parseTechniqueMetadata(metadata);
  if (!technique) return null;
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    kind: technique.kind,
    tier,
    inputPorts: technique.inputPorts,
    outputPorts: technique.outputPorts,
    nodeCount: workflow.nodes?.length ?? 0,
    edgeCount: workflow.edges?.length ?? 0,
    workflow,
  };
};

export function techniqueFromWorkflow(workflow: AiStudioWorkflow): TechniqueItem | null {
  return toItem(workflow, 'brand', workflow.metadata);
}

/**
 * A global premade arrives as a library row whose graph lives under `content`.
 * Reshaped into a workflow so the one apply path serves both tiers.
 */
export function techniqueFromLibraryItem(item: WorkflowLibraryItem): TechniqueItem | null {
  return toItem(
    {
      id: item.id,
      brandProfileId: 'global',
      name: item.name,
      description: item.description,
      nodes: item.content.nodes ?? [],
      edges: item.content.edges ?? [],
      metadata: item.content.metadata,
      source: 'global',
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    },
    'global',
    item.content.metadata,
  );
}

export async function fetchBrandTechniques(brandProfileId: string): Promise<TechniqueItem[]> {
  const workflows = await listAiStudioWorkflowsAction(brandProfileId);
  return workflows
    .map(techniqueFromWorkflow)
    .filter((item): item is TechniqueItem => item !== null);
}

const byName = (a: TechniqueItem, b: TechniqueItem) => a.name.localeCompare(b.name);

/**
 * Brand techniques first, then the premades. A brand row shadows a global row of
 * the same name: once someone has saved their own "Palette smash-up", that is
 * the one they mean.
 */
export function mergeTechniqueTiers(
  brand: TechniqueItem[],
  global: TechniqueItem[],
): TechniqueItem[] {
  const claimed = new Set(brand.map((item) => item.name.trim().toLowerCase()));
  return [
    ...brand.slice().sort(byName),
    ...global.filter((item) => !claimed.has(item.name.trim().toLowerCase())).sort(byName),
  ];
}

export function useTechniques(brandProfileId?: string): {
  items: TechniqueItem[];
  isLoading: boolean;
} {
  const brand = useQuery({
    queryKey: brandTechniquesQueryKey(brandProfileId),
    queryFn: () =>
      brandProfileId
        ? fetchBrandTechniques(brandProfileId)
        : Promise.resolve([] as TechniqueItem[]),
    enabled: Boolean(brandProfileId),
  });
  const library = useWorkflowLibrary();

  const items = useMemo(
    () =>
      mergeTechniqueTiers(
        brand.data ?? [],
        library.items
          .map(techniqueFromLibraryItem)
          .filter((item): item is TechniqueItem => item !== null),
      ),
    [brand.data, library.items],
  );

  return { items, isLoading: brand.isLoading || library.isLoading };
}

export function techniqueApplyOptions(position?: { x: number; y: number }, collapsed?: boolean) {
  // `collapsed` default stays undefined (= expanded): the workflow bench's technique
  // rows count expanded module nodes, and every existing caller keeps its behavior.
  return { toastTitle: 'Technique added', position, collapsed };
}

/**
 * The one call a picker needs. `position` is the flow-space point to land the
 * subgraph on; omit it and the module drops below existing work, which is what
 * the Load-workflow dialog wants.
 */
export function useApplyTechnique() {
  const applyWorkflow = useApplyWorkflow();
  return (item: TechniqueItem, position?: { x: number; y: number }) =>
    applyWorkflow(item.workflow, techniqueApplyOptions(position));
}
