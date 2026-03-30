import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { executeWorkflow } from './executeWorkflow';
import { useStudioStore } from '../stores/useStudioStore';
import { StudioNode } from '../types';
import { Edge } from '@xyflow/react';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('executeWorkflow', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
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

  it('should parse fast enrichment SSE deltas across chunk boundaries', async () => {
    mock.module("@/lib/supabase/client", () => ({
      createSupabaseBrowserClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: { access_token: "token" } } }),
        },
      }),
    }));

    const fetchMock = mock(async () => {
      return new Response(
        streamFromChunks([
          'event: ready\n',
          'data: {"requestId":"abc"}\n\n',
          'event: delta\n',
          'da',
          'ta: {"delta":"Hello"}\n\n',
          'event: delta\ndata: {"delta":" world"}\n\n',
          'event: done\ndata: {"requestId":"abc"}\n\n',
        ]),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const nodes: StudioNode[] = [
      { id: 'text-1', position: { x: 0, y: 0 }, data: { value: 'draft prompt' }, type: 'string' },
    ];
    useStudioStore.getState().setNodes(nodes);

    const executeGeneration = mock(async () => ({ success: true }));
    const controls = buildControls(executeGeneration);

    await executeWorkflow(controls as any, { targetNodeId: 'text-1', clearDownstream: false });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const finalNodes = useStudioStore.getState().nodes;
    const updatedNode = finalNodes.find((n) => n.id === 'text-1');
    expect(updatedNode?.data.value).toBe('Hello world');
    expect(updatedNode?.data.isComplete).toBe(true);
    expect(updatedNode?.data.error).toBeUndefined();
  });

  it('should fail string node when fast enrichment emits an error event', async () => {
    mock.module("@/lib/supabase/client", () => ({
      createSupabaseBrowserClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: { access_token: "token" } } }),
        },
      }),
    }));

    globalThis.fetch = mock(async () => {
      return new Response(
        streamFromChunks([
          'event: error\ndata: {"message":"Gemini upstream failed"}\n\n',
          'event: done\ndata: {"requestId":"abc"}\n\n',
        ]),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }
      );
    }) as typeof fetch;

    const nodes: StudioNode[] = [
      { id: 'text-1', position: { x: 0, y: 0 }, data: { value: 'draft prompt' }, type: 'string' },
    ];
    useStudioStore.getState().setNodes(nodes);

    const executeGeneration = mock(async () => ({ success: true }));
    const controls = buildControls(executeGeneration);

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
});
