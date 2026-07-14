import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { executeWorkflow, collectDownstreamLeafIds } from './executeWorkflow';
import { computeGenerationSignature } from './generationSignature';
import { useStudioStore } from '../stores/useStudioStore';
import { StudioNode } from '../types';
import { Edge } from '@xyflow/react';

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

    // Reset store state
    useStudioStore.setState({
      nodes: [],
      edges: [],
      defaultEdgeType: 'bezier',
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

    const edges: Edge[] = [
      { id: 'e1', source: '1', target: '2', targetHandle: 'prompt' },
    ];

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

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeGeneration.mock.calls[0][0]).toBe('2');
    expect(executeGeneration.mock.calls[0][1]).toEqual(expect.objectContaining({
      prompt: 'prompt',
      model: 'gemini-2.5-flash-image',
    }));

    // Check store updates
    const finalNodes = useStudioStore.getState().nodes;
    const updatedNode2 = finalNodes.find(n => n.id === '2');
    expect(updatedNode2?.data.generatedImage).toBeDefined();
    expect(updatedNode2?.data.isComplete).toBe(true);
  });

  it('should handle execution failure', async () => {
    const nodes: StudioNode[] = [
      { id: '1', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'test' }, type: 'nanoGen' },
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
    const updatedNode = finalNodes.find(n => n.id === '1');
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
    const executeGeneration = mock(() => request);
    const execution = executeWorkflow(buildControls(executeGeneration) as any);

    while (executeGeneration.mock.calls.length === 0) {
      await Promise.resolve();
    }
    expect(
      useStudioStore.getState().nodes.find((node) => node.id === 'generate-image')?.data
        .isExecuting,
    ).toBe(true);

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
      { id: '3', position: { x: 0, y: 0 }, data: { model: 'veo-3.1', prompt: 'video prompt' }, type: 'veoDirector' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: '1', target: '2', targetHandle: 'prompt' },
      { id: 'e2', source: '2', target: '3', sourceHandle: 'image', targetHandle: 'ref-images' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (nodeId, payload) => {
      if (nodeId === '2') {
        return { success: true, output: { type: 'image', base64: 'img_data', mimeType: 'image/png' } };
      }
      if (nodeId === '3') {
        return { success: true, output: { type: 'video', url: 'video_url' } };
      }
      return { success: false, error: 'Unknown node' };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executeGeneration).toHaveBeenCalledWith('2', expect.anything());
    
    expect(executeGeneration).toHaveBeenCalledWith('3', expect.anything());

    expect(executeGeneration).toHaveBeenCalledTimes(2);
    // Ensure order: 2 then 3
    expect(executeGeneration.mock.calls[0][0]).toBe('2');
    expect(executeGeneration.mock.calls[1][0]).toBe('3');

    const finalNodes = useStudioStore.getState().nodes;
    const veoNode = finalNodes.find(n => n.id === '3');
    expect(veoNode?.data.generatedVideo).toBe('video_url');
  });

  it('should include image reference outputs in generation payloads', async () => {
    const dataUrl = 'data:image/png;base64,ref_base64';
    const nodes: StudioNode[] = [
      { id: 'img', position: { x: 0, y: 0 }, data: { image: dataUrl }, type: 'image' },
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
    expect(payload.reference_images?.[0]).toEqual(expect.objectContaining({
      data: 'ref_base64',
      mime_type: 'image/png',
    }));
  });

  it('should block when connected optional input is missing', async () => {
    const nodes: StudioNode[] = [
      { id: 'img', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      { id: 'nano', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'prompt' }, type: 'nanoGen' },
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
    const node = finalNodes.find(n => n.id === 'nano');
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
      { id: 'nano-1', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'one' }, type: 'nanoGen' },
      { id: 'nano-2', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'two' }, type: 'nanoGen' },
    ];

    useStudioStore.getState().setNodes(nodes);

    const executeGeneration = mock(async (nodeId) => {
      return { success: true, output: { type: 'image', base64: `out-${nodeId}`, mimeType: 'image/png' } };
    });

    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any, { targetNodeId: 'nano-2' });

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeGeneration.mock.calls[0][0]).toBe('nano-2');
  });

  it('should run only the targeted media node and reuse upstream values', async () => {
    const nodes: StudioNode[] = [
      { id: 'prompt-1', position: { x: 0, y: 0 }, data: { value: 'keep this prompt' }, type: 'string' },
      {
        id: 'img-a',
        position: { x: 0, y: 0 },
        data: { model: 'nano-banana', generatedImage: 'data:image/png;base64,img_a_base64', isComplete: true },
        type: 'nanoGen',
      },
      { id: 'video-1', position: { x: 0, y: 0 }, data: { model: 'veo-3.1', prompt: '' }, type: 'veoDirector' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'prompt-1', sourceHandle: 'text', target: 'video-1', targetHandle: 'prompt-in' },
      { id: 'e2', source: 'img-a', sourceHandle: 'image', target: 'video-1', targetHandle: 'ref-images' },
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
      executeEnrichment
    );

    await executeWorkflow(controls as any, { targetNodeId: 'video-1', clearDownstream: false });

    expect(executeEnrichment).toHaveBeenCalledTimes(0);
    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeGeneration.mock.calls[0][0]).toBe('video-1');

    const payload = executeGeneration.mock.calls[0][1];
    expect(payload.prompt).toBe('keep this prompt');
    expect(payload.reference_images).toHaveLength(1);
    expect(payload.reference_images?.[0]).toEqual(expect.objectContaining({ data: 'img_a_base64' }));

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
      { id: 'img-a', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'first image' }, type: 'nanoGen' },
      { id: 'img-b', position: { x: 0, y: 0 }, data: { model: 'nano-banana' }, type: 'nanoGen' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'prompt-1', sourceHandle: 'text', target: 'img-b', targetHandle: 'prompt' },
      { id: 'e2', source: 'img-a', sourceHandle: 'image', target: 'img-b', targetHandle: 'ref-image' },
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
        data: { model: 'nano-banana', generatedImage: 'data:image/png;base64,existing_a', isComplete: true },
        type: 'nanoGen',
      },
      { id: 'img-b', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'second' }, type: 'nanoGen' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'img-a', sourceHandle: 'image', target: 'img-b', targetHandle: 'ref-image' },
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
      { id: 'string-1', position: { x: 0, y: 0 }, data: { value: 'persistent prompt' }, type: 'string' },
      { id: 'nano-1', position: { x: 0, y: 0 }, data: { model: 'nano-banana' }, type: 'nanoGen' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'string-1', sourceHandle: 'text', target: 'nano-1', targetHandle: 'prompt' },
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
      executeEnrichment
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
      { id: 'image-input', position: { x: 0, y: 0 }, data: { image: 'data:image/png;base64,ref_input' }, type: 'image' },
      { id: 'string-1', position: { x: 0, y: 0 }, data: { value: 'locked prompt text' }, type: 'string' },
      { id: 'video-1', position: { x: 0, y: 0 }, data: { model: 'veo-3.1', prompt: '' }, type: 'veoDirector' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'image-input', sourceHandle: 'image', target: 'string-1', targetHandle: 'image' },
      { id: 'e2', source: 'string-1', sourceHandle: 'text', target: 'video-1', targetHandle: 'prompt-in' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async (_nodeId, payload) => ({
      success: true,
      output: { type: 'video', url: 'video_url' },
      payload,
    }));
    const executeEnrichment = mock(async () => ({ success: true, output: { type: 'text', value: 'enriched' } }));
    const controls = buildControls(executeGeneration, mock(async () => ({ success: true })), executeEnrichment);

    await executeWorkflow(controls as any, { targetNodeId: 'video-1', clearDownstream: false });

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeEnrichment).toHaveBeenCalledTimes(0);
    expect(executeGeneration.mock.calls[0][1].prompt).toBe('locked prompt text');
  });

  it('should execute extend video nodes with base64 input', async () => {
    const nodes: StudioNode[] = [
      { id: 'vid-1', position: { x: 0, y: 0 }, data: { video: 'data:video/mp4;base64,base64_video' }, type: 'video' },
      { id: 'extend-1', position: { x: 0, y: 0 }, data: {}, type: 'extendVideo' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'vid-1', sourceHandle: 'video', target: 'extend-1', targetHandle: 'video' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => {
      return { success: true, output: { type: 'image', base64: 'out', mimeType: 'image/png' } };
    });

    const executeVideoExtension = mock(async (_nodeId, payload) => {
      return { success: true, output: { type: 'video', url: 'data:video/mp4;base64,extended_video' } };
    });

    const controls = buildControls(executeGeneration, executeVideoExtension);

    await executeWorkflow(controls as any);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executeVideoExtension).toHaveBeenCalledTimes(1);
    const payload = executeVideoExtension.mock.calls[0][1];
    expect(payload.video?.data).toBe('base64_video');

    const finalNodes = useStudioStore.getState().nodes;
    const updatedNode = finalNodes.find(n => n.id === 'extend-1');
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
      { id: 'e1', source: 'veo-1', sourceHandle: 'video', target: 'extend-1', targetHandle: 'video' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => ({ success: true, output: { type: 'video', url: 'unused' } }));
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
      { id: 'e1', source: 'veo-1', sourceHandle: 'video', target: 'extend-1', targetHandle: 'video' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => ({ success: true, output: { type: 'video', url: 'unused' } }));
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
        data: { model: 'nano-banana', positivePrompt: '', skillIds: ['skill-x'], brandBookPieces: ['voice'] },
        type: 'nanoGen',
      },
    ];
    const edges = [
      { id: 'e1', source: 'text-1', target: 'nano-1', targetHandle: 'prompt' },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges as any);

    const executeGeneration = mock(async () => ({ success: true }));
    const executeEnrichment = mock(async () => ({ success: true, output: { type: 'text', value: 'enriched' } }));
    const controls = buildControls(executeGeneration, undefined, executeEnrichment);

    await executeWorkflow(controls as any, { targetNodeId: 'text-1', clearDownstream: false });

    // No direct edge-function fetch — enrichment now flows through the Backend service.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(executeEnrichment).toHaveBeenCalledTimes(1);
    const payload = executeEnrichment.mock.calls[0][1] as { skillIds?: string[]; brandBookPieces?: string[] };
    expect(payload.skillIds).toEqual(['skill-x']);
    expect(payload.brandBookPieces).toEqual(['voice']);
  });

  it('should fail string node when enrichment returns an error', async () => {
    const nodes: StudioNode[] = [
      { id: 'text-1', position: { x: 0, y: 0 }, data: { value: 'draft prompt' }, type: 'string' },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges([]);

    const executeGeneration = mock(async () => ({ success: true }));
    const executeEnrichment = mock(async () => ({ success: false, error: 'Gemini upstream failed' }));
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
      { id: 'e1', source: 'img-markup', sourceHandle: 'image', target: 'nano', targetHandle: 'ref-image' },
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
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify compositeImages was called with the original image and markup layer
    expect(compositeMock).toHaveBeenCalledTimes(1);
    expect(compositeMock).toHaveBeenCalledWith(
      'data:image/png;base64,original_image',
      'data:image/png;base64,markup_layer'
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
      { id: 'e1', source: 'img-no-markup', sourceHandle: 'image', target: 'nano', targetHandle: 'ref-image' },
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
        data: { image: remoteUrl, sourceUrl: remoteUrl, sourcePath: 'brand/a.jpg', bucket: 'media-library' },
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
    const signedUrl = 'https://x.supabase.co/storage/v1/object/sign/media-library/c.jpg?token=fresh';
    const nodes: StudioNode[] = [
      { id: 'img', position: { x: 0, y: 0 }, data: { sourceUrl: signedUrl }, type: 'image' },
      { id: 'nano', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'use this' }, type: 'nanoGen' },
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
        data: { sourcePath: 'brand/d.jpg', bucket: 'media-library', sourceUrl: 'https://stale/d.jpg?token=expired' },
        type: 'image',
      },
      { id: 'nano', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'use this' }, type: 'nanoGen' },
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
      { id: 'vid', position: { x: 0, y: 0 }, data: { video: 'data:video/mp4;base64,vvv' }, type: 'video' },
      { id: 'edit', position: { x: 0, y: 0 }, data: { items: [{ id: 'i1', order: 0, sourceNodeId: 'vid' }] }, type: 'timelineEditor' },
      { id: 'ext', position: { x: 0, y: 0 }, data: {}, type: 'extendVideo' },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'vid', sourceHandle: 'video', target: 'edit', targetHandle: 'media-in' },
      { id: 'e2', source: 'edit', sourceHandle: 'video', target: 'ext', targetHandle: 'video' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    const executeGeneration = mock(async () => ({ success: true, output: { type: 'image', base64: 'x', mimeType: 'image/png' } }));
    const executeVideoExtension = mock(async () => ({ success: true, output: { type: 'video', url: 'should_not_run' } }));
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
      { id: 'vid', position: { x: 0, y: 0 }, data: { video: 'data:video/mp4;base64,vvv' }, type: 'video' },
      {
        id: 'edit',
        position: { x: 0, y: 0 },
        data: { items: [{ id: 'i1', order: 0, sourceNodeId: 'vid' }], committed: true, generatedVideoUrl: editedUrl, isComplete: true },
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

    const executeGeneration = mock(async () => ({ success: true, output: { type: 'image', base64: 'x', mimeType: 'image/png' } }));
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
          data: { model: 'nano-banana', positivePrompt: 'first', generatedImage: 'data:image/png;base64,existing_a' },
          type: 'nanoGen',
        },
        { id: 'img-b', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'second' }, type: 'nanoGen' },
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'img-a', sourceHandle: 'image', target: 'img-b', targetHandle: 'ref-image' },
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

    it('Run-all reuses every node that already has content (no regeneration)', async () => {
      const nodes: StudioNode[] = [
        { id: 'a', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'a', generatedImage: 'data:image/png;base64,aaa' }, type: 'nanoGen' },
        { id: 'b', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'b', generatedImage: 'data:image/png;base64,bbb' }, type: 'nanoGen' },
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
        { id: 'a', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'a', generatedImage: 'data:image/png;base64,aaa' }, type: 'nanoGen' },
        { id: 'b', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'b' }, type: 'nanoGen' },
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
      const aOld: StudioNode = { id: 'img-a', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'OLD' }, type: 'nanoGen' };
      const staleSig = computeGenerationSignature(aOld, [], new Map([['img-a', aOld]]));
      const nodes: StudioNode[] = [
        { id: 'img-a', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'NEW', generatedImage: 'data:image/png;base64,old_a', generationSignature: staleSig }, type: 'nanoGen' },
        { id: 'img-b', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'b', generatedImage: 'data:image/png;base64,old_b' }, type: 'nanoGen' },
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'img-a', sourceHandle: 'image', target: 'img-b', targetHandle: 'ref-image' },
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
      const aNode: StudioNode = { id: 'img-a', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'first', generatedImage: 'data:image/png;base64,a' }, type: 'nanoGen' };
      const edges: Edge[] = [
        { id: 'e1', source: 'img-a', sourceHandle: 'image', target: 'img-b', targetHandle: 'ref-image' },
      ];
      (aNode.data as Record<string, unknown>).generationSignature = computeGenerationSignature(aNode, edges, new Map([['img-a', aNode]]));
      const nodes: StudioNode[] = [
        aNode,
        { id: 'img-b', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'second' }, type: 'nanoGen' },
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

    it('forceRegenerateAll re-runs every node even when they already have content', async () => {
      const nodes: StudioNode[] = [
        { id: 'a', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'a', generatedImage: 'data:image/png;base64,aaa' }, type: 'nanoGen' },
        { id: 'b', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'b', generatedImage: 'data:image/png;base64,bbb' }, type: 'nanoGen' },
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
        { id: 'solo', position: { x: 0, y: 0 }, data: { model: 'nano-banana', positivePrompt: 'hello' }, type: 'nanoGen' },
      ];
      useStudioStore.getState().setNodes(nodes);
      useStudioStore.getState().setEdges([]);

      const executeGeneration = mock(async (nodeId: string) => imgOutput(nodeId));
      const controls = buildControls(executeGeneration);

      await executeWorkflow(controls as any, { targetNodeId: 'solo', clearDownstream: false });

      const solo = useStudioStore.getState().nodes.find((n) => n.id === 'solo');
      const sig = (solo?.data as Record<string, unknown>).generationSignature;
      expect(typeof sig).toBe('string');
      expect((sig as string).startsWith('sig1:')).toBe(true);
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
