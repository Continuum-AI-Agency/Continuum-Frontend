import { describe, it, expect } from "bun:test";

import {
  resolveGeneratorInputs,
  extractText,
  extractImageRef,
  extractAspectRatio,
  extractProvider,
  type ResolvedInputs,
  type CanvasNode,
} from "@/lib/ai-studio/inputResolution";
import type { Edge, Node } from "@xyflow/react";

describe("extractText", () => {
  it("extracts prompt from PromptNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'prompt',
      position: { x: 0, y: 0 },
      data: { prompt: 'test prompt' },
    };
    expect(extractText(node)).toBe('test prompt');
  });

  it("extracts negativePrompt from NegativeNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'negative',
      position: { x: 0, y: 0 },
      data: { negativePrompt: 'avoid this' },
    };
    expect(extractText(node)).toBe('avoid this');
  });

  it("extracts prompt from GeneratorNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'generator',
      position: { x: 0, y: 0 },
      data: { 
        provider: 'nano-banana' as const,
        medium: 'image' as const,
        prompt: 'gen prompt',
        aspectRatio: '1:1',
      },
    };
    expect(extractText(node)).toBe('gen prompt');
  });

  it("returns undefined for AttachmentNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'attachment',
      position: { x: 0, y: 0 },
      data: { label: 'test', path: '/test.png', mimeType: 'image/png', previewUrl: 'url' },
    };
    expect(extractText(node)).toBeUndefined();
  });
});

describe("extractImageRef", () => {
  it("extracts ref from AttachmentNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'attachment',
      position: { x: 0, y: 0 },
      data: { label: 'test.png', path: '/test.png', mimeType: 'image/png', previewUrl: 'url' },
    };
    const ref = extractImageRef(node);
    expect(ref).toBeDefined();
    expect(ref?.id).toBe('1');
    expect(ref?.name).toBe('test.png');
    expect(ref?.path).toBe('/test.png');
    expect(ref?.mime).toBe('image/png');
  });

  it("extracts ref from GeneratorNode with image output", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'generator',
      position: { x: 0, y: 0 },
      data: { 
        provider: 'nano-banana' as const,
        medium: 'image' as const,
        prompt: '',
        aspectRatio: '1:1',
        outputPath: '/output.png',
        outputType: 'image',
        artifactName: 'generated.png',
      },
    };
    const ref = extractImageRef(node);
    expect(ref).toBeDefined();
    expect(ref?.path).toBe('/output.png');
    expect(ref?.name).toBe('generated.png');
  });

  it("returns undefined for GeneratorNode without output", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'generator',
      position: { x: 0, y: 0 },
      data: { 
        provider: 'nano-banana' as const,
        medium: 'image' as const,
        prompt: '',
        aspectRatio: '1:1',
      },
    };
    expect(extractImageRef(node)).toBeUndefined();
  });

  it("returns undefined for PromptNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'prompt',
      position: { x: 0, y: 0 },
      data: { prompt: '' },
    };
    expect(extractImageRef(node)).toBeUndefined();
  });
});

describe("extractAspectRatio", () => {
  it("extracts from ModelNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'model',
      position: { x: 0, y: 0 },
      data: { provider: 'veo-3-1' as const, medium: 'video' as const, aspectRatio: '16:9' },
    };
    expect(extractAspectRatio(node)).toBe('16:9');
  });

  it("extracts from GeneratorNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'generator',
      position: { x: 0, y: 0 },
      data: { provider: 'nano-banana' as const, medium: 'image' as const, prompt: '', aspectRatio: '9:16' },
    };
    expect(extractAspectRatio(node)).toBe('9:16');
  });

  it("returns undefined for AttachmentNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'attachment',
      position: { x: 0, y: 0 },
      data: { label: 'test', path: '/test.png', mimeType: 'image/png', previewUrl: 'url' },
    };
    expect(extractAspectRatio(node)).toBeUndefined();
  });
});

describe("extractProvider", () => {
  it("extracts from ModelNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'model',
      position: { x: 0, y: 0 },
      data: { provider: 'veo-3-1' as const, medium: 'video' as const, aspectRatio: '16:9' },
    };
    expect(extractProvider(node)).toBe('veo-3-1');
  });

  it("extracts from GeneratorNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'generator',
      position: { x: 0, y: 0 },
      data: { provider: 'sora-2' as const, medium: 'video' as const, prompt: '', aspectRatio: '1:1' },
    };
    expect(extractProvider(node)).toBe('sora-2');
  });

  it("returns undefined for PromptNode", () => {
    const node: CanvasNode = {
      id: '1',
      type: 'prompt',
      position: { x: 0, y: 0 },
      data: { prompt: '' },
    };
    expect(extractProvider(node)).toBeUndefined();
  });
});

describe("resolveGeneratorInputs", () => {
  const createPromptNode = (id: string, prompt: string): CanvasNode => ({
    id,
    type: 'prompt',
    position: { x: 0, y: 0 },
    data: { prompt },
  });

  const createGeneratorNode = (id: string, prompt: string, provider: string = 'nano-banana'): CanvasNode => ({
    id,
    type: 'generator',
    position: { x: 100, y: 0 },
    data: { 
      provider: provider as 'nano-banana' | 'veo-3-1' | 'sora-2',
      medium: 'image',
      prompt,
      aspectRatio: '1:1',
    },
  });

  it("resolves prompt from connected PromptNode", () => {
    const nodes = [
      createPromptNode('prompt-1', 'connected prompt'),
      createGeneratorNode('gen-1', 'local prompt'),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'prompt-1', target: 'gen-1', targetHandle: 'prompt', type: 'default' },
    ];
    
    const resolved = resolveGeneratorInputs('gen-1', nodes, edges);
    expect(resolved.prompt).toBe('connected prompt');
  });

  it("falls back to local prompt when disconnected", () => {
    const nodes = [
      createPromptNode('prompt-1', 'disconnected prompt'),
      createGeneratorNode('gen-1', 'local prompt'),
    ];
    const edges: Edge[] = [];
    
    const resolved = resolveGeneratorInputs('gen-1', nodes, edges);
    expect(resolved.prompt).toBe('local prompt');
  });

  it("resolves negative prompt from connected NegativeNode", () => {
    const negNode: CanvasNode = {
      id: 'neg-1',
      type: 'negative',
      position: { x: 0, y: 0 },
      data: { negativePrompt: 'blur, noisy' },
    };
    const genNode = createGeneratorNode('gen-1', 'prompt');
    const nodes = [negNode, genNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'neg-1', target: 'gen-1', targetHandle: 'negative', type: 'default' },
    ];
    
    const resolved = resolveGeneratorInputs('gen-1', nodes, edges);
    expect(resolved.negativePrompt).toBe('blur, noisy');
  });

  it("accumulates multiple refs from connected nodes", () => {
    const att1: CanvasNode = {
      id: 'att-1',
      type: 'attachment',
      position: { x: 0, y: 0 },
      data: { label: 'ref1.png', path: '/ref1.png', mimeType: 'image/png', previewUrl: 'url1' },
    };
    const att2: CanvasNode = {
      id: 'att-2',
      type: 'attachment',
      position: { x: 0, y: 0 },
      data: { label: 'ref2.png', path: '/ref2.png', mimeType: 'image/png', previewUrl: 'url2' },
    };
    const genNode = createGeneratorNode('gen-1', 'prompt');
    const nodes = [att1, att2, genNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'att-1', target: 'gen-1', targetHandle: 'ref', type: 'default' },
      { id: 'e2', source: 'att-2', target: 'gen-1', targetHandle: 'ref', type: 'default' },
    ];
    
    const resolved = resolveGeneratorInputs('gen-1', nodes, edges);
    expect(resolved.refs).toHaveLength(2);
    expect(resolved.refs[0].id).toBe('att-1');
    expect(resolved.refs[1].id).toBe('att-2');
  });

  it("resolves aspect ratio from connected ModelNode", () => {
    const modelNode: CanvasNode = {
      id: 'model-1',
      type: 'model',
      position: { x: 0, y: 0 },
      data: { provider: 'veo-3-1' as const, medium: 'video' as const, aspectRatio: '16:9' },
    };
    const genNode: CanvasNode = {
      id: 'gen-1',
      type: 'generator',
      position: { x: 100, y: 0 },
      data: { provider: 'nano-banana' as const, medium: 'image' as const, prompt: '', aspectRatio: '1:1' },
    };
    const nodes = [modelNode, genNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'model-1', target: 'gen-1', targetHandle: 'aspect', type: 'default' },
    ];
    
    const resolved = resolveGeneratorInputs('gen-1', nodes, edges);
    expect(resolved.aspectRatio).toBe('16:9');
  });

  it("resolves provider from connected ModelNode", () => {
    const modelNode: CanvasNode = {
      id: 'model-1',
      type: 'model',
      position: { x: 0, y: 0 },
      data: { provider: 'veo-3-1' as const, medium: 'video' as const, aspectRatio: '16:9' },
    };
    const genNode: CanvasNode = {
      id: 'gen-1',
      type: 'generator',
      position: { x: 100, y: 0 },
      data: { provider: 'nano-banana' as const, medium: 'image' as const, prompt: '', aspectRatio: '1:1' },
    };
    const nodes = [modelNode, genNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'model-1', target: 'gen-1', targetHandle: 'provider', type: 'default' },
    ];
    
    const resolved = resolveGeneratorInputs('gen-1', nodes, edges);
    expect(resolved.provider).toBe('veo-3-1');
  });

  it("resolves firstFrame from connected AttachmentNode", () => {
    const attNode: CanvasNode = {
      id: 'att-1',
      type: 'attachment',
      position: { x: 0, y: 0 },
      data: { label: 'first.png', path: '/first.png', mimeType: 'image/png', previewUrl: 'url' },
    };
    const genNode: CanvasNode = {
      id: 'gen-1',
      type: 'generator',
      position: { x: 100, y: 0 },
      data: { 
        provider: 'veo-3-1' as const,
        medium: 'video' as const,
        prompt: '',
        aspectRatio: '16:9',
      },
    };
    const nodes = [attNode, genNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'att-1', target: 'gen-1', targetHandle: 'firstFrame', type: 'default' },
    ];
    
    const resolved = resolveGeneratorInputs('gen-1', nodes, edges);
    expect(resolved.firstFrame).toBeDefined();
    expect(resolved.firstFrame?.path).toBe('/first.png');
  });

  it("resolves lastFrame from connected AttachmentNode", () => {
    const attNode: CanvasNode = {
      id: 'att-1',
      type: 'attachment',
      position: { x: 0, y: 0 },
      data: { label: 'last.png', path: '/last.png', mimeType: 'image/png', previewUrl: 'url' },
    };
    const genNode: CanvasNode = {
      id: 'gen-1',
      type: 'generator',
      position: { x: 100, y: 0 },
      data: { 
        provider: 'veo-3-1' as const,
        medium: 'video' as const,
        prompt: '',
        aspectRatio: '16:9',
      },
    };
    const nodes = [attNode, genNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'att-1', target: 'gen-1', targetHandle: 'lastFrame', type: 'default' },
    ];
    
    const resolved = resolveGeneratorInputs('gen-1', nodes, edges);
    expect(resolved.lastFrame).toBeDefined();
    expect(resolved.lastFrame?.path).toBe('/last.png');
  });

  it("handles missing source nodes gracefully", () => {
    const genNode = createGeneratorNode('gen-1', 'prompt');
    const nodes = [genNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'missing-node', target: 'gen-1', targetHandle: 'prompt', type: 'default' },
    ];
    
    const resolved = resolveGeneratorInputs('gen-1', nodes, edges);
    expect(resolved.prompt).toBe('prompt');
  });

  it("returns defaults for non-generator nodes", () => {
    const promptNode: CanvasNode = {
      id: 'prompt-1',
      type: 'prompt',
      position: { x: 0, y: 0 },
      data: { prompt: '' },
    };
    const nodes = [promptNode];
    const edges: Edge[] = [];
    
    const resolved = resolveGeneratorInputs('prompt-1', nodes, edges);
    expect(resolved.prompt).toBe('');
    expect(resolved.aspectRatio).toBe('1:1');
    expect(resolved.provider).toBe('nano-banana');
  });
});
