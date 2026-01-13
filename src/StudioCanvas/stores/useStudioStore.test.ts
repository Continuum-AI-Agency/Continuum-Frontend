import { describe, it, expect, beforeEach } from 'bun:test';
import { useStudioStore } from './useStudioStore';
import { StudioNode } from '../types';
import { Edge, Connection } from '@xyflow/react';

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

    useStudioStore.getState().setNodes([node]);
    useStudioStore.getState().updateNodeData('1', { value: 'new' });

    expect(useStudioStore.getState().nodes[0].data.value).toBe('new');
    expect(useStudioStore.getState().nodes[0].data.label).toBe('Node 1');
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
      targetHandle: 'ref-images',
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
      targetHandle: 'ref-images',
    });

    expect(useStudioStore.getState().edges).toHaveLength(1);
  });

  it('should gate video reference mode inputs', () => {
    const nodes: StudioNode[] = [
      { id: 'img1', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      { id: 'veo', position: { x: 0, y: 0 }, data: { referenceMode: 'frames' }, type: 'veoDirector' },
    ];
    useStudioStore.getState().setNodes(nodes);

    // Ref images not allowed in frames mode
    useStudioStore.getState().onConnect({
      source: 'img1',
      sourceHandle: 'image',
      target: 'veo',
      targetHandle: 'ref-images',
    });
    expect(useStudioStore.getState().edges).toHaveLength(0);

    // First frame allowed in frames mode
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
        targetHandle: 'ref-images',
      });
    }
    expect(useStudioStore.getState().edges).toHaveLength(14);

    // Connect 15th image (should fail)
    useStudioStore.getState().onConnect({
      source: 'img14',
      sourceHandle: 'image',
      target: targetId,
      targetHandle: 'ref-images',
    });
    expect(useStudioStore.getState().edges).toHaveLength(14);
  });
});
