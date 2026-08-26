import { describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import {
  normalizeWorkflowSnapshot,
  serializeForBroadcast,
  serializeWorkflowSnapshot,
} from './workflowSerialization';

const buildNode = (overrides: Partial<StudioNode> = {}): StudioNode => ({
  id: 'node-1',
  type: 'string',
  position: { x: 0, y: 0 },
  data: {
    value: 'hello',
    isExecuting: true,
    isComplete: true,
    error: 'boom',
    executionTime: 12,
    isToolbarVisible: true,
  },
  ...overrides,
});

const buildEdge = (overrides: Partial<Edge> = {}): Edge => ({
  id: 'edge-1',
  source: 'node-1',
  target: 'node-2',
  sourceHandle: 'text',
  targetHandle: 'prompt',
  data: { dataType: 'text' },
  ...overrides,
});

describe('workflowSerialization', () => {
  it('strips runtime fields from node data on serialize', () => {
    const snapshot = serializeWorkflowSnapshot(
      [buildNode(), buildNode({ id: 'node-2', data: { value: 'world' } })],
      [buildEdge({ source: 'node-1', target: 'node-2' })],
      'bezier',
    );

    const firstNode = snapshot.nodes[0];
    expect(firstNode.data).toEqual({ value: 'hello' });
  });

  it('preserves the generation signature across persist and broadcast serialization', () => {
    // The signature gates reuse-vs-regenerate on load; its delimiters must keep it
    // from matching the base64 strip so it survives a save/reload round-trip.
    const sig = 'sig1:nanoGen|positivePrompt=a prompt|model=nano-banana|refs()';
    const node = buildNode({
      id: 'gen',
      type: 'nanoGen',
      data: { positivePrompt: 'a prompt', model: 'nano-banana', generationSignature: sig },
    });

    const persisted = serializeWorkflowSnapshot([node], [], 'bezier');
    const broadcast = serializeForBroadcast([node], [], 'bezier');

    expect((persisted.nodes[0].data as Record<string, unknown>).generationSignature).toBe(sig);
    expect((broadcast.nodes[0].data as Record<string, unknown>).generationSignature).toBe(sig);
  });

  it('preserves brandBookPieces across persist serialization', () => {
    const node = buildNode({
      id: 'gen',
      type: 'nanoGen',
      data: {
        positivePrompt: 'a prompt',
        model: 'nano-banana',
        brandBookPieces: ['colors', 'voice'],
      },
    });

    const persisted = serializeWorkflowSnapshot([node], [], 'bezier');

    expect((persisted.nodes[0].data as Record<string, unknown>).brandBookPieces).toEqual([
      'colors',
      'voice',
    ]);
  });

  it('drops edges referencing missing nodes', () => {
    const snapshot = normalizeWorkflowSnapshot(
      {
        nodes: [buildNode({ id: 'node-1' })],
        edges: [
          buildEdge({ source: 'node-1', target: 'node-2' }),
          buildEdge({ source: 'node-2', target: 'node-1' }),
        ],
      },
      'bezier',
    );

    expect(snapshot.edges).toHaveLength(0);
  });

  it('normalizes edge data defaults when serializing', () => {
    const snapshot = serializeWorkflowSnapshot(
      [buildNode({ id: 'node-1' }), buildNode({ id: 'node-2', data: { value: 'ok' } })],
      [buildEdge({ source: 'node-1', target: 'node-2', data: {} })],
      'smoothstep',
    );

    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.edges).toHaveLength(1);
    expect(snapshot.edges[0].data).toEqual(expect.objectContaining({ pathType: 'smoothstep' }));
  });

  it('strips base64 payloads from saved node data', () => {
    const dataUrl = 'data:image/png;base64,abc123';
    const snapshot = serializeWorkflowSnapshot(
      [
        buildNode({
          id: 'img',
          type: 'image',
          data: {
            image: dataUrl,
            fileName: 'img.png',
            sourcePath: 'brand-assets/img.png',
            sourceUrl: 'https://cdn.continuum.test/img.png',
          } as any,
        }),
        buildNode({
          id: 'doc',
          type: 'document',
          data: {
            documents: [
              { name: 'doc.pdf', content: 'data:application/pdf;base64,abc', type: 'pdf' },
            ],
          } as any,
        }),
        buildNode({
          id: 'string',
          data: {
            value: 'hello',
            inputs: [
              { type: 'image', src: dataUrl },
              { type: 'text', src: 'Keep me' },
            ],
          } as any,
        }),
        buildNode({
          id: 'video-gen',
          type: 'video-gen',
          data: {
            model: 'veo-3.1',
            prompt: '',
            enhancePrompt: false,
            frameList: [{ id: 'f1', src: dataUrl, type: 'image' }],
          } as any,
        }),
        buildNode({
          id: 'video-ref',
          type: 'video',
          data: {
            video: 'data:video/mp4;base64,video123',
            fileName: 'clip.mp4',
            sourcePath: 'brand-assets/clip.mp4',
            sourceUrl: 'https://cdn.continuum.test/clip.mp4',
          } as any,
        }),
      ],
      [],
      'bezier',
    );

    const imageNode = snapshot.nodes.find((node) => node.id === 'img');
    expect((imageNode?.data as any)?.image).toBeUndefined();
    expect((imageNode?.data as any)?.sourcePath).toBe('brand-assets/img.png');
    expect((imageNode?.data as any)?.sourceUrl).toBe('https://cdn.continuum.test/img.png');

    const documentNode = snapshot.nodes.find((node) => node.id === 'doc');
    expect((documentNode?.data as any)?.documents?.[0]?.content).toBe('');

    const stringNode = snapshot.nodes.find((node) => node.id === 'string');
    expect((stringNode?.data as any)?.inputs).toEqual([{ type: 'text', src: 'Keep me' }]);

    const videoNode = snapshot.nodes.find((node) => node.id === 'video-gen');
    expect((videoNode?.data as any)?.frameList?.[0]?.src).toBeUndefined();

    const videoReferenceNode = snapshot.nodes.find((node) => node.id === 'video-ref');
    expect((videoReferenceNode?.data as any)?.video).toBeUndefined();
    expect((videoReferenceNode?.data as any)?.sourcePath).toBe('brand-assets/clip.mp4');
    expect((videoReferenceNode?.data as any)?.sourceUrl).toBe(
      'https://cdn.continuum.test/clip.mp4',
    );
  });

  it('strips complex data URLs with extra parameters', () => {
    const complexDataUrl = 'data:image/png;name=test.png;base64,abc123';
    const snapshot = serializeWorkflowSnapshot(
      [buildNode({ id: 'img', type: 'image', data: { image: complexDataUrl } as any })],
      [],
      'bezier',
    );
    expect((snapshot.nodes[0].data as any).image).toBeUndefined();
  });

  it('strips all generated output fields including signed URLs, preserves durable storage paths', () => {
    const snapshot = serializeWorkflowSnapshot(
      [
        buildNode({
          id: 'gen',
          type: 'nanoGen',
          data: {
            model: 'nano-banana',
            positivePrompt: 'hero shot',
            generatedImage: 'data:image/png;base64,strip-base64',
            generatedImageUrl: 'https://signed.supabase.co/generated.png',
            generatedImageStoragePath: 'brand-assets/generated.png',
            generatedImageBucket: 'brand-profile-assets',
            image: 'data:image/png;base64,strip-input-image',
          } as any,
        }),
      ],
      [],
      'bezier',
    );

    const generatorNode = snapshot.nodes.find((node) => node.id === 'gen');
    expect((generatorNode?.data as any)?.generatedImage).toBeUndefined();
    expect((generatorNode?.data as any)?.generatedImageUrl).toBeUndefined();
    expect((generatorNode?.data as any)?.generatedImageStoragePath).toBe(
      'brand-assets/generated.png',
    );
    expect((generatorNode?.data as any)?.generatedImageBucket).toBe('brand-profile-assets');
    expect((generatorNode?.data as any)?.image).toBeUndefined();
  });

  it('strips base64 and signed URL generated fields for both image and video nodes', () => {
    const snapshot = serializeWorkflowSnapshot(
      [
        buildNode({
          id: 'gen',
          type: 'nanoGen',
          data: {
            model: 'nano-banana',
            positivePrompt: '',
            generatedImage: 'data:image/png;base64,base64-payload',
            generatedImageUrl: 'https://cdn.example.com/generated.png',
            generatedImageStoragePath: 'brand-assets/generated.png',
            generatedImageBucket: 'brand-profile-assets',
          } as any,
        }),
        buildNode({
          id: 'video-gen',
          type: 'videoGen',
          data: {
            model: 'veo-3.1',
            prompt: '',
            enhancePrompt: false,
            generatedVideo: 'data:video/mp4;base64,base64-video-payload',
            generatedVideoUrl: 'https://cdn.example.com/generated.mp4',
            generatedVideoStoragePath: 'brand-assets/generated.mp4',
            generatedVideoBucket: 'brand-profile-assets',
          } as any,
        }),
      ],
      [],
      'bezier',
    );

    const imageGenNode = snapshot.nodes.find((node) => node.id === 'gen');
    expect((imageGenNode?.data as any)?.generatedImage).toBeUndefined();
    expect((imageGenNode?.data as any)?.generatedImageUrl).toBeUndefined();
    expect((imageGenNode?.data as any)?.generatedImageStoragePath).toBe(
      'brand-assets/generated.png',
    );
    expect((imageGenNode?.data as any)?.generatedImageBucket).toBe('brand-profile-assets');

    const videoGenNode = snapshot.nodes.find((node) => node.id === 'video-gen');
    expect((videoGenNode?.data as any)?.generatedVideo).toBeUndefined();
    expect((videoGenNode?.data as any)?.generatedVideoUrl).toBeUndefined();
    expect((videoGenNode?.data as any)?.generatedVideoStoragePath).toBe(
      'brand-assets/generated.mp4',
    );
    expect((videoGenNode?.data as any)?.generatedVideoBucket).toBe('brand-profile-assets');
  });

  it('preserves style and dimensions during serialization', () => {
    const snapshot = serializeWorkflowSnapshot(
      [
        buildNode({
          id: 'nano',
          type: 'nanoGen',
          style: { width: 400, height: 400 },
          measured: { width: 392, height: 398 },
          width: undefined,
          height: undefined,
          data: { model: 'nano-banana', positivePrompt: '', aspectRatio: '16:9' } as any,
        }),
      ],
      [],
      'bezier',
    );

    expect(snapshot.nodes[0].style).toEqual({ width: 400, height: 400 });
    expect(snapshot.nodes[0].width).toBe(392);
    expect(snapshot.nodes[0].height).toBe(398);
  });

  it('persist mode strips expiring signed URLs but keeps durable storage pointers', () => {
    const node = buildNode({
      id: 'gen',
      type: 'nanoGen',
      data: {
        generatedImage: 'https://x.supabase.co/sign/a.png?token=t',
        generatedImageUrl: 'https://x.supabase.co/sign/a.png?token=t',
        generatedImageStoragePath: 'brand/a.png',
        generatedImageBucket: 'brand-profile-assets',
      },
    });
    const snapshot = serializeWorkflowSnapshot([node], [], 'bezier');
    const data = snapshot.nodes[0].data as Record<string, unknown>;
    expect(data.generatedImageUrl).toBeUndefined();
    expect(data.generatedImage).toBeUndefined();
    expect(data.generatedImageStoragePath).toBe('brand/a.png');
    expect(data.generatedImageBucket).toBe('brand-profile-assets');
  });

  it('broadcast mode keeps signed URLs (and durable pointers) but still drops base64', () => {
    const node = buildNode({
      id: 'gen',
      type: 'nanoGen',
      data: {
        generatedImage: 'https://x.supabase.co/sign/a.png?token=t',
        generatedImageUrl: 'https://x.supabase.co/sign/a.png?token=t',
        generatedImageStoragePath: 'brand/a.png',
        generatedImageBucket: 'brand-profile-assets',
      },
    });
    const snapshot = serializeForBroadcast([node], [], 'bezier');
    const data = snapshot.nodes[0].data as Record<string, unknown>;
    expect(data.generatedImageUrl).toBe('https://x.supabase.co/sign/a.png?token=t');
    expect(data.generatedImage).toBe('https://x.supabase.co/sign/a.png?token=t');
    expect(data.generatedImageStoragePath).toBe('brand/a.png');
  });

  it('broadcast mode still strips inline base64 (avoids WS 1009)', () => {
    const node = buildNode({
      id: 'ref',
      type: 'image',
      data: {
        image: 'data:image/png;base64,' + 'A'.repeat(64),
        sourcePath: 'brand/ref.png',
        bucket: 'media-library',
      },
    });
    const snapshot = serializeForBroadcast([node], [], 'bezier');
    const data = snapshot.nodes[0].data as Record<string, unknown>;
    expect(data.image).toBeUndefined();
    expect(data.sourcePath).toBe('brand/ref.png');
    expect(data.bucket).toBe('media-library');
  });

  it('preserves a sha256 contractHash across persist and broadcast serialization', () => {
    // A hex digest is a strict subset of the base64 alphabet, so the encoded-payload
    // heuristic used to eat it. ApiRenderBlock early-returns without contractHash, so
    // losing it on save left render/save-set/batch silently dead after a reload.
    const digest = '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881';
    const nestedDigest = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    const node = buildNode({
      id: 'api-render',
      type: 'apiRender',
      data: {
        templateKey: '166',
        contractHash: digest,
        delivery: { assetChecksum: nestedDigest },
      } as any,
    });

    const persisted = serializeWorkflowSnapshot([node], [], 'bezier');
    const broadcast = serializeForBroadcast([node], [], 'bezier');

    for (const data of [persisted.nodes[0].data, broadcast.nodes[0].data] as any[]) {
      expect(data.contractHash).toBe(digest);
      expect(data.delivery?.assetChecksum).toBe(nestedDigest);
    }
  });

  it('strips a bare base64 payload with no data: prefix in both modes', () => {
    // The narrowed branch still has to fire: real base64 draws on the full 64-symbol
    // alphabet, which a digest never does.
    const payload = `${'AbC+/9zZ'.repeat(24)}==`;
    const node = buildNode({
      id: 'ref',
      type: 'image',
      data: { image: payload, sourcePath: 'brand/ref.png' } as any,
    });

    const persisted = serializeWorkflowSnapshot([node], [], 'bezier');
    const broadcast = serializeForBroadcast([node], [], 'bezier');

    for (const data of [persisted.nodes[0].data, broadcast.nodes[0].data] as any[]) {
      expect(data.image).toBeUndefined();
      expect(data.sourcePath).toBe('brand/ref.png');
    }
  });
});
