// Airtable #289 — a Design Reference INFORMS a generation; it never blocks one.
//
// The owner's ruling: a connected palette contributes to the generation and its critique,
// and its absence from the result is not a failure. Readiness judged a designRef's ports
// the way it judges a reference image, so a Palette reference whose specimen had not been
// generated yet stopped the run — reaching for brand grounding was the thing that
// prevented the picture. These tests hold the rule on both ports.

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Edge } from '@xyflow/react';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { executeWorkflow } from './executeWorkflow';

const rehydrateWorkflowMediaNodes = mock(async (input: StudioNode[]) => input);

const buildControls = (executeGeneration: ReturnType<typeof mock>) => ({
  executeGeneration,
  executeVideoExtension: mock(async () => ({
    success: true,
    output: { type: 'video', url: 'video_url' },
  })),
  executeEnrichment: mock(async () => ({
    success: true,
    output: { type: 'text', value: 'enriched' },
  })),
  cancel: () => {},
  reset: () => {},
  isExecuting: true,
  error: null,
});

const generator = (): StudioNode => ({
  id: 'gen',
  position: { x: 0, y: 0 },
  type: 'nanoGen',
  data: { model: 'nano-banana', positivePrompt: 'a founder lifting the bottle off the counter' },
});

/** A Palette reference the user chose but never generated a specimen for. */
const emptyPaletteRef = (): StudioNode => ({
  id: 'ref',
  position: { x: 0, y: 0 },
  type: 'designRef',
  data: { section: 'palette', mode: 'both' },
});

const run = async (nodes: StudioNode[], edges: Edge[]) => {
  useStudioStore.getState().setNodes(nodes);
  useStudioStore.getState().setEdges(edges);
  const executeGeneration = mock(async () => ({
    success: true,
    output: { type: 'image', base64: 'base64data', mimeType: 'image/png' },
  }));
  await executeWorkflow(buildControls(executeGeneration) as never);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {
    executeGeneration,
    node: useStudioStore.getState().nodes.find((entry) => entry.id === 'gen'),
  };
};

describe('#289 a designRef never blocks a generation', () => {
  beforeEach(() => {
    mock.module('./rehydrateWorkflowMedia', () => ({ rehydrateWorkflowMediaNodes }));
    rehydrateWorkflowMediaNodes.mockImplementation(async (input: StudioNode[]) => input);
    useStudioStore.setState({
      nodes: [],
      edges: [],
      defaultEdgeType: 'bezier',
      brandId: 'brand-test',
    });
  });

  it('generates with an unfilled palette on ref-image instead of stopping on it', async () => {
    const { executeGeneration, node } = await run(
      [generator(), emptyPaletteRef()],
      [{ id: 'e1', source: 'ref', target: 'gen', sourceHandle: 'image', targetHandle: 'ref-image' }],
    );

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(node?.data.error).toBeFalsy();
  });

  it('falls back to the generator own prompt when the palette has no tokens to add', async () => {
    const { executeGeneration, node } = await run(
      [generator(), emptyPaletteRef()],
      [{ id: 'e1', source: 'ref', target: 'gen', sourceHandle: 'text', targetHandle: 'prompt' }],
    );

    expect(node?.data.error).toBeFalsy();
    expect(executeGeneration.mock.calls[0]?.[1]).toMatchObject({
      prompt: 'a founder lifting the bottle off the counter',
    });
  });

  it('still refuses a reference image node that is genuinely empty', async () => {
    // The rule is scoped to the designRef, not widened into "nothing is ever required":
    // an Image node wired to ref-image with no media is still the run's blocker.
    const { executeGeneration, node } = await run(
      [
        generator(),
        { id: 'img', position: { x: 0, y: 0 }, type: 'image', data: {} } as StudioNode,
      ],
      [{ id: 'e1', source: 'img', target: 'gen', targetHandle: 'ref-image' }],
    );

    expect(executeGeneration).not.toHaveBeenCalled();
    expect(node?.data.error).toBeTruthy();
  });
});
