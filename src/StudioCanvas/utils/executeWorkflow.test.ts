import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { executeWorkflow } from './executeWorkflow';
import { useStudioStore } from '../stores/useStudioStore';
import { StudioNode } from '../types';
import { Edge } from '@xyflow/react';

describe('executeWorkflow', () => {
  beforeEach(() => {
    // Reset store state
    useStudioStore.setState({
      nodes: [],
      edges: [],
      defaultEdgeType: 'bezier',
    });
  });

  const buildControls = (
    executeGeneration: ReturnType<typeof mock>,
    executeVideoExtension: ReturnType<typeof mock> = mock(async () => {
      return { success: true, output: { type: 'video', url: 'video_url' } };
    }),
  ) => ({
    executeGeneration,
    executeVideoExtension,
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

    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeGeneration.mock.calls[0][0]).toBe('2');
    expect(executeGeneration.mock.calls[0][1]).toEqual(expect.objectContaining({
      prompt: 'prompt',
      model: 'gemini-2.5-flash-image',
    }));

    // Check store updates
    const updatedNode2 = useStudioStore.getState().nodes.find(n => n.id === '2');
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

    const updatedNode = useStudioStore.getState().nodes.find(n => n.id === '1');
    expect(updatedNode?.data.error).toBe('API Error');
    expect(updatedNode?.data.isComplete).toBe(false);
  });

  it('should handle dependencies', async () => {
    const nodes: StudioNode[] = [
      { id: '1', position: { x: 0, y: 0 }, data: { value: 'prompt' }, type: 'string' },
      { id: '2', position: { x: 0, y: 0 }, data: { model: 'nano-banana' }, type: 'nanoGen' },
      { id: '3', position: { x: 0, y: 0 }, data: { model: 'veo-3.1', prompt: 'video prompt' }, type: 'veoDirector' },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: '1', target: '2', targetHandle: 'prompt' },
      { id: 'e2', source: '2', target: '3', sourceHandle: 'image', targetHandle: 'ref-image' },
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

    expect(executeGeneration).toHaveBeenCalledWith('2', expect.anything());
    
    expect(executeGeneration).toHaveBeenCalledWith('3', expect.anything());

    expect(executeGeneration).toHaveBeenCalledTimes(2);
    // Ensure order: 2 then 3
    expect(executeGeneration.mock.calls[0][0]).toBe('2');
    expect(executeGeneration.mock.calls[1][0]).toBe('3');

    const veoNode = useStudioStore.getState().nodes.find(n => n.id === '3');
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
      { id: 'e1', source: 'img', sourceHandle: 'image', target: 'nano', targetHandle: 'ref-images' },
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

    expect(executeGeneration).toHaveBeenCalledTimes(0);
    const node = useStudioStore.getState().nodes.find(n => n.id === 'nano');
    expect(node?.data.error).toBe('Missing connected input for ref-images');
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

    expect(executeVideoExtension).toHaveBeenCalledTimes(1);
    const payload = executeVideoExtension.mock.calls[0][1];
    expect(payload.video?.data).toBe('base64_video');

    const updatedNode = useStudioStore.getState().nodes.find(n => n.id === 'extend-1');
    expect(updatedNode?.data.generatedVideo).toBe('data:video/mp4;base64,extended_video');
  });
});
