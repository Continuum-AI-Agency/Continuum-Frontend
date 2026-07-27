import { beforeEach, describe, expect, it } from 'bun:test';
import type { Connection } from '@xyflow/react';
import type { StudioNode } from '../types';
import { useStudioStore } from './useStudioStore';

describe('useStudioStore', () => {
  beforeEach(() => {
    useStudioStore.setState({
      nodes: [],
      edges: [],
      defaultEdgeType: 'bezier',
    });
  });

  it('should add nodes', () => {
    const node: StudioNode = {
      id: '1',
      position: { x: 0, y: 0 },
      data: { label: 'Node 1' },
      type: 'default',
    };

    useStudioStore.getState().setNodes([node]);
    expect(useStudioStore.getState().nodes).toHaveLength(1);
    expect(useStudioStore.getState().nodes[0]).toEqual(node);
  });

  it('should update node data', () => {
    const node: StudioNode = {
      id: '1',
      position: { x: 0, y: 0 },
      data: { label: 'Node 1', value: 'old' },
      type: 'default',
    };

    useStudioStore.setState({ nodes: [node] });
    useStudioStore.getState().updateNodeData('1', { value: 'new' });

    const updatedNodes = useStudioStore.getState().nodes;
    expect(updatedNodes[0].data.value).toBe('new');
    expect(updatedNodes[0].data.label).toBe('Node 1');
  });

  it('should validate connection limits for NanoGenNode', () => {
    const nodes: StudioNode[] = [
      { id: '1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: '2', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);

    // First connection to prompt
    const conn1: Connection = {
      source: '1',
      sourceHandle: 'text',
      target: '2',
      targetHandle: 'prompt',
    };
    useStudioStore.getState().onConnect(conn1);
    expect(useStudioStore.getState().edges).toHaveLength(1);

    // Second connection to prompt (should fail)
    const conn2: Connection = {
      source: '1',
      sourceHandle: 'text',
      target: '2',
      targetHandle: 'prompt',
    };
    useStudioStore.getState().onConnect(conn2);
    expect(useStudioStore.getState().edges).toHaveLength(1);
  });

  it('should allow valid NanoGenNode connections', () => {
    const nodes: StudioNode[] = [
      { id: 'text1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: 'img1', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      { id: 'nano', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);

    // Text to Prompt
    useStudioStore.getState().onConnect({
      source: 'text1',
      sourceHandle: 'text',
      target: 'nano',
      targetHandle: 'prompt',
    });

    // Image to Ref Images
    useStudioStore.getState().onConnect({
      source: 'img1',
      sourceHandle: 'image',
      target: 'nano',
      targetHandle: 'ref-image',
    });

    expect(useStudioStore.getState().edges).toHaveLength(2);
  });

  it('should allow only one prompt-in connection', () => {
    const nodes: StudioNode[] = [
      { id: 'text1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: 'text2', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: 'veo', position: { x: 0, y: 0 }, data: {}, type: 'veoDirector' },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().onConnect({
      source: 'text1',
      sourceHandle: 'text',
      target: 'veo',
      targetHandle: 'prompt-in',
    });

    useStudioStore.getState().onConnect({
      source: 'text2',
      sourceHandle: 'text',
      target: 'veo',
      targetHandle: 'prompt-in',
    });

    expect(useStudioStore.getState().edges).toHaveLength(1);
  });

  it('should allow only one negative connection', () => {
    const nodes: StudioNode[] = [
      { id: 'text1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: 'text2', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: 'veo', position: { x: 0, y: 0 }, data: {}, type: 'veoDirector' },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().onConnect({
      source: 'text1',
      sourceHandle: 'text',
      target: 'veo',
      targetHandle: 'negative',
    });

    useStudioStore.getState().onConnect({
      source: 'text2',
      sourceHandle: 'text',
      target: 'veo',
      targetHandle: 'negative',
    });

    expect(useStudioStore.getState().edges).toHaveLength(1);
  });

  it('should enforce connection types', () => {
    const nodes: StudioNode[] = [
      { id: 'image1', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      { id: 'nano', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);

    // Image to Prompt (Invalid: Image -> Text)
    useStudioStore.getState().onConnect({
      source: 'image1',
      sourceHandle: 'image',
      target: 'nano',
      targetHandle: 'prompt',
    });

    expect(useStudioStore.getState().edges).toHaveLength(0);

    // Image to Ref Images (Valid)
    useStudioStore.getState().onConnect({
      source: 'image1',
      sourceHandle: 'image',
      target: 'nano',
      targetHandle: 'ref-image',
    });

    expect(useStudioStore.getState().edges).toHaveLength(1);
  });

  it('should gate video reference mode inputs', () => {
    const nodes: StudioNode[] = [
      { id: 'img1', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      {
        id: 'veo',
        position: { x: 0, y: 0 },
        data: { referenceMode: 'images' },
        type: 'veoDirector',
      },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().onConnect({
      source: 'img1',
      sourceHandle: 'image',
      target: 'veo',
      targetHandle: 'ref-images',
    });
    expect(useStudioStore.getState().edges).toHaveLength(1);

    useStudioStore.getState().onConnect({
      source: 'img1',
      sourceHandle: 'image',
      target: 'veo',
      targetHandle: 'first-frame',
    });
    expect(useStudioStore.getState().edges).toHaveLength(1);
  });

  it('should support up to 14 reference images', () => {
    const targetId = 'nano';
    const nodes: StudioNode[] = [
      { id: targetId, position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
    ];

    // Create 15 image nodes
    for (let i = 0; i < 15; i++) {
      nodes.push({ id: `img${i}`, position: { x: 0, y: 0 }, data: {}, type: 'image' });
    }
    useStudioStore.getState().setNodes(nodes);

    // Connect 14 images
    for (let i = 0; i < 14; i++) {
      useStudioStore.getState().onConnect({
        source: `img${i}`,
        sourceHandle: 'image',
        target: targetId,
        targetHandle: 'ref-image',
      });
    }
    expect(useStudioStore.getState().edges).toHaveLength(14);

    // Connect 15th image (should fail)
    useStudioStore.getState().onConnect({
      source: 'img14',
      sourceHandle: 'image',
      target: targetId,
      targetHandle: 'ref-image',
    });
    expect(useStudioStore.getState().edges).toHaveLength(14);
  });

  it('should cap Kling Omni image references to 4 when ref video is connected', () => {
    const nodes: StudioNode[] = [
      {
        id: 'kling',
        position: { x: 0, y: 0 },
        data: { model: 'kling-omni', prompt: '' },
        type: 'videoGen',
      } as any,
      { id: 'videoRef', position: { x: 0, y: 0 }, data: { video: '' }, type: 'video' },
      { id: 'img1', position: { x: 0, y: 0 }, data: { image: '' }, type: 'image' },
      { id: 'img2', position: { x: 0, y: 0 }, data: { image: '' }, type: 'image' },
      { id: 'img3', position: { x: 0, y: 0 }, data: { image: '' }, type: 'image' },
      { id: 'img4', position: { x: 0, y: 0 }, data: { image: '' }, type: 'image' },
      { id: 'img5', position: { x: 0, y: 0 }, data: { image: '' }, type: 'image' },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().onConnect({
      source: 'videoRef',
      sourceHandle: 'video',
      target: 'kling',
      targetHandle: 'ref-video',
    });

    ['img1', 'img2', 'img3', 'img4', 'img5'].forEach((id) => {
      useStudioStore.getState().onConnect({
        source: id,
        sourceHandle: 'image',
        target: 'kling',
        targetHandle: 'ref-images',
      });
    });

    const refVideoEdges = useStudioStore
      .getState()
      .edges.filter((edge) => edge.targetHandle === 'ref-video');
    const refImageEdges = useStudioStore
      .getState()
      .edges.filter((edge) => edge.targetHandle === 'ref-images');

    expect(refVideoEdges).toHaveLength(1);
    expect(refImageEdges).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// normalizeEdges — legacy handle remapping and survival tests
// These verify the root cause fix: setEdges/setNodes must not silently drop
// edges whose handles need a canonical rename.
// ---------------------------------------------------------------------------
describe('normalizeEdges legacy handle remapping', () => {
  beforeEach(() => {
    useStudioStore.setState({ nodes: [], edges: [] });
  });

  it('remaps legacy "text" targetHandle to "prompt" on nanoGen and keeps the edge', () => {
    const nodes: StudioNode[] = [
      { id: 'str1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: 'nano1', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);

    // Inject a stored edge with the legacy "text" targetHandle.
    useStudioStore.getState().setEdges([
      {
        id: 'e-legacy-text',
        source: 'str1',
        sourceHandle: 'text',
        target: 'nano1',
        targetHandle: 'text',
        type: 'dataType',
      },
    ]);

    const edges = useStudioStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].targetHandle).toBe('prompt');
  });

  it('remaps legacy "text" targetHandle to "prompt-in" on videoGen and keeps the edge', () => {
    const nodes: StudioNode[] = [
      { id: 'str1', position: { x: 0, y: 0 }, data: { model: 'veo-3.1-fast' }, type: 'string' },
      { id: 'vid1', position: { x: 0, y: 0 }, data: { model: 'veo-3.1-fast' }, type: 'videoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().setEdges([
      {
        id: 'e-legacy-vid-text',
        source: 'str1',
        sourceHandle: 'text',
        target: 'vid1',
        targetHandle: 'text',
        type: 'dataType',
      },
    ]);

    const edges = useStudioStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].targetHandle).toBe('prompt-in');
  });

  it('remaps legacy "prompt" targetHandle to "prompt-in" on videoGen', () => {
    const nodes: StudioNode[] = [
      { id: 'str1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: 'vid1', position: { x: 0, y: 0 }, data: { model: 'veo-3.1' }, type: 'videoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().setEdges([
      {
        id: 'e-legacy-prompt',
        source: 'str1',
        sourceHandle: 'text',
        target: 'vid1',
        targetHandle: 'prompt',
        type: 'dataType',
      },
    ]);

    const edges = useStudioStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].targetHandle).toBe('prompt-in');
  });

  it('remaps legacy "ref-image" targetHandle to "ref-images" on videoGen', () => {
    const nodes: StudioNode[] = [
      { id: 'img1', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      { id: 'vid1', position: { x: 0, y: 0 }, data: { model: 'veo-3.1' }, type: 'videoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().setEdges([
      {
        id: 'e-legacy-ref-image',
        source: 'img1',
        sourceHandle: 'image',
        target: 'vid1',
        targetHandle: 'ref-image',
        type: 'dataType',
      },
    ]);

    const edges = useStudioStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].targetHandle).toBe('ref-images');
  });

  it('keeps a canonical prompt-in edge on videoGen without remapping', () => {
    const nodes: StudioNode[] = [
      { id: 'str1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: 'vid1', position: { x: 0, y: 0 }, data: { model: 'veo-3.1-fast' }, type: 'videoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().setEdges([
      {
        id: 'e-canonical',
        source: 'str1',
        sourceHandle: 'text',
        target: 'vid1',
        targetHandle: 'prompt-in',
        type: 'dataType',
      },
    ]);

    const edges = useStudioStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].targetHandle).toBe('prompt-in');
  });

  it('detachNodeConnections removes only the target node edges and keeps the node', () => {
    const nodes: StudioNode[] = [
      { id: 'img1', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      { id: 'str1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: 'nano1', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges([
      {
        id: 'e-img-nano',
        source: 'img1',
        sourceHandle: 'image',
        target: 'nano1',
        targetHandle: 'ref-image',
        type: 'dataType',
      },
      {
        id: 'e-str-nano',
        source: 'str1',
        sourceHandle: 'text',
        target: 'nano1',
        targetHandle: 'prompt',
        type: 'dataType',
      },
    ]);

    useStudioStore.getState().detachNodeConnections('img1');

    const state = useStudioStore.getState();
    // Node is preserved
    expect(state.nodes.some((n) => n.id === 'img1')).toBe(true);
    // img1's edge is gone; str1's edge to nano1 is intact
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0].id).toBe('e-str-nano');
    // Detached edge id is tracked for sync
    expect(state.deletedEdgeIds).toContain('e-img-nano');
  });

  it('detachNodeConnections is a no-op when the node has no connections', () => {
    const nodes: StudioNode[] = [{ id: 'img1', position: { x: 0, y: 0 }, data: {}, type: 'image' }];
    useStudioStore.getState().setNodes(nodes);
    const snapshotBefore = useStudioStore.getState().history.past.length;

    useStudioStore.getState().detachNodeConnections('img1');

    const state = useStudioStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.edges).toHaveLength(0);
    // No snapshot taken (no change)
    expect(state.history.past.length).toBe(snapshotBefore);
  });

  it('drops an edge whose targetHandle has no valid mapping (genuinely invalid)', () => {
    const nodes: StudioNode[] = [
      { id: 'str1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
      { id: 'nano1', position: { x: 0, y: 0 }, data: {}, type: 'nanoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().setEdges([
      {
        id: 'e-bogus',
        source: 'str1',
        sourceHandle: 'text',
        target: 'nano1',
        targetHandle: 'totally-unknown-handle',
        type: 'dataType',
      },
    ]);

    expect(useStudioStore.getState().edges).toHaveLength(0);
  });

  it('stamps the correct dataType for an audio source connection (was mis-colored as text)', () => {
    const nodes: StudioNode[] = [
      { id: 'audio1', position: { x: 0, y: 0 }, data: {}, type: 'audio' },
      { id: 'str1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().onConnect({
      source: 'audio1',
      sourceHandle: 'audio',
      target: 'str1',
      targetHandle: 'audio',
    });

    const [edge] = useStudioStore.getState().edges;
    expect((edge.data as { dataType?: string } | undefined)?.dataType).toBe('audio');
  });

  it('stamps the correct dataType for a document source connection (was mis-colored as text)', () => {
    const nodes: StudioNode[] = [
      { id: 'doc1', position: { x: 0, y: 0 }, data: {}, type: 'document' },
      { id: 'str1', position: { x: 0, y: 0 }, data: {}, type: 'string' },
    ];
    useStudioStore.getState().setNodes(nodes);

    useStudioStore.getState().onConnect({
      source: 'doc1',
      sourceHandle: 'document',
      target: 'str1',
      targetHandle: 'document',
    });

    const [edge] = useStudioStore.getState().edges;
    expect((edge.data as { dataType?: string } | undefined)?.dataType).toBe('document');
  });
});

// ---------------------------------------------------------------------------
// Video reference mode — handle remapping and mode-driven edge pruning
// ---------------------------------------------------------------------------
describe('video reference mode edge normalization', () => {
  beforeEach(() => {
    useStudioStore.setState({ nodes: [], edges: [] });
  });

  const seed = (videoData: Record<string, unknown>) => {
    const nodes: StudioNode[] = [
      { id: 'img1', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      { id: 'vid1', position: { x: 0, y: 0 }, data: videoData, type: 'videoGen' },
    ];
    useStudioStore.getState().setNodes(nodes);
  };

  const setEdge = (targetHandle: string) => {
    useStudioStore.getState().setEdges([
      {
        id: `e-${targetHandle}`,
        source: 'img1',
        sourceHandle: 'image',
        target: 'vid1',
        targetHandle,
        type: 'dataType',
      },
    ]);
  };

  it('remaps a legacy frame-0 handle onto first-frame', () => {
    seed({ model: 'veo-3.1-fast', referenceMode: 'frames' });
    setEdge('frame-0');

    const edges = useStudioStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].targetHandle).toBe('first-frame');
  });

  it('remaps any higher legacy frame-N handle onto last-frame', () => {
    seed({ model: 'veo-3.1-fast', referenceMode: 'frames' });
    setEdge('frame-3');

    const edges = useStudioStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].targetHandle).toBe('last-frame');
  });

  it('keeps a first-frame edge on a frames-mode veo-3.1 node', () => {
    seed({ model: 'veo-3.1', referenceMode: 'frames' });
    setEdge('first-frame');

    expect(useStudioStore.getState().edges).toHaveLength(1);
  });

  it('prunes a first-frame edge once the node switches to images mode', () => {
    seed({ model: 'veo-3.1', referenceMode: 'images' });
    setEdge('first-frame');

    expect(useStudioStore.getState().edges).toHaveLength(0);
  });

  it('keeps a ref-images edge on an images-mode veo-3.1-fast node — the mirror', () => {
    seed({ model: 'veo-3.1-fast', referenceMode: 'images' });
    setEdge('ref-images');

    expect(useStudioStore.getState().edges).toHaveLength(1);
  });
});
