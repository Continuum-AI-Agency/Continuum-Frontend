import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { executeWorkflow } from './utils/executeWorkflow';
import { useStudioStore } from './stores/useStudioStore';
import { StudioNode } from './types';
import { Edge } from '@xyflow/react';

// Integration test that simulates the whole flow without UI
describe('StudioCanvas Integration', () => {
  let originalUpdateNodeData: any;
  let updateNodeDataSpy: any;

  beforeEach(() => {
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
      useStudioStore.setState({ updateNodeData: originalUpdateNodeData });
  });

  it('should run a complete multi-step generation workflow', async () => {
    // 1. Setup Nodes
    const nodes: StudioNode[] = [
      { id: 'prompt-node', type: 'string', position: { x: 0, y: 0 }, data: { value: 'A majestic lion' } },
      { id: 'image-gen', type: 'nanoGen', position: { x: 200, y: 0 }, data: { model: 'nano-banana' } },
      { id: 'video-gen', type: 'veoDirector', position: { x: 400, y: 0 }, data: { model: 'veo-3.1' } },
    ];

    // 2. Setup Edges
    const edges: Edge[] = [
      // Text -> Image Gen (Prompt)
      { id: 'e1', source: 'prompt-node', target: 'image-gen', sourceHandle: 'text', targetHandle: 'prompt' },
      // Image Gen -> Video Gen (Ref Image)
      { id: 'e2', source: 'image-gen', target: 'video-gen', sourceHandle: 'image', targetHandle: 'ref-image' },
    ];

    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);

    // 3. Mock Execution Backend
    const executeGeneration = mock(async (nodeId, payload) => {
      console.log(`Mock executeGeneration called for ${nodeId} with payload:`, JSON.stringify(payload, null, 2));
      if (nodeId === 'image-gen') {
        return {
          success: true,
          output: { type: 'image', base64: 'lion_image_base64', mimeType: 'image/png' },
        };
      }
      if (nodeId === 'video-gen') {
        // Verify payload has correct inputs from previous step
        if (payload.referenceImages?.[0]?.data === 'lion_image_base64') {
             return {
                success: true,
                output: { type: 'video', url: 'https://video.url/lion.mp4' },
              };
        }
        return { success: false, error: 'Missing upstream input' };
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

    // 4. Run Workflow
    await executeWorkflow(controls as any);

    const imageNode = useStudioStore.getState().nodes.find(n => n.id === 'image-gen');
    expect(imageNode?.data.generatedImage).toContain('lion_image_base64');
    expect(imageNode?.data.isComplete).toBe(true);

    // Wait for async processing - executeWorkflow mock operations are fast but state updates might be batched
    // A small delay to ensure all promises resolved
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(executeGeneration).toHaveBeenCalledTimes(2);

    const videoNodeResult = useStudioStore.getState().nodes.find(n => n.id === 'video-gen');
    expect(videoNodeResult?.data.generatedVideo).toBe('https://video.url/lion.mp4');
    expect(videoNodeResult?.data.isComplete).toBe(true);
  });
});
