import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { executeWorkflow } from './executeWorkflow';
import { useStudioStore } from '../stores/useStudioStore';
import { StudioNode } from '../types';
import { Edge } from '@xyflow/react';

describe('executeWorkflow', () => {
  let originalUpdateNodeData: any;
  let updateNodeDataSpy: any;

  beforeEach(() => {
    // Reset store state
    useStudioStore.setState({
      nodes: [],
      edges: [],
      defaultEdgeType: 'bezier',
    });

    if (!originalUpdateNodeData) {
      originalUpdateNodeData = useStudioStore.getState().updateNodeData;
    }

    updateNodeDataSpy = mock((id: string, data: any) => {
        return originalUpdateNodeData(id, data);
    });

    useStudioStore.setState({ updateNodeData: updateNodeDataSpy });
  });

  afterEach(() => {
      if (originalUpdateNodeData) {
        useStudioStore.setState({ updateNodeData: originalUpdateNodeData });
      }
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

    const controls = {
      executeGeneration,
      cancel: () => {},
      reset: () => {},
      isExecuting: true,
      error: null,
    };

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

    const controls = {
      executeGeneration,
      cancel: () => {},
      reset: () => {},
      isExecuting: true,
      error: null,
    };

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

    const controls = {
      executeGeneration,
      cancel: () => {},
      reset: () => {},
      isExecuting: true,
      error: null,
    };

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
});
