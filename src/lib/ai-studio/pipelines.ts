'use client';

// A "Pipeline" is a saved canvas somebody PUBLISHED: declared input ports a
// machine may write, declared output ports it reads back, and a middle that is
// nobody's to touch.
//
// Same row as a Technique (`canvas_workflows`), same table, one different flag —
// and the flag is the whole difference. `metadata.technique` says "a person may
// drop this in and wire it up"; `metadata.pipeline` says "an unattended caller may
// run this against a live ad account". Only the second one belongs in an
// automation picker, so this module filters on `parsePipelineMetadata` and never
// on "has ports".
//
// Brand rows only. The Backend's `readPipeline` also falls back to the global
// library, and the picker's raw-id field keeps a global id editable, but nothing
// global has been published — listing an empty tier would be a promise, not a
// feature.

import { type CanvasTechniquePort, parsePipelineMetadata } from '@continuum/contracts';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import { listAiStudioWorkflowsAction } from './workflowActions';

export type PipelineItem = {
  id: string;
  name: string;
  description?: string;
  inputPorts: CanvasTechniquePort[];
  outputPorts: CanvasTechniquePort[];
};

export function isPipeline(workflow: AiStudioWorkflow): boolean {
  return parsePipelineMetadata(workflow.metadata) !== undefined;
}

export function pipelineFromWorkflow(workflow: AiStudioWorkflow): PipelineItem | null {
  const pipeline = parsePipelineMetadata(workflow.metadata);
  if (!pipeline) return null;
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    inputPorts: pipeline.inputPorts,
    outputPorts: pipeline.outputPorts,
  };
}

export async function fetchBrandPipelines(brandProfileId: string): Promise<PipelineItem[]> {
  const workflows = await listAiStudioWorkflowsAction(brandProfileId);
  return workflows
    .map(pipelineFromWorkflow)
    .filter((item): item is PipelineItem => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
