import { describe, it, expect } from 'bun:test';
import { isValidConnection } from './isValidConnection';
import { StudioNode } from '../types';
import { Edge } from '@xyflow/react';

describe('isValidConnection', () => {
  const nodes: StudioNode[] = [
    { id: 'string1', type: 'string', position: { x: 0, y: 0 }, data: { value: '' } },
    { id: 'string2', type: 'string', position: { x: 0, y: 0 }, data: { value: '' } },
    { id: 'image1', type: 'image', position: { x: 0, y: 0 }, data: { image: '' } },
    { id: 'audio1', type: 'audio', position: { x: 0, y: 0 }, data: { audio: '' } },
    { id: 'audio2', type: 'audio', position: { x: 0, y: 0 }, data: { audio: '' } },
    { id: 'doc1', type: 'document', position: { x: 0, y: 0 }, data: { documents: [] } },
    { id: 'doc2', type: 'document', position: { x: 0, y: 0 }, data: { documents: [] } },
    { id: 'nano1', type: 'nanoGen', position: { x: 0, y: 0 }, data: { prompt: '' } },
    { id: 'video1', type: 'video', position: { x: 0, y: 0 }, data: { video: '' } },
    { id: 'extend1', type: 'extendVideo', position: { x: 0, y: 0 }, data: { prompt: '' } },
  ];

  it('should allow connecting Image to String node', () => {
    const valid = isValidConnection(
      { source: 'image1', sourceHandle: 'image', target: 'string1', targetHandle: 'image' },
      [],
      nodes
    );
    expect(valid).toBe(true);
  });

  it('should allow connecting Audio to String node', () => {
    const valid = isValidConnection(
      { source: 'audio1', sourceHandle: 'audio', target: 'string1', targetHandle: 'audio' },
      [],
      nodes
    );
    expect(valid).toBe(true);
  });

  it('should allow connecting Document to String node', () => {
    const valid = isValidConnection(
      { source: 'doc1', sourceHandle: 'document', target: 'string1', targetHandle: 'document' },
      [],
      nodes
    );
    expect(valid).toBe(true);
  });

  it('should prevent multiple Audio connections to the same String node', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'audio1', sourceHandle: 'audio', target: 'string1', targetHandle: 'audio' }
    ];
    const valid = isValidConnection(
      { source: 'audio2', sourceHandle: 'audio', target: 'string1', targetHandle: 'audio' },
      edges,
      nodes
    );
    expect(valid).toBe(false);
  });

  it('should allow multiple Document connections to the same String node', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'doc1', sourceHandle: 'document', target: 'string1', targetHandle: 'document' }
    ];
    const valid = isValidConnection(
      { source: 'doc2', sourceHandle: 'document', target: 'string1', targetHandle: 'document' },
      edges,
      nodes
    );
    expect(valid).toBe(true);
  });

  it('should allow multiple Image connections to the same String node', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'image1', sourceHandle: 'image', target: 'string1', targetHandle: 'image' }
    ];
    const nodesWithImage2 = [...nodes, { id: 'image2', type: 'image', position: { x: 0, y: 0 }, data: { image: '' } }];
    
    const valid = isValidConnection(
      { source: 'image2', sourceHandle: 'image', target: 'string1', targetHandle: 'image' },
      edges,
      nodesWithImage2
    );
    expect(valid).toBe(true);
  });

  it('should prevent connecting mismatched types to String node handles', () => {
    expect(isValidConnection(
      { source: 'image1', sourceHandle: 'image', target: 'string1', targetHandle: 'audio' }, [], nodes
    )).toBe(false);

    expect(isValidConnection(
      { source: 'audio1', sourceHandle: 'audio', target: 'string1', targetHandle: 'document' }, [], nodes
    )).toBe(false);
  });

  it('should allow String to NanoGen prompt connection', () => {
    const valid = isValidConnection(
      { source: 'string1', sourceHandle: 'text', target: 'nano1', targetHandle: 'prompt' },
      [],
      nodes
    );
    expect(valid).toBe(true);
  });

  it('should prevent connecting Image to NanoGen prompt', () => {
    const valid = isValidConnection(
      { source: 'image1', sourceHandle: 'image', target: 'nano1', targetHandle: 'prompt' },
      [],
      nodes
    );
    expect(valid).toBe(false);
  });

  it('should allow Image to NanoGen ref-image connection', () => {
    const valid = isValidConnection(
      { source: 'image1', sourceHandle: 'image', target: 'nano1', targetHandle: 'ref-image' },
      [],
      nodes
    );
    expect(valid).toBe(true);
  });

  it('should enforce single connection limit for NanoGen prompt', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'string1', sourceHandle: 'text', target: 'nano1', targetHandle: 'prompt' }
    ];
    const valid = isValidConnection(
      { source: 'string2', sourceHandle: 'text', target: 'nano1', targetHandle: 'prompt' },
      edges,
      nodes
    );
    expect(valid).toBe(false);
  });

  it('should enforce 14 connection limit for NanoGen ref-image', () => {
    const edges: Edge[] = [];
    for (let i = 0; i < 14; i++) {
        edges.push({ 
            id: `e${i}`, 
            source: `img${i}`, 
            sourceHandle: 'image', 
            target: 'nano1', 
            targetHandle: 'ref-image' 
        });
    }
    
    const valid = isValidConnection(
      { source: 'image1', sourceHandle: 'image', target: 'nano1', targetHandle: 'ref-image' },
      edges,
      nodes
    );
    expect(valid).toBe(false);
  });

  it('should allow connecting Video to ExtendVideo', () => {
    const valid = isValidConnection(
        { source: 'video1', sourceHandle: 'video', target: 'extend1', targetHandle: 'video' },
        [],
        nodes
    );
    expect(valid).toBe(true);
  });

  it('should prevent connecting String to ExtendVideo video handle', () => {
    const valid = isValidConnection(
        { source: 'string1', sourceHandle: 'text', target: 'extend1', targetHandle: 'video' },
        [],
        nodes
    );
    expect(valid).toBe(false);
  });
});
