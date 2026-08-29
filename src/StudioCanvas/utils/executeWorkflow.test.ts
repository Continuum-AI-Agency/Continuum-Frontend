import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Edge } from '@xyflow/react';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import {
  collectDownstreamLeafIds,
  collectPublisherHandoffs,
  executeWorkflow,
} from './executeWorkflow';
import { computeGenerationSignature } from './generationSignature';

const rehydrateWorkflowMediaNodes = mock(async (input: StudioNode[]) => input);

describe('executeWorkflow', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Default: reference hydration is a no-op (returns inputs unchanged) so existing
    // scenarios behave identically; tests that exercise hydration override this.
    rehydrateWorkflowMediaNodes.mockClear();
    rehydrateWorkflowMediaNodes.mockImplementation(async (input: StudioNode[]) => input);
    mock.module('./rehydrateWorkflowMedia', () => ({
      rehydrateWorkflowMediaNodes,
    }));

    // Reset store state. The brand is part of that state: a mounted canvas always has
    // one, and a run without it is its own scenario (see 'refuses to run with no brand').
    useStudioStore.setState({
      nodes: [],
      edges: [],
      defaultEdgeType: 'bezier',
      brandId: 'brand-test',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const buildControls = (
    executeGeneration: ReturnType<typeof mock>,
    executeVideoExtension: ReturnType<typeof mock> = mock(async () => {
      return { success: true, output: { type: 'video', url: 'video_url' } };
    }),
    executeEnrichment: ReturnType<typeof mock> = mock(async () => {
      return { success: true, output: { type: 'text', value: 'enriched' } };
    }),
  ) => ({
    executeGeneration,
    executeVideoExtension,
    executeEnrichment,
    cancel: () => {},
    reset: () => {},
    isExecuting: true,
    error: null,
  });

  it('should execute a linear workflow', async () => {
    const nodes: StudioNode[] = [
      { id: '1', position: { x: 0, y: 0 }, data: { value: 'prompt' }, type: 'string' },
      { id: '2', position: { x: 0, y: 0 }, data: { model: 'nano-banana' }, type: 'nanoGen' },
    ];

    const edges: Edge[] = [{ id: 'e1', source: '1', target: '2', targetHandle: 'prompt' }];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (nodeId, payload) => {
      return {
        success: true,
        output: { type: 'image', base64: 'base64data', mimeType: 'image/png' },
      };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeGeneration.mock.calls[0][0]).toBe('2');
    expect(executeGeneration.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        prompt: 'prompt',
        model: 'gemini-2.5-flash-image',
      }),
    );

    // Check store updates
    const finalNodes = useStudioStore.getState().nodes;
    const updatedNode2 = finalNodes.find((n) => n.id === '2');
    expect(updatedNode2?.data.generatedImage).toBeDefined();
    expect(updatedNode2?.data.isComplete).toBe(true);
  });

  it('refuses to run with no brand instead of generating under a placeholder', async () => {
    // A brand switch used to leave the store brand-less, and the run then sent a
    // literal 'default-brand' the Backend could only answer with a 403.
    useStudioStore.setState({ brandId: undefined });
    useStudioStore.getState().setNodes([
      {
        id: '1',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'test' },
        type: 'nanoGen',
      },
    ]);

    const executeGeneration = mock(async () => ({
      success: true,
      output: { type: 'image', base64: 'base64data', mimeType: 'image/png' },
    }));

    await executeWorkflow(buildControls(executeGeneration) as any);

    expect(executeGeneration).not.toHaveBeenCalled();
    const node = useStudioStore.getState().nodes.find((n) => n.id === '1');
    expect(node?.data.error).toContain('No brand selected');
  });

  it('passes the store brand to generation when the caller names none', async () => {
    useStudioStore.setState({ brandId: 'brand-from-store' });
    useStudioStore.getState().setNodes([
      {
        id: '1',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'test' },
        type: 'nanoGen',
      },
    ]);

    const executeGeneration = mock(async () => ({
      success: true,
      output: { type: 'image', base64: 'base64data', mimeType: 'image/png' },
    }));

    await executeWorkflow(buildControls(executeGeneration) as any);

    expect(executeGeneration.mock.calls[0][1]).toEqual(
      expect.objectContaining({ brand_id: 'brand-from-store' }),
    );
  });

  it('should handle execution failure', async () => {
    const nodes: StudioNode[] = [
      {
        id: '1',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'test' },
        type: 'nanoGen',
      },
    ];

    useStudioStore.getState().setNodes(nodes);

    const executeGeneration = mock(async (nodeId, payload) => {
      return {
        success: false,
        error: 'API Error',
      };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any);

    const finalNodes = useStudioStore.getState().nodes;
    const updatedNode = finalNodes.find((n) => n.id === '1');
    expect(updatedNode?.data.error).toBe('API Error');
    expect(updatedNode?.data.isComplete).toBe(false);
  });

  it('blocks an empty connected reference before clearing output or starting generation', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'upload-image',
        position: { x: 0, y: 0 },
        data: { image: undefined },
        type: 'image',
      },
      {
        id: 'generate-image',
        position: { x: 200, y: 0 },
        selected: true,
        data: {
          model: 'nano-banana',
          positivePrompt: 'Use the reference image',
          generatedImage: 'data:image/png;base64,keep_existing_output',
          isComplete: true,
        },
        type: 'nanoGen',
      },
    ];
    const edges: Edge[] = [
      {
        id: 'reference-edge',
        source: 'upload-image',
        sourceHandle: 'image',
        target: 'generate-image',
        targetHandle: 'ref-image',
      },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => ({
      success: true,
      output: { type: 'image', base64: 'new-output', mimeType: 'image/png' },
    }));
    const show = mock();
    const controls = { ...buildControls(executeGeneration), show };

    await executeWorkflow(controls as any, { forceRegenerateAll: true });

    expect(executeGeneration).toHaveBeenCalledTimes(0);
    expect(show).toHaveBeenCalledWith({
      title: 'Reference image required',
      description: 'Add a reference image to run this flow.',
      variant: 'error',
    });
    const finalNodes = useStudioStore.getState().nodes;
    expect(finalNodes.find((node) => node.id === 'upload-image')?.selected).toBe(true);
    expect(finalNodes.find((node) => node.id === 'generate-image')?.selected).toBe(false);
    expect(finalNodes.find((node) => node.id === 'generate-image')?.data.generatedImage).toBe(
      'data:image/png;base64,keep_existing_output',
    );
    expect(rehydrateWorkflowMediaNodes).toHaveBeenCalledTimes(0);
  });

  it('rejects blank or malformed durable reference metadata before hydration', async () => {
    const invalidReferences = [
      { sourcePath: '   ', sourceUrl: '\t' },
      { sourceUrl: 'not-a-valid-http-url' },
    ];

    for (const [index, referenceData] of invalidReferences.entries()) {
      useStudioStore.getState().setNodes([
        {
          id: `upload-image-${index}`,
          position: { x: 0, y: 0 },
          data: referenceData,
          type: 'image',
        },
        {
          id: `generate-image-${index}`,
          position: { x: 200, y: 0 },
          data: { model: 'nano-banana', positivePrompt: 'Use the reference image' },
          type: 'nanoGen',
        },
      ]);
      useStudioStore.getState().setEdges([
        {
          id: `reference-edge-${index}`,
          source: `upload-image-${index}`,
          sourceHandle: 'image',
          target: `generate-image-${index}`,
          targetHandle: 'ref-image',
        },
      ]);
      const executeGeneration = mock(async () => ({
        success: true,
        output: { type: 'image', base64: 'unexpected', mimeType: 'image/png' },
      }));
      const show = mock();

      await executeWorkflow({ ...buildControls(executeGeneration), show } as any);

      expect(executeGeneration).toHaveBeenCalledTimes(0);
      expect(show).toHaveBeenCalledWith({
        title: 'Reference image required',
        description: 'Add a reference image to run this flow.',
        variant: 'error',
      });
      expect(
        useStudioStore.getState().nodes.find((node) => node.id === `upload-image-${index}`)
          ?.selected,
      ).toBe(true);
    }

    expect(rehydrateWorkflowMediaNodes).toHaveBeenCalledTimes(0);
  });

  it('keeps a valid generation visibly running until its request settles', async () => {
    useStudioStore.getState().setNodes([
      {
        id: 'generate-image',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'Generate a launch image' },
        type: 'nanoGen',
      },
    ]);

    let resolveGeneration: ((result: unknown) => void) | undefined;
    const request = new Promise((resolve) => {
      resolveGeneration = resolve;
    });
    const executeGeneration = mock(
      (_nodeId: string, _payload: unknown, onOutputAvailable: (output: unknown) => void) => {
        onOutputAvailable({ type: 'image', base64: 'preview', mimeType: 'image/png' });
        return request;
      },
    );
    const execution = executeWorkflow(buildControls(executeGeneration) as any);

    while (executeGeneration.mock.calls.length === 0) {
      await Promise.resolve();
    }
    expect(
      useStudioStore.getState().nodes.find((node) => node.id === 'generate-image')?.data
        .isExecuting,
    ).toBe(true);
    expect(
      useStudioStore.getState().nodes.find((node) => node.id === 'generate-image')?.data
        .generatedImage,
    ).toBe('data:image/png;base64,preview');
    expect(
      useStudioStore.getState().nodes.find((node) => node.id === 'generate-image')?.data.isComplete,
    ).toBe(false);

    resolveGeneration?.({
      success: true,
      output: { type: 'image', base64: 'finished', mimeType: 'image/png' },
    });
    await execution;

    expect(
      useStudioStore.getState().nodes.find((node) => node.id === 'generate-image')?.data
        .isExecuting,
    ).toBe(false);
  });

  it('should handle dependencies', async () => {
    const nodes: StudioNode[] = [
      { id: '1', position: { x: 0, y: 0 }, data: { value: 'prompt' }, type: 'string' },
      { id: '2', position: { x: 0, y: 0 }, data: { model: 'nano-banana' }, type: 'nanoGen' },
      {
        id: '3',
        position: { x: 0, y: 0 },
        data: { model: 'veo-3.1', prompt: 'video prompt' },
        type: 'veoDirector',
      },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: '1', target: '2', targetHandle: 'prompt' },
      { id: 'e2', source: '2', target: '3', sourceHandle: 'image', targetHandle: 'ref-images' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (nodeId, payload) => {
      if (nodeId === '2') {
        return {
          success: true,
          output: { type: 'image', base64: 'img_data', mimeType: 'image/png' },
        };
      }
      if (nodeId === '3') {
        return { success: true, output: { type: 'video', url: 'video_url' } };
      }
      return { success: false, error: 'Unknown node' };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(executeGeneration).toHaveBeenCalledWith('2', expect.anything(), expect.any(Function));

    expect(executeGeneration).toHaveBeenCalledWith('3', expect.anything(), expect.any(Function));

    expect(executeGeneration).toHaveBeenCalledTimes(2);
    // Ensure order: 2 then 3
    expect(executeGeneration.mock.calls[0][0]).toBe('2');
    expect(executeGeneration.mock.calls[1][0]).toBe('3');

    const finalNodes = useStudioStore.getState().nodes;
    const veoNode = finalNodes.find((n) => n.id === '3');
    expect(veoNode?.data.generatedVideo).toBe('video_url');
  });

  it('keeps a failed-upload base64 preview usable for generation in the current session', async () => {
    const dataUrl = 'data:image/png;base64,ref_base64';
    const nodes: StudioNode[] = [
      {
        id: 'img',
        position: { x: 0, y: 0 },
        data: {
          image: dataUrl,
          referenceStatus: 'error',
          referenceError: 'Upload failed',
        },
        type: 'image',
      },
      { id: 'txt', position: { x: 0, y: 0 }, data: { value: 'prompt' }, type: 'string' },
      { id: 'nano', position: { x: 0, y: 0 }, data: { model: 'nano-banana' }, type: 'nanoGen' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'txt', target: 'nano', targetHandle: 'prompt' },
      { id: 'e2', source: 'img', sourceHandle: 'image', target: 'nano', targetHandle: 'ref-image' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (_nodeId, payload) => {
      return {
        success: true,
        output: { type: 'image', base64: 'out', mimeType: 'image/png' },
      };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any);

    const payload = executeGeneration.mock.calls[0][1];
    expect(payload.reference_images?.length).toBe(1);
    expect(payload.reference_images?.[0]).toEqual(
      expect.objectContaining({
        data: 'ref_base64',
        mime_type: 'image/png',
      }),
    );
  });

  it('should block when connected optional input is missing', async () => {
    const nodes: StudioNode[] = [
      { id: 'img', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      {
        id: 'nano',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'prompt' },
        type: 'nanoGen',
      },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'img', sourceHandle: 'image', target: 'nano', targetHandle: 'ref-image' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => {
      return {
        success: true,
        output: { type: 'image', base64: 'out', mimeType: 'image/png' },
      };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any);

    const finalNodes = useStudioStore.getState().nodes;
    const node = finalNodes.find((n) => n.id === 'nano');
    expect(node?.data.error).toBe('Missing connected input for ref-image');
  });

  it('should respect concurrency limit', async () => {
    const nodes: StudioNode[] = Array.from({ length: 5 }, (_, index) => ({
      id: `nano-${index}`,
      position: { x: 0, y: 0 },
      data: { model: 'nano-banana', positivePrompt: `prompt ${index}` },
      type: 'nanoGen',
    }));

    useStudioStore.getState().setNodes(nodes);

    let running = 0;
    let maxRunning = 0;

    const executeGeneration = mock(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return { success: true, output: { type: 'image', base64: 'out', mimeType: 'image/png' } };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any);

    expect(maxRunning).toBe(3);
  });

  it('should scope execution to a target node', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'nano-1',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'one' },
        type: 'nanoGen',
      },
      {
        id: 'nano-2',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'two' },
        type: 'nanoGen',
      },
    ];

    useStudioStore.getState().setNodes(nodes);

    const executeGeneration = mock(async (nodeId) => {
      return {
        success: true,
        output: { type: 'image', base64: `out-${nodeId}`, mimeType: 'image/png' },
      };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any, { targetNodeId: 'nano-2' });

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeGeneration.mock.calls[0][0]).toBe('nano-2');
  });

  it('should run only the targeted media node and reuse upstream values', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'prompt-1',
        position: { x: 0, y: 0 },
        data: { value: 'keep this prompt' },
        type: 'string',
      },
      {
        id: 'img-a',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana',
          generatedImage: 'data:image/png;base64,img_a_base64',
          isComplete: true,
        },
        type: 'nanoGen',
      },
      {
        id: 'video-1',
        position: { x: 0, y: 0 },
        data: { model: 'veo-3.1', prompt: '' },
        type: 'veoDirector',
      },
    ];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'prompt-1',
        sourceHandle: 'text',
        target: 'video-1',
        targetHandle: 'prompt-in',
      },
      {
        id: 'e2',
        source: 'img-a',
        sourceHandle: 'image',
        target: 'video-1',
        targetHandle: 'ref-images',
      },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (nodeId: string) => {
      if (nodeId === 'video-1') {
        return { success: true, output: { type: 'video', url: 'video_url' } };
      }
      return { success: false, error: `Unexpected node ${nodeId}` };
    });

    const executeEnrichment = mock(async () => ({ success: true }));

    const controls = buildControls(
      executeGeneration,
      mock(async () => ({ success: true, output: { type: 'video', url: 'video_url' } })),
      executeEnrichment,
    );

    await executeWorkflow(controls as any, { targetNodeId: 'video-1', clearDownstream: false });

    expect(executeEnrichment).toHaveBeenCalledTimes(0);
    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeGeneration.mock.calls[0][0]).toBe('video-1');

    const payload = executeGeneration.mock.calls[0][1];
    expect(payload.prompt).toBe('keep this prompt');
    expect(payload.reference_images).toHaveLength(1);
    expect(payload.reference_images?.[0]).toEqual(
      expect.objectContaining({ data: 'img_a_base64' }),
    );

    const finalNodes = useStudioStore.getState().nodes;
    const promptNode = finalNodes.find((node) => node.id === 'prompt-1');
    const videoNode = finalNodes.find((node) => node.id === 'video-1');
    expect(promptNode?.data.value).toBe('keep this prompt');
    expect(videoNode?.data.generatedVideo).toBe('video_url');
  });

  it('runs the upstream closure when a node is targeted and an upstream generator is not yet complete', async () => {
    // Chained generators: img-a -> (ref-image) -> img-b, with img-a NOT yet
    // generated. Targeting img-b (node "Run") must execute img-a first, then img-b
    // — previously only img-b ran, so it failed with a missing reference input.
    const nodes: StudioNode[] = [
      { id: 'prompt-1', position: { x: 0, y: 0 }, data: { value: 'a cat' }, type: 'string' },
      {
        id: 'img-a',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'first image' },
        type: 'nanoGen',
      },
      { id: 'img-b', position: { x: 0, y: 0 }, data: { model: 'nano-banana' }, type: 'nanoGen' },
    ];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'prompt-1',
        sourceHandle: 'text',
        target: 'img-b',
        targetHandle: 'prompt',
      },
      {
        id: 'e2',
        source: 'img-a',
        sourceHandle: 'image',
        target: 'img-b',
        targetHandle: 'ref-image',
      },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (nodeId: string) => ({
      success: true,
      output: { type: 'image', base64: `out-${nodeId}`, mimeType: 'image/png' },
    }));

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any, { targetNodeId: 'img-b', clearDownstream: false });

    expect(executeGeneration).toHaveBeenCalledTimes(2);
    // img-a (the upstream dependency) runs before the target img-b.
    expect(executeGeneration.mock.calls[0][0]).toBe('img-a');
    expect(executeGeneration.mock.calls[1][0]).toBe('img-b');

    const targetPayload = executeGeneration.mock.calls[1][1];
    expect(targetPayload.prompt).toBe('a cat');
    expect(targetPayload.reference_images?.[0]?.data).toBe('out-img-a');
  });

  it('reuses a completed upstream generator instead of re-running it when targeting a node', async () => {
    // img-a is already generated; targeting img-b must reuse img-a's output and run
    // only img-b.
    const nodes: StudioNode[] = [
      {
        id: 'img-a',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana',
          generatedImage: 'data:image/png;base64,existing_a',
          isComplete: true,
        },
        type: 'nanoGen',
      },
      {
        id: 'img-b',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'second' },
        type: 'nanoGen',
      },
    ];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'img-a',
        sourceHandle: 'image',
        target: 'img-b',
        targetHandle: 'ref-image',
      },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (nodeId: string) => ({
      success: true,
      output: { type: 'image', base64: `out-${nodeId}`, mimeType: 'image/png' },
    }));

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any, { targetNodeId: 'img-b', clearDownstream: false });

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeGeneration.mock.calls[0][0]).toBe('img-b');
    expect(executeGeneration.mock.calls[0][1].reference_images?.[0]?.data).toBe('existing_a');

    // img-a is reused, not reset.
    const imgA = useStudioStore.getState().nodes.find((node) => node.id === 'img-a');
    expect(imgA?.data.generatedImage).toBe('data:image/png;base64,existing_a');
    expect(imgA?.data.isComplete).toBe(true);
  });

  it('should keep string node content untouched during workflow runs', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'string-1',
        position: { x: 0, y: 0 },
        data: { value: 'persistent prompt' },
        type: 'string',
      },
      { id: 'nano-1', position: { x: 0, y: 0 }, data: { model: 'nano-banana' }, type: 'nanoGen' },
    ];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'string-1',
        sourceHandle: 'text',
        target: 'nano-1',
        targetHandle: 'prompt',
      },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => {
      return {
        success: true,
        output: { type: 'image', base64: 'out', mimeType: 'image/png' },
      };
    });
    const executeEnrichment = mock(async () => ({ success: true }));
    const controls = buildControls(
      executeGeneration,
      mock(async () => ({ success: true, output: { type: 'video', url: 'video_url' } })),
      executeEnrichment,
    );

    await executeWorkflow(controls as any);

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeEnrichment).toHaveBeenCalledTimes(0);
    const finalNodes = useStudioStore.getState().nodes;
    const stringNode = finalNodes.find((node) => node.id === 'string-1');
    expect(stringNode?.data.value).toBe('persistent prompt');
  });

  it('should execute targeted media nodes when upstream string node has inputs but already has text', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'image-input',
        position: { x: 0, y: 0 },
        data: { image: 'data:image/png;base64,ref_input' },
        type: 'image',
      },
      {
        id: 'string-1',
        position: { x: 0, y: 0 },
        data: { value: 'locked prompt text' },
        type: 'string',
      },
      {
        id: 'video-1',
        position: { x: 0, y: 0 },
        data: { model: 'veo-3.1', prompt: '' },
        type: 'veoDirector',
      },
    ];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'image-input',
        sourceHandle: 'image',
        target: 'string-1',
        targetHandle: 'image',
      },
      {
        id: 'e2',
        source: 'string-1',
        sourceHandle: 'text',
        target: 'video-1',
        targetHandle: 'prompt-in',
      },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (_nodeId, payload) => ({
      success: true,
      output: { type: 'video', url: 'video_url' },
      payload,
    }));
    const executeEnrichment = mock(async () => ({
      success: true,
      output: { type: 'text', value: 'enriched' },
    }));
    const controls = buildControls(
      executeGeneration,
      mock(async () => ({ success: true })),
      executeEnrichment,
    );

    await executeWorkflow(controls as any, { targetNodeId: 'video-1', clearDownstream: false });

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeEnrichment).toHaveBeenCalledTimes(0);
    expect(executeGeneration.mock.calls[0][1].prompt).toBe('locked prompt text');
  });

  it('should execute extend video nodes with base64 input', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'vid-1',
        position: { x: 0, y: 0 },
        data: { video: 'data:video/mp4;base64,base64_video' },
        type: 'video',
      },
      { id: 'extend-1', position: { x: 0, y: 0 }, data: {}, type: 'extendVideo' },
    ];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'vid-1',
        sourceHandle: 'video',
        target: 'extend-1',
        targetHandle: 'video',
      },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => {
      return { success: true, output: { type: 'image', base64: 'out', mimeType: 'image/png' } };
    });

    const executeVideoExtension = mock(async (_nodeId, payload) => {
      return {
        success: true,
        output: { type: 'video', url: 'data:video/mp4;base64,extended_video' },
      };
    });

    const controls = buildControls(executeGeneration, executeVideoExtension);

    await executeWorkflow(controls as any);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(executeVideoExtension).toHaveBeenCalledTimes(1);
    const payload = executeVideoExtension.mock.calls[0][1];
    expect(payload.video?.data).toBe('base64_video');

    const finalNodes = useStudioStore.getState().nodes;
    const updatedNode = finalNodes.find((n) => n.id === 'extend-1');
    expect(updatedNode?.data.generatedVideo).toBe('data:video/mp4;base64,extended_video');
  });

  it('should execute extend video nodes from upstream veo base64 output', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'veo-1',
        position: { x: 0, y: 0 },
        type: 'veoDirector',
        data: {
          model: 'veo-3.1',
          generatedVideo: 'data:video/mp4;base64,veo_output_base64',
        },
      },
      { id: 'extend-1', position: { x: 0, y: 0 }, data: {}, type: 'extendVideo' },
    ];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'veo-1',
        sourceHandle: 'video',
        target: 'extend-1',
        targetHandle: 'video',
      },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => ({
      success: true,
      output: { type: 'video', url: 'unused' },
    }));
    const executeVideoExtension = mock(async () => ({
      success: true,
      output: { type: 'video', url: 'data:video/mp4;base64,extended_from_veo' },
    }));
    const controls = buildControls(executeGeneration, executeVideoExtension);

    await executeWorkflow(controls as any, { targetNodeId: 'extend-1', clearDownstream: false });

    expect(executeVideoExtension).toHaveBeenCalledTimes(1);
    const payload = executeVideoExtension.mock.calls[0][1];
    expect(payload.video?.data).toBe('veo_output_base64');
  });

  it('should execute extend video nodes from upstream veo url output', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'veo-1',
        position: { x: 0, y: 0 },
        type: 'veoDirector',
        data: {
          model: 'veo-3.1',
          generatedVideo: 'https://cdn.continuum.test/videos/veo-output.mp4',
        },
      },
      { id: 'extend-1', position: { x: 0, y: 0 }, data: {}, type: 'extendVideo' },
    ];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'veo-1',
        sourceHandle: 'video',
        target: 'extend-1',
        targetHandle: 'video',
      },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => ({
      success: true,
      output: { type: 'video', url: 'unused' },
    }));
    const executeVideoExtension = mock(async () => ({
      success: true,
      output: { type: 'video', url: 'data:video/mp4;base64,extended_from_veo_uri' },
    }));
    const controls = buildControls(executeGeneration, executeVideoExtension);

    await executeWorkflow(controls as any, { targetNodeId: 'extend-1', clearDownstream: false });

    expect(executeVideoExtension).toHaveBeenCalledTimes(1);
    const payload = executeVideoExtension.mock.calls[0][1];
    expect(payload.video?.uri).toBe('https://cdn.continuum.test/videos/veo-output.mp4');
  });

  it('routes text-box enrichment through executeEnrichment with the inherited grounding data piece', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const nodes: StudioNode[] = [
      { id: 'text-1', position: { x: 0, y: 0 }, data: { value: 'draft prompt' }, type: 'string' },
      {
        id: 'nano-1',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana',
          positivePrompt: '',
          skillIds: ['skill-x'],
          brandBookPieces: ['voice'],
        },
        type: 'nanoGen',
      },
    ];
    const edges = [{ id: 'e1', source: 'text-1', target: 'nano-1', targetHandle: 'prompt' }];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges as any);

    const executeGeneration = mock(async () => ({ success: true }));
    const executeEnrichment = mock(async () => ({
      success: true,
      output: { type: 'text', value: 'enriched' },
    }));
    const controls = buildControls(executeGeneration, undefined, executeEnrichment);

    await executeWorkflow(controls as any, { targetNodeId: 'text-1', clearDownstream: false });

    // No direct edge-function fetch — enrichment now flows through the Backend service.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(executeEnrichment).toHaveBeenCalledTimes(1);
    const payload = executeEnrichment.mock.calls[0][1] as {
      skillIds?: string[];
      brandBookPieces?: string[];
    };
    expect(payload.skillIds).toEqual(['skill-x']);
    expect(payload.brandBookPieces).toEqual(['voice']);
  });

  // Bug #228: literal mode short-circuited buildEnrichPayload to null, and the
  // executor reported that null as SUCCESS — the button "reloaded" and nothing
  // ever happened, on every Composer-authored prompt.
  it('enriches a literal prompt node when the run is scoped to that node', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'text-1',
        position: { x: 0, y: 0 },
        data: { value: 'composer-authored prompt', promptMode: 'literal' },
        type: 'string',
      },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges([]);

    const executeEnrichment = mock(async () => ({
      success: true,
      output: { type: 'text', value: 'enriched' },
    }));
    const controls = buildControls(
      mock(async () => ({ success: true })),
      undefined,
      executeEnrichment,
    );

    await executeWorkflow(controls as any, { targetNodeId: 'text-1', clearDownstream: false });

    expect(executeEnrichment).toHaveBeenCalledTimes(1);
    expect(useStudioStore.getState().nodes.find((n) => n.id === 'text-1')?.data.value).toBe(
      'enriched',
    );
  });

  it('leaves a literal prompt node alone on a whole-graph run', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'text-1',
        position: { x: 0, y: 0 },
        data: { value: 'composer-authored prompt', promptMode: 'literal' },
        type: 'string',
      },
      {
        id: 'nano-1',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: '' },
        type: 'nanoGen',
      },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore
      .getState()
      .setEdges([{ id: 'e1', source: 'text-1', target: 'nano-1', targetHandle: 'prompt' }] as any);

    const executeEnrichment = mock(async () => ({
      success: true,
      output: { type: 'text', value: 'enriched' },
    }));
    const controls = buildControls(
      mock(async () => ({
        success: true,
        output: { type: 'image', base64: 'x', mimeType: 'image/png' },
      })),
      undefined,
      executeEnrichment,
    );

    await executeWorkflow(controls as any, {});

    expect(executeEnrichment).toHaveBeenCalledTimes(0);
    expect(useStudioStore.getState().nodes.find((n) => n.id === 'text-1')?.data.value).toBe(
      'composer-authored prompt',
    );
  });

  it('reports a failure when enrichment returns no text instead of silently completing', async () => {
    const nodes: StudioNode[] = [
      { id: 'text-1', position: { x: 0, y: 0 }, data: { value: 'draft prompt' }, type: 'string' },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges([]);

    // A control that resolves without a result at all: the old code fell out of
    // the `string` branch entirely, leaving the node spinning with no error.
    const executeEnrichment = mock(async () => undefined);
    const controls = buildControls(
      mock(async () => ({ success: true })),
      undefined,
      executeEnrichment,
    );

    await executeWorkflow(controls as any, { targetNodeId: 'text-1', clearDownstream: false });

    const updated = useStudioStore.getState().nodes.find((n) => n.id === 'text-1');
    expect(updated?.data.error).toBe('Enrichment returned no text');
    expect(updated?.data.isComplete).toBe(false);
    expect(updated?.data.isExecuting).toBe(false);
  });

  // Bug #222 (Run) / #221: the composer landing a generator with no prompt made
  // Run look dead. It is not dead — preflight blocks it — but it must SAY so.
  it('surfaces a preflight issue on a promptless generator instead of running it', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'nano-1',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: '' },
        type: 'nanoGen',
      },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges([]);

    const executeGeneration = mock(async () => ({ success: true }));
    const show = mock(() => {});
    const controls = { ...buildControls(executeGeneration), show };

    await executeWorkflow(controls as any, {});

    expect(executeGeneration).toHaveBeenCalledTimes(0);
    expect(show).toHaveBeenCalled();
    const blocked = useStudioStore.getState().nodes.find((n) => n.id === 'nano-1');
    expect(blocked?.data.error).toBe('Missing required prompt');
    expect(blocked?.selected).toBe(true);
  });

  it('should fail string node when enrichment returns an error', async () => {
    const nodes: StudioNode[] = [
      { id: 'text-1', position: { x: 0, y: 0 }, data: { value: 'draft prompt' }, type: 'string' },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges([]);

    const executeGeneration = mock(async () => ({ success: true }));
    const executeEnrichment = mock(async () => ({
      success: false,
      error: 'Gemini upstream failed',
    }));
    const controls = buildControls(executeGeneration, undefined, executeEnrichment);

    await executeWorkflow(controls as any, { targetNodeId: 'text-1', clearDownstream: false });

    const finalNodes = useStudioStore.getState().nodes;
    const updatedNode = finalNodes.find((n) => n.id === 'text-1');
    expect(updatedNode?.data.error).toBe('Gemini upstream failed');
    expect(updatedNode?.data.isComplete).toBe(false);
    expect(updatedNode?.data.isExecuting).toBe(false);
  });

  it('should composite image with markup layer before using as reference', async () => {
    // Mock the compositeImages function
    const compositeMock = mock(async () => ({
      base64: 'composited_base64',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,composited_base64',
    }));

    mock.module('./compositeImages', () => ({
      compositeImages: compositeMock,
    }));

    const nodes: StudioNode[] = [
      {
        id: 'img-markup',
        position: { x: 0, y: 0 },
        data: {
          image: 'data:image/png;base64,original_image',
          originalImage: 'data:image/png;base64,original_image',
          markupLayer: 'data:image/png;base64,markup_layer',
          hasMarkup: true,
        },
        type: 'image',
      },
      {
        id: 'nano',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'edit this' },
        type: 'nanoGen',
      },
    ];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'img-markup',
        sourceHandle: 'image',
        target: 'nano',
        targetHandle: 'ref-image',
      },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (_nodeId, payload) => {
      return {
        success: true,
        output: { type: 'image', base64: 'out', mimeType: 'image/png' },
        payload,
      };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any);

    // Wait for any async compositing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify compositeImages was called with the original image and markup layer
    expect(compositeMock).toHaveBeenCalledTimes(1);
    expect(compositeMock).toHaveBeenCalledWith(
      'data:image/png;base64,original_image',
      'data:image/png;base64,markup_layer',
    );

    // Verify the payload received the composited image
    expect(executeGeneration).toHaveBeenCalledTimes(1);
    const payload = executeGeneration.mock.calls[0][1];
    expect(payload.reference_images?.[0]?.data).toBe('composited_base64');
  });

  it('should use original image when no markup layer is present', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'img-no-markup',
        position: { x: 0, y: 0 },
        data: {
          image: 'data:image/png;base64,original_only',
        },
        type: 'image',
      },
      {
        id: 'nano',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'use this' },
        type: 'nanoGen',
      },
    ];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'img-no-markup',
        sourceHandle: 'image',
        target: 'nano',
        targetHandle: 'ref-image',
      },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (_nodeId, payload) => {
      return {
        success: true,
        output: { type: 'image', base64: 'out', mimeType: 'image/png' },
        payload,
      };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any);

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    const payload = executeGeneration.mock.calls[0][1];
    expect(payload.reference_images?.[0]?.data).toBe('original_only');
  });

  it('passes a remote-url image reference through as image_url (backend resolves to bytes)', async () => {
    const remoteUrl = 'https://x.supabase.co/storage/v1/object/sign/media-library/a.jpg?token=t';
    const nodes: StudioNode[] = [
      {
        id: 'img',
        position: { x: 0, y: 0 },
        data: {
          image: remoteUrl,
          sourceUrl: remoteUrl,
          sourcePath: 'brand/a.jpg',
          bucket: 'media-library',
        },
        type: 'image',
      },
      {
        id: 'nano',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'use this' },
        type: 'nanoGen',
      },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'img', sourceHandle: 'image', target: 'nano', targetHandle: 'ref-image' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (_nodeId, payload) => ({
      success: true,
      output: { type: 'image', base64: 'out', mimeType: 'image/png' },
      payload,
    }));

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any);

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    const payload = executeGeneration.mock.calls[0][1];
    expect(payload.reference_images?.[0]?.image_url).toBe(remoteUrl);
    expect(payload.reference_images?.[0]?.data).toBeUndefined();
  });

  it('falls back to sourceUrl for a saved Continuum reference whose inline base64 was stripped', async () => {
    // A saved canvas strips the inline base64 from `image`; only the durable signed
    // URL in `sourceUrl` survives. With no storage coords to re-sign, hydration is a
    // no-op, but the reference must still be passed to the Backend (not dropped).
    const signedUrl =
      'https://x.supabase.co/storage/v1/object/sign/media-library/c.jpg?token=fresh';
    const nodes: StudioNode[] = [
      { id: 'img', position: { x: 0, y: 0 }, data: { sourceUrl: signedUrl }, type: 'image' },
      {
        id: 'nano',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'use this' },
        type: 'nanoGen',
      },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'img', sourceHandle: 'image', target: 'nano', targetHandle: 'ref-image' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (_nodeId, payload) => ({
      success: true,
      output: { type: 'image', base64: 'out', mimeType: 'image/png' },
      payload,
    }));
    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any, { targetNodeId: 'nano', clearDownstream: false });

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    const payload = executeGeneration.mock.calls[0][1];
    expect(payload.reference_images?.length).toBe(1);
    expect(payload.reference_images?.[0]?.image_url).toBe(signedUrl);
  });

  it('hydrates a saved sidebar/Library reference (base64 stripped, coords kept) before a single-node generate', async () => {
    // A Library creative dropped onto a reference node carries inline base64 +
    // sourcePath/bucket/sourceUrl. After the canvas saves, the inline base64 is
    // stripped and the signed URL expires (1h). A single-node generate must re-sign/
    // inline fresh bytes at the chokepoint so the Backend gets base64 — not a dropped
    // or expired reference. This is the post-save shape of the sidebar-drop path.
    const freshBase64 = 'data:image/png;base64,FRESH_LIBRARY_BYTES';
    const hydrateDurableReference = mock(async (input: StudioNode[]) =>
      input.map((node) =>
        node.type === 'image'
          ? {
              ...node,
              data: { ...node.data, image: freshBase64, sourceUrl: 'https://x/fresh.jpg' },
            }
          : node,
      ),
    );
    mock.module('./rehydrateWorkflowMedia', () => ({
      rehydrateWorkflowMediaNodes: hydrateDurableReference,
    }));

    const nodes: StudioNode[] = [
      {
        id: 'img',
        position: { x: 0, y: 0 },
        // Inline base64 stripped on save; durable coords retained but URL expired.
        data: {
          sourcePath: 'brand/d.jpg',
          bucket: 'media-library',
          sourceUrl: 'https://stale/d.jpg?token=expired',
        },
        type: 'image',
      },
      {
        id: 'nano',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'use this' },
        type: 'nanoGen',
      },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'img', sourceHandle: 'image', target: 'nano', targetHandle: 'ref-image' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (_nodeId, payload) => ({
      success: true,
      output: { type: 'image', base64: 'out', mimeType: 'image/png' },
      payload,
    }));
    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any, { targetNodeId: 'nano', clearDownstream: false });

    expect(hydrateDurableReference).toHaveBeenCalledTimes(1);
    expect(executeGeneration).toHaveBeenCalledTimes(1);
    const payload = executeGeneration.mock.calls[0][1];
    expect(payload.reference_images?.[0]?.data).toBe('FRESH_LIBRARY_BYTES');

    const imgNode = useStudioStore.getState().nodes.find((node) => node.id === 'img');
    expect((imgNode?.data as any).image).toBe(freshBase64);
  });

  it('parks the run at an uncommitted Video Editor break-point without failing downstream', async () => {
    // vid -> (media) -> timelineEditor -> (video) -> extendVideo. The editor is a
    // manual gate: with no committed render, the run must HALT at it — the editor
    // is "awaiting", and the downstream extend never runs and is not marked failed.
    const nodes: StudioNode[] = [
      {
        id: 'vid',
        position: { x: 0, y: 0 },
        data: { video: 'data:video/mp4;base64,vvv' },
        type: 'video',
      },
      {
        id: 'edit',
        position: { x: 0, y: 0 },
        data: { items: [{ id: 'i1', order: 0, sourceNodeId: 'vid' }] },
        type: 'timelineEditor',
      },
      { id: 'ext', position: { x: 0, y: 0 }, data: {}, type: 'extendVideo' },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'vid', sourceHandle: 'video', target: 'edit', targetHandle: 'media-in' },
      { id: 'e2', source: 'edit', sourceHandle: 'video', target: 'ext', targetHandle: 'video' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => ({
      success: true,
      output: { type: 'image', base64: 'x', mimeType: 'image/png' },
    }));
    const executeVideoExtension = mock(async () => ({
      success: true,
      output: { type: 'video', url: 'should_not_run' },
    }));
    const controls = buildControls(executeGeneration, executeVideoExtension);

    await executeWorkflow(controls as any);

    expect(executeVideoExtension).toHaveBeenCalledTimes(0);
    const finalNodes = useStudioStore.getState().nodes;
    const editNode = finalNodes.find((n) => n.id === 'edit');
    const extNode = finalNodes.find((n) => n.id === 'ext');
    expect((editNode?.data as any).awaitingInput).toBe(true);
    expect(editNode?.data.error).toBeUndefined();
    expect(extNode?.data.error).toBeUndefined();
    expect(extNode?.data.isComplete).toBeFalsy();
  });

  it('resumes downstream once the Video Editor clip is committed', async () => {
    // Same graph, but the editor has a committed render (isComplete set at render
    // time). Its persisted clip is reused as-is — surfaced to the downstream
    // extend node without re-rendering the editor — and the extend node runs.
    const editedUrl = 'https://cdn.continuum.test/videos/edited.mp4';
    const nodes: StudioNode[] = [
      {
        id: 'vid',
        position: { x: 0, y: 0 },
        data: { video: 'data:video/mp4;base64,vvv' },
        type: 'video',
      },
      {
        id: 'edit',
        position: { x: 0, y: 0 },
        data: {
          items: [{ id: 'i1', order: 0, sourceNodeId: 'vid' }],
          committed: true,
          generatedVideoUrl: editedUrl,
          isComplete: true,
        },
        type: 'timelineEditor',
      },
      { id: 'ext', position: { x: 0, y: 0 }, data: {}, type: 'extendVideo' },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'vid', sourceHandle: 'video', target: 'edit', targetHandle: 'media-in' },
      { id: 'e2', source: 'edit', sourceHandle: 'video', target: 'ext', targetHandle: 'video' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => ({
      success: true,
      output: { type: 'image', base64: 'x', mimeType: 'image/png' },
    }));
    const executeVideoExtension = mock(async (_id: string, _payload: unknown) => ({
      success: true,
      output: { type: 'video', url: 'data:video/mp4;base64,extended' },
    }));
    const controls = buildControls(executeGeneration, executeVideoExtension);

    await executeWorkflow(controls as any);

    expect(executeVideoExtension).toHaveBeenCalledTimes(1);
    const payload = executeVideoExtension.mock.calls[0][1] as { video?: { uri?: string } };
    expect(payload.video?.uri).toBe(editedUrl);
    const editNode = useStudioStore.getState().nodes.find((n) => n.id === 'edit');
    expect(editNode?.data.isComplete).toBe(true);
  });

  describe('image variations', () => {
    const durableVariations = (count: number) => ({
      type: 'images' as const,
      items: Array.from({ length: count }, (_unused, index) => ({
        mimeType: 'image/png',
        url: `https://signed/v${index}.png`,
        storagePath: `brand-1/canvas/v${index}.png`,
        storageBucket: 'brand-profile-assets',
        assetId: `asset-${index}`,
      })),
    });

    const runGenerator = async (output: unknown) => {
      const nodes: StudioNode[] = [
        {
          id: 'gen',
          position: { x: 0, y: 0 },
          type: 'nanoGen',
          data: { model: 'nano-banana', positivePrompt: 'a cat', aspectRatio: '1:1' },
        },
      ];
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges([]);
      await executeWorkflow(buildControls(mock(async () => ({ success: true, output }))) as never);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return useStudioStore.getState().nodes.find((node) => node.id === 'gen')?.data as Record<
        string,
        unknown
      >;
    };

    it('persists every variation with its own durable coordinates', async () => {
      const data = await runGenerator(durableVariations(4));
      const variations = data.generatedImages as Array<Record<string, unknown>>;

      expect(variations).toHaveLength(4);
      expect(variations.map((variation) => variation.storagePath)).toEqual([
        'brand-1/canvas/v0.png',
        'brand-1/canvas/v1.png',
        'brand-1/canvas/v2.png',
        'brand-1/canvas/v3.png',
      ]);
      // URL-first: a variation must carry the signed URL and asset id, not just a
      // preview, or it silently drops out of re-signing and the asset ledger.
      expect(variations.map((variation) => variation.assetId)).toEqual([
        'asset-0',
        'asset-1',
        'asset-2',
        'asset-3',
      ]);
      expect(variations[2].preview).toBe('https://signed/v2.png');
      expect(data.isComplete).toBe(true);
    });

    it('mirrors the first variation onto the single-image fields', async () => {
      const data = await runGenerator(durableVariations(4));
      expect(data.generatedImage).toBe('https://signed/v0.png');
      expect(data.generatedImageUrl).toBe('https://signed/v0.png');
      expect(data.generatedImageStoragePath).toBe('brand-1/canvas/v0.png');
      expect(data.renderOutputAssetId).toBe('asset-0');
    });

    it('clears a previous 4-up when the next run produces a single image', async () => {
      const first = await runGenerator(durableVariations(4));
      expect(first.generatedImages).toHaveLength(4);

      const second = await runGenerator({
        type: 'image',
        mimeType: 'image/png',
        url: 'https://signed/solo.png',
        storagePath: 'brand-1/canvas/solo.png',
        storageBucket: 'brand-profile-assets',
        assetId: 'asset-solo',
      });
      expect(second.generatedImages).toBeUndefined();
      expect(second.generatedImage).toBe('https://signed/solo.png');
    });

    // Bug #258: a saved 4-up rehydrates as an `images` output, and readiness used
    // to resolve every variation handle to undefined — the downstream consumer
    // failed with "Missing connected input for ref-image" while the payload
    // builder had already been routing the handle correctly.
    const fourUpConsumerGraph = (
      sourceHandle: string,
      targetHandle: string,
      consumer: StudioNode,
    ) => ({
      nodes: [
        {
          id: 'four-up',
          position: { x: 0, y: 0 },
          type: 'nanoGen',
          data: {
            model: 'nano-banana',
            positivePrompt: 'four variations',
            variationCount: 4,
            generatedImage: 'https://signed/v0.png',
            generatedImageUrl: 'https://signed/v0.png',
            generatedImages: Array.from({ length: 4 }, (_unused, index) => ({
              id: `v${index}`,
              preview: `https://signed/v${index}.png`,
              url: `https://signed/v${index}.png`,
              storagePath: `brand-1/canvas/v${index}.png`,
              storageBucket: 'brand-profile-assets',
              assetId: `asset-${index}`,
            })),
          },
        },
        consumer,
      ] as StudioNode[],
      edges: [
        {
          id: 'e1',
          source: 'four-up',
          sourceHandle,
          target: consumer.id,
          targetHandle,
        },
      ] as Edge[],
    });

    it('feeds a chosen variation into a downstream generator instead of failing readiness', async () => {
      const { nodes, edges } = fourUpConsumerGraph('image-2', 'ref-image', {
        id: 'consumer',
        position: { x: 400, y: 0 },
        type: 'nanoGen',
        data: { model: 'nano-banana', positivePrompt: 'remix the reference' },
      } as StudioNode);
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges(edges);
      expect(useStudioStore.getState().edges).toHaveLength(1);

      const executeGeneration = mock(async () => ({
        success: true,
        output: { type: 'image', base64: 'remixed', mimeType: 'image/png' },
      }));
      await executeWorkflow(buildControls(executeGeneration) as never);

      // Only the consumer runs — the 4-up is reused — and it runs at all.
      expect(executeGeneration).toHaveBeenCalledTimes(1);
      expect(executeGeneration.mock.calls[0][0]).toBe('consumer');
      const payload = executeGeneration.mock.calls[0][1] as {
        reference_images?: Array<{ image_url?: string; storage_path?: string }>;
      };
      expect(payload.reference_images?.[0]?.image_url).toBe('https://signed/v2.png');
      expect(payload.reference_images?.[0]?.storage_path).toBe('brand-1/canvas/v2.png');
      const consumerNode = useStudioStore.getState().nodes.find((n) => n.id === 'consumer');
      expect(consumerNode?.data.error).toBeUndefined();
    });

    it('feeds a chosen variation into a video generator first-frame', async () => {
      const { nodes, edges } = fourUpConsumerGraph('image-3', 'first-frame', {
        id: 'video',
        position: { x: 400, y: 0 },
        type: 'veoFast',
        data: { model: 'veo-3.1-fast', prompt: 'animate the frame' },
      } as StudioNode);
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges(edges);
      expect(useStudioStore.getState().edges).toHaveLength(1);

      const executeGeneration = mock(async () => ({
        success: true,
        output: { type: 'video', url: 'https://signed/clip.mp4' },
      }));
      await executeWorkflow(buildControls(executeGeneration) as never);

      expect(executeGeneration).toHaveBeenCalledTimes(1);
      expect(executeGeneration.mock.calls[0][0]).toBe('video');
      const payload = executeGeneration.mock.calls[0][1] as {
        first_frame?: { image_url?: string };
      };
      expect(payload.first_frame?.image_url).toBe('https://signed/v3.png');
      const videoNode = useStudioStore.getState().nodes.find((n) => n.id === 'video');
      expect(videoNode?.data.error).toBeUndefined();
    });
  });

  describe('skip / regenerate by content', () => {
    const imgOutput = (nodeId: string) => ({
      success: true,
      output: { type: 'image', base64: `out-${nodeId}`, mimeType: 'image/png' },
    });

    it('reuses an upstream generator that has output but no isComplete (post-reload) instead of regenerating it', async () => {
      // The regression: a node loaded from persistence has its output present
      // (re-signed URL / kept inline) but isComplete stripped on save. Reuse must
      // key on the output, not the transient flag.
      const nodes: StudioNode[] = [
        {
          id: 'img-a',
          position: { x: 0, y: 0 },
          data: {
            model: 'nano-banana',
            positivePrompt: 'first',
            generatedImage: 'data:image/png;base64,existing_a',
          },
          type: 'nanoGen',
        },
        {
          id: 'img-b',
          position: { x: 0, y: 0 },
          data: { model: 'nano-banana', positivePrompt: 'second' },
          type: 'nanoGen',
        },
      ];
      const edges: Edge[] = [
        {
          id: 'e1',
          source: 'img-a',
          sourceHandle: 'image',
          target: 'img-b',
          targetHandle: 'ref-image',
        },
      ];
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges(edges);

      const executeGeneration = mock(async (nodeId: string) => imgOutput(nodeId));
      const controls = buildControls(executeGeneration);

      await executeWorkflow(controls as any, { targetNodeId: 'img-b', clearDownstream: false });

      expect(executeGeneration).toHaveBeenCalledTimes(1);
      expect(executeGeneration.mock.calls[0][0]).toBe('img-b');
      expect(executeGeneration.mock.calls[0][1].reference_images?.[0]?.data).toBe('existing_a');
      const imgA = useStudioStore.getState().nodes.find((n) => n.id === 'img-a');
      expect(imgA?.data.generatedImage).toBe('data:image/png;base64,existing_a');
    });

    it('reuses a durable URL stored in generatedImage after reload', async () => {
      const durableUrl = 'https://storage.example.com/generated.png?token=fresh';
      const nodes: StudioNode[] = [
        {
          id: 'img-a',
          position: { x: 0, y: 0 },
          data: {
            model: 'nano-banana',
            positivePrompt: 'first',
            generatedImage: durableUrl,
            generatedImageUrl: durableUrl,
            generatedImageBucket: 'brand-profile-assets',
            generatedImageStoragePath: 'brand/generated.png',
          },
          type: 'nanoGen',
        },
        {
          id: 'img-b',
          position: { x: 0, y: 0 },
          data: { model: 'nano-banana', positivePrompt: 'second' },
          type: 'nanoGen',
        },
      ];
      const edges: Edge[] = [
        {
          id: 'e1',
          source: 'img-a',
          sourceHandle: 'image',
          target: 'img-b',
          targetHandle: 'ref-image',
        },
      ];
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges(edges);

      const executeGeneration = mock(async (nodeId: string) => imgOutput(nodeId));
      await executeWorkflow(buildControls(executeGeneration) as any, {
        targetNodeId: 'img-b',
        clearDownstream: false,
      });

      expect(executeGeneration).toHaveBeenCalledTimes(1);
      expect(executeGeneration.mock.calls[0][1].reference_images?.[0]).toMatchObject({
        image_url: durableUrl,
        storage_bucket: 'brand-profile-assets',
        storage_path: 'brand/generated.png',
      });
    });

    it('Run-all reuses every node that already has content (no regeneration)', async () => {
      const nodes: StudioNode[] = [
        {
          id: 'a',
          position: { x: 0, y: 0 },
          data: {
            model: 'nano-banana',
            positivePrompt: 'a',
            generatedImage: 'data:image/png;base64,aaa',
          },
          type: 'nanoGen',
        },
        {
          id: 'b',
          position: { x: 0, y: 0 },
          data: {
            model: 'nano-banana',
            positivePrompt: 'b',
            generatedImage: 'data:image/png;base64,bbb',
          },
          type: 'nanoGen',
        },
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'a', sourceHandle: 'image', target: 'b', targetHandle: 'ref-image' },
      ];
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges(edges);

      const executeGeneration = mock(async (nodeId: string) => imgOutput(nodeId));
      const controls = buildControls(executeGeneration);

      await executeWorkflow(controls as any, {});

      expect(executeGeneration).toHaveBeenCalledTimes(0);
    });

    it('Run-all fills an empty node while reusing its completed upstream', async () => {
      const nodes: StudioNode[] = [
        {
          id: 'a',
          position: { x: 0, y: 0 },
          data: {
            model: 'nano-banana',
            positivePrompt: 'a',
            generatedImage: 'data:image/png;base64,aaa',
          },
          type: 'nanoGen',
        },
        {
          id: 'b',
          position: { x: 0, y: 0 },
          data: { model: 'nano-banana', positivePrompt: 'b' },
          type: 'nanoGen',
        },
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'a', sourceHandle: 'image', target: 'b', targetHandle: 'ref-image' },
      ];
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges(edges);

      const executeGeneration = mock(async (nodeId: string) => imgOutput(nodeId));
      const controls = buildControls(executeGeneration);

      await executeWorkflow(controls as any, {});

      expect(executeGeneration).toHaveBeenCalledTimes(1);
      expect(executeGeneration.mock.calls[0][0]).toBe('b');
      expect(executeGeneration.mock.calls[0][1].reference_images?.[0]?.data).toBe('aaa');
    });

    it('regenerates a node edited since it generated, and cascades to its downstream consumers', async () => {
      // img-a was generated with prompt OLD (signature stamped), then edited to
      // NEW. img-b is unedited but consumes img-a. Run-all must regenerate BOTH:
      // img-a is stale, img-b is downstream of a regenerating node.
      const aOld: StudioNode = {
        id: 'img-a',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', positivePrompt: 'OLD' },
        type: 'nanoGen',
      };
      const staleSig = computeGenerationSignature(aOld, [], new Map([['img-a', aOld]]));
      const nodes: StudioNode[] = [
        {
          id: 'img-a',
          position: { x: 0, y: 0 },
          data: {
            model: 'nano-banana',
            positivePrompt: 'NEW',
            generatedImage: 'data:image/png;base64,old_a',
            generationSignature: staleSig,
          },
          type: 'nanoGen',
        },
        {
          id: 'img-b',
          position: { x: 0, y: 0 },
          data: {
            model: 'nano-banana',
            positivePrompt: 'b',
            generatedImage: 'data:image/png;base64,old_b',
          },
          type: 'nanoGen',
        },
      ];
      const edges: Edge[] = [
        {
          id: 'e1',
          source: 'img-a',
          sourceHandle: 'image',
          target: 'img-b',
          targetHandle: 'ref-image',
        },
      ];
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges(edges);

      const executeGeneration = mock(async (nodeId: string) => imgOutput(nodeId));
      const controls = buildControls(executeGeneration);

      await executeWorkflow(controls as any, {});

      const called = executeGeneration.mock.calls.map((c) => c[0]).sort();
      expect(called).toEqual(['img-a', 'img-b']);
    });

    it('reuses a completed upstream whose stored signature still matches (not stale)', async () => {
      const aNode: StudioNode = {
        id: 'img-a',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana',
          positivePrompt: 'first',
          generatedImage: 'data:image/png;base64,a',
        },
        type: 'nanoGen',
      };
      const edges: Edge[] = [
        {
          id: 'e1',
          source: 'img-a',
          sourceHandle: 'image',
          target: 'img-b',
          targetHandle: 'ref-image',
        },
      ];
      (aNode.data as Record<string, unknown>).generationSignature = computeGenerationSignature(
        aNode,
        edges,
        new Map([['img-a', aNode]]),
      );
      const nodes: StudioNode[] = [
        aNode,
        {
          id: 'img-b',
          position: { x: 0, y: 0 },
          data: { model: 'nano-banana', positivePrompt: 'second' },
          type: 'nanoGen',
        },
      ];
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges(edges);

      const executeGeneration = mock(async (nodeId: string) => imgOutput(nodeId));
      const controls = buildControls(executeGeneration);

      await executeWorkflow(controls as any, { targetNodeId: 'img-b', clearDownstream: false });

      expect(executeGeneration).toHaveBeenCalledTimes(1);
      expect(executeGeneration.mock.calls[0][0]).toBe('img-b');
      const imgA = useStudioStore.getState().nodes.find((n) => n.id === 'img-a');
      expect(imgA?.data.generatedImage).toBe('data:image/png;base64,a');
    });

    // Bug #221: sig2 shipped with sig1 signatures already on every stored node,
    // so a video run marked its untouched upstream image stale and re-made it.
    it('a video run reuses an upstream image still stamped with a sig1 signature', async () => {
      const imageNode: StudioNode = {
        id: 'img-a',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana',
          positivePrompt: 'first',
          aspectRatio: '1:1',
          generatedImage: 'data:image/png;base64,a',
        },
        type: 'nanoGen',
      };
      // Exactly what the pre-bump build wrote: no negativePrompt, no brandBookPieces.
      (imageNode.data as Record<string, unknown>).generationSignature =
        'sig1:nanoGen|positivePrompt=first|model=nano-banana|aspectRatio=1:1|imageSize=|stylePreset=|skillIds=|seed=|steps=|guidance=|scheduler=|promptEnhancement=|refs()';

      const videoNode: StudioNode = {
        id: 'vid',
        position: { x: 0, y: 0 },
        data: { model: 'veo-3.1-fast', prompt: 'pan across it' },
        type: 'veoFast',
      };
      const edges: Edge[] = [
        {
          id: 'e1',
          source: 'img-a',
          sourceHandle: 'image',
          target: 'vid',
          targetHandle: 'first-frame',
        },
      ];
      useStudioStore.getState().setNodes([imageNode, videoNode]);
      useStudioStore.getState().setEdges(edges);

      const executeGeneration = mock(async (nodeId: string) =>
        nodeId === 'vid'
          ? { success: true, output: { type: 'video', url: 'video_url' } }
          : imgOutput(nodeId),
      );
      const controls = buildControls(executeGeneration);

      await executeWorkflow(controls as any, { targetNodeId: 'vid', clearDownstream: false });

      expect(executeGeneration.mock.calls.map((call) => call[0])).toEqual(['vid']);
      const imgA = useStudioStore.getState().nodes.find((n) => n.id === 'img-a');
      expect(imgA?.data.generatedImage).toBe('data:image/png;base64,a');
    });

    it('forceRegenerateAll re-runs every node even when they already have content', async () => {
      const nodes: StudioNode[] = [
        {
          id: 'a',
          position: { x: 0, y: 0 },
          data: {
            model: 'nano-banana',
            positivePrompt: 'a',
            generatedImage: 'data:image/png;base64,aaa',
          },
          type: 'nanoGen',
        },
        {
          id: 'b',
          position: { x: 0, y: 0 },
          data: {
            model: 'nano-banana',
            positivePrompt: 'b',
            generatedImage: 'data:image/png;base64,bbb',
          },
          type: 'nanoGen',
        },
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'a', sourceHandle: 'image', target: 'b', targetHandle: 'ref-image' },
      ];
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges(edges);

      const executeGeneration = mock(async (nodeId: string) => imgOutput(nodeId));
      const controls = buildControls(executeGeneration);

      await executeWorkflow(controls as any, { forceRegenerateAll: true });

      const called = executeGeneration.mock.calls.map((c) => c[0]).sort();
      expect(called).toEqual(['a', 'b']);
    });

    it('stamps a generation signature onto a node when it produces output', async () => {
      const nodes: StudioNode[] = [
        {
          id: 'solo',
          position: { x: 0, y: 0 },
          data: { model: 'nano-banana', positivePrompt: 'hello' },
          type: 'nanoGen',
        },
      ];
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges([]);

      const executeGeneration = mock(async (nodeId: string) => imgOutput(nodeId));
      const controls = buildControls(executeGeneration);

      await executeWorkflow(controls as any, { targetNodeId: 'solo', clearDownstream: false });

      const solo = useStudioStore.getState().nodes.find((n) => n.id === 'solo');
      const sig = (solo?.data as Record<string, unknown>).generationSignature;
      expect(typeof sig).toBe('string');
      expect((sig as string).startsWith('sig2:')).toBe(true);
    });
  });

  describe('collectDownstreamLeafIds', () => {
    it('finds the runnable leaf descendants downstream of a node', () => {
      const nodeById = new Map<string, { type?: string }>([
        ['gate', { type: 'timelineEditor' }],
        ['ext', { type: 'extendVideo' }],
        ['dec', { type: 'videoDecode' }],
      ]);
      const edges: Edge[] = [
        { id: 'e1', source: 'gate', target: 'ext' },
        { id: 'e2', source: 'ext', target: 'dec' },
      ];
      expect(collectDownstreamLeafIds('gate', edges, nodeById)).toEqual(['dec']);
    });

    it('ignores non-runnable downstream targets and returns empty for a terminal node', () => {
      const nodeById = new Map<string, { type?: string }>([
        ['gate', { type: 'timelineEditor' }],
        ['ref', { type: 'video' }],
      ]);
      // gate -> a plain video reference node (not runnable) => no runnable leaves.
      const edges: Edge[] = [{ id: 'e1', source: 'gate', target: 'ref' }];
      expect(collectDownstreamLeafIds('gate', edges, nodeById)).toEqual([]);
      expect(collectDownstreamLeafIds('gate', [], nodeById)).toEqual([]);
    });
  });
});

describe('collectPublisherHandoffs', () => {
  it('reports a publisher sink fed by the run scope as a handoff', () => {
    const nodes: StudioNode[] = [
      { id: 'gen', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
      { id: 'pub', position: { x: 0, y: 0 }, data: { format: 'image' }, type: 'plannerDraft' },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'gen', target: 'pub', targetHandle: 'image-in' }];

    const handoffs = collectPublisherHandoffs(nodes, edges, ['gen']);
    expect(handoffs).toEqual([
      { nodeId: 'pub', kind: 'organic', state: 'handoff — deliver via studio_deliver' },
    ]);
  });

  it('classifies a paid publisher sink', () => {
    const nodes: StudioNode[] = [
      { id: 'gen', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
      { id: 'pub', position: { x: 0, y: 0 }, data: { format: 'video' }, type: 'paidPublisher' },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'gen', target: 'pub', targetHandle: 'video-in' }];
    expect(collectPublisherHandoffs(nodes, edges, ['gen'])[0]?.kind).toBe('paid');
  });

  it('ignores a publisher not reachable from the run scope', () => {
    const nodes: StudioNode[] = [
      { id: 'gen', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
      { id: 'orphan', position: { x: 0, y: 0 }, data: {}, type: 'plannerDraft' },
    ];
    // No edge from gen → orphan, so a run of `gen` never feeds it.
    expect(collectPublisherHandoffs(nodes, [], ['gen'])).toEqual([]);
  });

  it('returns every publisher when no scope is given', () => {
    const nodes: StudioNode[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: {}, type: 'plannerDraft' },
      { id: 'b', position: { x: 0, y: 0 }, data: {}, type: 'paidPublisher' },
      { id: 'c', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
      { id: 'd', position: { x: 0, y: 0 }, data: {}, type: 'organicPublish' },
    ];
    expect(collectPublisherHandoffs(nodes, [])).toHaveLength(3);
  });
});

describe('Canvas V3 runtime branches', () => {
  // The action branch registers a real AbortController so a long re-encode can be
  // cancelled, so the stub has to provide those two.
  const controls = () => ({
    executeGeneration: mock(async () => ({
      success: true,
      output: { type: 'image', base64: 'gen', mimeType: 'image/png' },
    })),
    executeVideoExtension: mock(async () => ({ success: true })),
    executeEnrichment: mock(async () => ({ success: true, output: { type: 'text', value: '' } })),
    registerController: () => new AbortController(),
    releaseController: () => {},
    show: () => {},
    cancel: () => {},
    reset: () => {},
  });

  it('routes its input straight through and stamps the modality lock', async () => {
    // The router IS the fan-out mechanism: it republishes its upstream as its own
    // output, so many edges leaving it all read one already-computed result.
    const nodes: StudioNode[] = [
      { id: 'src', position: { x: 0, y: 0 }, type: 'string', data: { value: 'hello' } },
      { id: 'route', position: { x: 0, y: 0 }, type: 'router', data: { lockedType: null } },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore
      .getState()
      .setEdges([
        { id: 'e', source: 'src', target: 'route', sourceHandle: 'text', targetHandle: 'in' },
      ]);

    await executeWorkflow(controls() as never, { targetNodeId: 'route' });

    const router = useStudioStore.getState().nodes.find((n) => n.id === 'route');
    expect(router?.data.value).toBe('hello');
    expect(router?.data.lockedType).toBe('text');
    expect(router?.data.isComplete).toBe(true);
  });

  it('fails a router with nothing connected instead of completing empty', async () => {
    useStudioStore
      .getState()
      .setNodes([
        { id: 'route', position: { x: 0, y: 0 }, type: 'router', data: { lockedType: null } },
      ]);
    useStudioStore.getState().setEdges([]);

    await executeWorkflow(controls() as never, { targetNodeId: 'route' });

    const router = useStudioStore.getState().nodes.find((n) => n.id === 'route');
    expect(router?.data.isComplete).not.toBe(true);
  });

  it('materializes a batch into a collection of its items', async () => {
    useStudioStore.getState().setNodes([
      {
        id: 'bat',
        position: { x: 0, y: 0 },
        type: 'batch',
        data: {
          itemType: 'text',
          combine: 'zip',
          items: [
            { id: 'a', kind: 'text', value: 'one', label: 'One' },
            { id: 'b', kind: 'text', value: 'two', label: 'Two' },
          ],
        },
      },
    ]);
    useStudioStore.getState().setEdges([]);

    await executeWorkflow(controls() as never, { targetNodeId: 'bat' });

    const batch = useStudioStore.getState().nodes.find((n) => n.id === 'bat');
    expect(batch?.data.collectionCount).toBe(2);
    expect(batch?.data.collectionItemType).toBe('text');
    expect(batch?.data.isComplete).toBe(true);
  });

  it('runs a text action on its connected input', async () => {
    useStudioStore.getState().setNodes([
      { id: 'src', position: { x: 0, y: 0 }, type: 'string', data: { value: 'a fast fox' } },
      {
        id: 'act',
        position: { x: 0, y: 0 },
        type: 'action',
        data: { actionId: 'text.findReplace', config: { find: 'fast', replace: 'slow' } },
      },
    ]);
    useStudioStore
      .getState()
      .setEdges([
        { id: 'e', source: 'src', target: 'act', sourceHandle: 'text', targetHandle: 'in' },
      ]);

    await executeWorkflow(controls() as never, { targetNodeId: 'act' });

    const action = useStudioStore.getState().nodes.find((n) => n.id === 'act');
    // A TEXT op writes `value` and no media, even though the `action` node type's
    // registry entry says producesMedia: true. That flag is about the type; the OP
    // decides the output, and this assertion is the guard on that rule.
    expect(action?.data.value).toBe('a slow fox');
    expect(action?.data.generatedImage).toBeUndefined();
    expect(action?.data.isComplete).toBe(true);
  });

  it('fans a text action out over a collection, one output per item', async () => {
    useStudioStore.getState().setNodes([
      {
        id: 'bat',
        position: { x: 0, y: 0 },
        type: 'batch',
        data: {
          itemType: 'text',
          combine: 'zip',
          items: [
            { id: 'a', kind: 'text', value: 'red car' },
            { id: 'b', kind: 'text', value: 'red van' },
            { id: 'c', kind: 'text', value: 'blue car' },
          ],
        },
      },
      {
        id: 'act',
        position: { x: 0, y: 0 },
        type: 'action',
        data: { actionId: 'text.findReplace', config: { find: 'red', replace: 'green' } },
      },
    ]);
    useStudioStore
      .getState()
      .setEdges([
        { id: 'e', source: 'bat', target: 'act', sourceHandle: 'collection', targetHandle: 'in' },
      ]);

    await executeWorkflow(controls() as never, { targetNodeId: 'act' });

    const action = useStudioStore.getState().nodes.find((n) => n.id === 'act');
    expect(action?.data.collectionCount).toBe(3);
    expect(action?.data.collectionItemType).toBe('text');
    expect(action?.data.isComplete).toBe(true);
  });

  it('refuses an action with no op rather than running something it guessed', async () => {
    useStudioStore.getState().setNodes([
      {
        id: 'act',
        position: { x: 0, y: 0 },
        type: 'action',
        data: { actionId: null, config: {} },
      },
    ]);
    useStudioStore.getState().setEdges([]);

    await executeWorkflow(controls() as never, { targetNodeId: 'act' });

    const action = useStudioStore.getState().nodes.find((n) => n.id === 'act');
    expect(action?.data.isComplete).not.toBe(true);
    expect(String(action?.data.error)).toContain('operation');
  });

  it('parks a layerEditor with no images on its own named reason, never the prompt fallthrough', async () => {
    // Every declared runnable now has a runtime (the not-yet-built refusal list is
    // empty as of the Wave-4 gate). What this pins instead: the Layer Editor's
    // readiness gate speaks for itself — a bare node parks on "connect an image",
    // not on the generator branch's "Missing required prompt" about a prompt the
    // node does not have.
    useStudioStore.getState().setNodes([
      {
        id: 'lay',
        position: { x: 0, y: 0 },
        type: 'layerEditor',
        data: { frame: { width: 2048, height: 2048 }, layers: [] },
      },
    ]);
    useStudioStore.getState().setEdges([]);

    await executeWorkflow(controls() as never, { targetNodeId: 'lay' });

    const layered = useStudioStore.getState().nodes.find((n) => n.id === 'lay');
    const message = String(layered?.data.error ?? layered?.data.statusMessage ?? '');
    expect(message).toContain('image');
    expect(message).not.toContain('prompt');
  });
});

describe('MCP-built nanoGen graph resolves its reference image (gate regression)', () => {
  // The shape the MCP graph builder emits: a `string` on `prompt` and an `image`
  // reference on `ref-image`. `ref-image` and `ref-images` are ALIASES and both sit in
  // nanoGen's allowed set, so a resolver that knows only one of them silently drops the
  // reference and the node reports a missing input it can plainly see is connected.
  const controls = () => {
    const executeGeneration = mock(async () => ({
      success: true,
      output: { type: 'image', base64: 'generated', mimeType: 'image/png' },
    }));
    return {
      executeGeneration,
      controls: {
        executeGeneration,
        executeVideoExtension: mock(async () => ({ success: true })),
        executeEnrichment: mock(async () => ({
          success: true,
          output: { type: 'text', value: '' },
        })),
        registerController: () => new AbortController(),
        releaseController: () => {},
        show: () => {},
        cancel: () => {},
        reset: () => {},
      },
    };
  };

  const seed = (imageEdge: Partial<Edge>) => {
    const nodes: StudioNode[] = [
      { id: 'bench-prompt', position: { x: 0, y: 0 }, type: 'string', data: { value: 'a prompt' } },
      {
        id: 'bench-image',
        position: { x: 0, y: 0 },
        type: 'image',
        data: {
          image: 'https://example.test/reference.png',
          sourcePath: 'brand/reference.png',
          bucket: 'media-library',
        },
      },
      {
        id: 'bench-gen',
        position: { x: 0, y: 0 },
        type: 'nanoGen',
        data: { model: 'nano-banana', positivePrompt: '' },
      },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges([
      {
        id: 'e-prompt',
        source: 'bench-prompt',
        target: 'bench-gen',
        sourceHandle: 'text',
        targetHandle: 'prompt',
      },
      {
        id: 'e-image',
        source: 'bench-image',
        target: 'bench-gen',
        ...imageEdge,
      } as Edge,
    ]);
  };

  it('runs on a whole-graph run with explicit handles', async () => {
    seed({ source: 'bench-image', sourceHandle: 'image', targetHandle: 'ref-image' });
    const { executeGeneration, controls: c } = controls();

    await executeWorkflow(c as never, {});

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(
      useStudioStore.getState().nodes.find((n) => n.id === 'bench-gen')?.data.error,
    ).toBeFalsy();
    expect(
      useStudioStore.getState().nodes.find((n) => n.id === 'bench-image')?.data.error,
    ).toBeFalsy();
  });

  it('runs when the stored edge carries a null sourceHandle', async () => {
    // MCP writes handles as nullable columns; the FE normalizes null to undefined on
    // load. Reference resolution must not depend on the source handle being named.
    seed({ source: 'bench-image', sourceHandle: null, targetHandle: 'ref-image' });
    const { executeGeneration, controls: c } = controls();

    await executeWorkflow(c as never, {});

    expect(executeGeneration).toHaveBeenCalledTimes(1);
  });

  it('runs on the plural ref-images alias too', async () => {
    seed({ source: 'bench-image', sourceHandle: 'image', targetHandle: 'ref-images' });
    const { executeGeneration, controls: c } = controls();

    await executeWorkflow(c as never, {});

    expect(executeGeneration).toHaveBeenCalledTimes(1);
  });

  it('runs when targeted directly rather than as a whole graph', async () => {
    seed({ source: 'bench-image', sourceHandle: 'image', targetHandle: 'ref-image' });
    const { executeGeneration, controls: c } = controls();

    await executeWorkflow(c as never, { targetNodeId: 'bench-gen' });

    expect(executeGeneration).toHaveBeenCalledTimes(1);
  });

  it('blames the unreadable reference, not the wiring, when the URL never resolved', async () => {
    // The gate failure looked like "Missing connected input for ref-image" on a node
    // whose input was plainly connected. It was: the reference's signed URL could not
    // be refreshed (the canvas origin was not on the backend's CORS allowlist), so the
    // node carried a path and no readable media. Say THAT.
    useStudioStore.getState().setNodes([
      { id: 'bench-prompt', position: { x: 0, y: 0 }, type: 'string', data: { value: 'a prompt' } },
      {
        id: 'bench-image',
        position: { x: 0, y: 0 },
        type: 'image',
        data: { sourcePath: 'brand/reference.png', bucket: 'media-library' },
      },
      {
        id: 'bench-gen',
        position: { x: 0, y: 0 },
        type: 'nanoGen',
        data: { model: 'nano-banana', positivePrompt: '' },
      },
    ]);
    useStudioStore.getState().setEdges([
      {
        id: 'e-prompt',
        source: 'bench-prompt',
        target: 'bench-gen',
        sourceHandle: 'text',
        targetHandle: 'prompt',
      },
      {
        id: 'e-image',
        source: 'bench-image',
        target: 'bench-gen',
        sourceHandle: 'image',
        targetHandle: 'ref-image',
      },
    ]);

    await executeWorkflow(controls().controls as never, {});

    const reported = useStudioStore
      .getState()
      .nodes.map((n) => String(n.data.error ?? ''))
      .join(' ');
    expect(reported).toContain('could not be loaded');
    expect(reported).not.toContain('Missing connected input');
  });


});

describe('executeWorkflow — omniGen payload', () => {
  const runOmni = async (
    nodes: StudioNode[],
    edges: Edge[],
  ): Promise<Record<string, unknown>> => {
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    let captured: Record<string, unknown> = {};
    const executeOmniTurn = mock(async (_nodeId: string, payload: Record<string, unknown>) => {
      captured = payload;
      return {
        success: true,
        interactionId: 'v1_new',
        output: {
          type: 'video',
          url: 'https://example.com/out.mp4',
          storagePath: 'p',
          storageBucket: 'b',
        },
      };
    });
    const controls = {
      executeGeneration: mock(async () => ({ success: true })),
      executeVideoExtension: mock(async () => ({ success: true })),
      executeEnrichment: mock(async () => ({ success: true })),
      executeOmniTurn,
      cancel: () => {},
      reset: () => {},
      isExecuting: true,
      error: null,
    };

    await executeWorkflow(controls as never, { targetNodeId: 'omni', brandId: 'brand-1' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return captured;
  };

  // The chip wrote designSystemSections into node data and the payload builder
  // dropped it, so the design-system switch was live-looking and inert.
  it('carries the grounding the node collected, and the resolution', async () => {
    const payload = await runOmni(
      [
        {
          id: 'omni',
          position: { x: 0, y: 0 },
          type: 'omniGen',
          data: {
            model: 'gemini-omni-flash',
            prompt: 'a marble on a track',
            aspectRatio: '16:9',
            resolution: '360p',
            skillIds: ['skill-1'],
            brandBookPieces: ['tone'],
            designSystemSections: ['color'],
          },
        } as unknown as StudioNode,
      ],
      [],
    );

    expect(payload.turn).toBe('generate');
    expect(payload.resolution).toBe('360p');
    expect(payload.designSystemSections).toEqual(['color']);
    expect(payload.skillIds).toEqual(['skill-1']);
    expect(payload.brandBookPieces).toEqual(['tone']);
  });

  it('defaults the resolution rather than letting the Backend pick silently', async () => {
    const payload = await runOmni(
      [
        {
          id: 'omni',
          position: { x: 0, y: 0 },
          type: 'omniGen',
          data: { model: 'gemini-omni-flash', prompt: 'a marble', aspectRatio: '16:9' },
        } as unknown as StudioNode,
      ],
      [],
    );
    expect(payload.resolution).toBe('720p');
  });

  it('turns a clip on ref-video into an extend of that clip', async () => {
    const payload = await runOmni(
      [
        {
          id: 'clip',
          position: { x: 0, y: 0 },
          type: 'video',
          data: { video: 'https://example.com/source.mp4' },
        } as unknown as StudioNode,
        {
          id: 'omni',
          position: { x: 0, y: 0 },
          type: 'omniGen',
          data: {
            model: 'gemini-omni-flash',
            prompt: 'continue the scene',
            aspectRatio: '16:9',
            videoTask: 'extend',
          },
        } as unknown as StudioNode,
      ],
      [
        {
          id: 'e-clip',
          source: 'clip',
          target: 'omni',
          sourceHandle: 'video',
          targetHandle: 'ref-video',
        },
      ],
    );

    expect(payload.turn).toBe('extend');
    expect(payload.sourceVideo).toEqual({
      uri: 'https://example.com/source.mp4',
      mimeType: 'video/mp4',
    });
  });

  it('edits the wired clip when the node is not set to extend', async () => {
    const payload = await runOmni(
      [
        {
          id: 'clip',
          position: { x: 0, y: 0 },
          type: 'video',
          data: { video: 'https://example.com/source.mp4' },
        } as unknown as StudioNode,
        {
          id: 'omni',
          position: { x: 0, y: 0 },
          type: 'omniGen',
          data: { model: 'gemini-omni-flash', prompt: 'warmer light', aspectRatio: '16:9' },
        } as unknown as StudioNode,
      ],
      [
        {
          id: 'e-clip',
          source: 'clip',
          target: 'omni',
          sourceHandle: 'video',
          targetHandle: 'ref-video',
        },
      ],
    );
    expect(payload.turn).toBe('edit');
  });
});
