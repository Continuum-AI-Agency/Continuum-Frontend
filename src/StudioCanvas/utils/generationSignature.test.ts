import { describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import { computeGenerationSignature, isSignatureTracked, nodeIsStale } from './generationSignature';

const nano = (id: string, data: Record<string, unknown>): StudioNode => ({
  id,
  position: { x: 0, y: 0 },
  type: 'nanoGen',
  data: { model: 'nano-banana', positivePrompt: 'a prompt', ...data },
});

const lookup = (...nodes: StudioNode[]) => new Map(nodes.map((n) => [n.id, n]));

describe('computeGenerationSignature', () => {
  it('is stable across calls with identical inputs', () => {
    const node = nano('n', {});
    const a = computeGenerationSignature(node, [], lookup(node));
    const b = computeGenerationSignature(node, [], lookup(node));
    expect(a).toBe(b);
    expect(a.startsWith('sig2:')).toBe(true);
  });

  it('changes when a generation setting changes (prompt, model)', () => {
    const base = nano('n', {});
    const prompt = nano('n', { positivePrompt: 'different' });
    const model = nano('n', { model: 'nano-banana-pro' });
    const sig = (node: StudioNode) => computeGenerationSignature(node, [], lookup(node));
    expect(sig(base)).not.toBe(sig(prompt));
    expect(sig(base)).not.toBe(sig(model));
  });

  it('treats skillIds as an order-independent set', () => {
    const ab = nano('n', { skillIds: ['a', 'b'] });
    const ba = nano('n', { skillIds: ['b', 'a'] });
    const abc = nano('n', { skillIds: ['a', 'b', 'c'] });
    const sig = (node: StudioNode) => computeGenerationSignature(node, [], lookup(node));
    expect(sig(ab)).toBe(sig(ba));
    expect(sig(ab)).not.toBe(sig(abc));
  });

  it('changes when negative prompt or brand-book grounding changes', () => {
    const base = nano('n', { negativePrompt: 'text', brandBookPieces: ['colors'] });
    const negative = nano('n', { negativePrompt: 'watermark', brandBookPieces: ['colors'] });
    const brand = nano('n', { negativePrompt: 'text', brandBookPieces: ['typography'] });
    const sig = (node: StudioNode) => computeGenerationSignature(node, [], lookup(node));
    expect(sig(base)).not.toBe(sig(negative));
    expect(sig(base)).not.toBe(sig(brand));
  });

  it('changes when the input wiring changes (different source / rewire)', () => {
    const target = nano('t', {});
    const srcA = nano('a', {});
    const srcB = nano('b', {});
    const edgeFromA: Edge[] = [
      { id: 'e', source: 'a', sourceHandle: 'image', target: 't', targetHandle: 'ref-image' },
    ];
    const edgeFromB: Edge[] = [
      { id: 'e', source: 'b', sourceHandle: 'image', target: 't', targetHandle: 'ref-image' },
    ];
    const sigA = computeGenerationSignature(target, edgeFromA, lookup(target, srcA, srcB));
    const sigB = computeGenerationSignature(target, edgeFromB, lookup(target, srcA, srcB));
    const sigNone = computeGenerationSignature(target, [], lookup(target));
    expect(sigA).not.toBe(sigB);
    expect(sigA).not.toBe(sigNone);
  });

  it('folds the value of a connected text source into the signature', () => {
    const target = nano('t', {});
    const strOld: StudioNode = {
      id: 's',
      position: { x: 0, y: 0 },
      type: 'string',
      data: { value: 'old text' },
    };
    const strNew: StudioNode = {
      id: 's',
      position: { x: 0, y: 0 },
      type: 'string',
      data: { value: 'new text' },
    };
    const edges: Edge[] = [
      { id: 'e', source: 's', sourceHandle: 'text', target: 't', targetHandle: 'prompt' },
    ];
    const sigOld = computeGenerationSignature(target, edges, lookup(target, strOld));
    const sigNew = computeGenerationSignature(target, edges, lookup(target, strNew));
    expect(sigOld).not.toBe(sigNew);
  });

  it("is unchanged when only an upstream media source's output changes (cascade handles that, not the signature)", () => {
    const target = nano('t', {});
    const srcContentA: StudioNode = nano('a', { generatedImage: 'data:image/png;base64,AAAA' });
    const srcContentB: StudioNode = nano('a', { generatedImage: 'data:image/png;base64,BBBB' });
    const edges: Edge[] = [
      { id: 'e', source: 'a', sourceHandle: 'image', target: 't', targetHandle: 'ref-image' },
    ];
    const sigA = computeGenerationSignature(target, edges, lookup(target, srcContentA));
    const sigB = computeGenerationSignature(target, edges, lookup(target, srcContentB));
    expect(sigA).toBe(sigB);
  });

  it('changes when a media node keeps its id but points at a different durable asset', () => {
    const target = nano('t', {});
    const refA: StudioNode = {
      id: 'ref',
      type: 'image',
      position: { x: 0, y: 0 },
      data: { assetId: 'asset-a' },
    };
    const refB: StudioNode = {
      id: 'ref',
      type: 'image',
      position: { x: 0, y: 0 },
      data: { assetId: 'asset-b' },
    };
    const edges: Edge[] = [
      { id: 'e', source: 'ref', sourceHandle: 'image', target: 't', targetHandle: 'ref-image' },
    ];
    expect(computeGenerationSignature(target, edges, lookup(target, refA))).not.toBe(
      computeGenerationSignature(target, edges, lookup(target, refB)),
    );
  });
});

describe('isSignatureTracked', () => {
  it('tracks generator nodes with knobs and not special media nodes', () => {
    expect(isSignatureTracked('nanoGen')).toBe(true);
    expect(isSignatureTracked('videoGen')).toBe(true);
    expect(isSignatureTracked('veoFast')).toBe(true);
    expect(isSignatureTracked('extendVideo')).toBe(false);
    expect(isSignatureTracked('timelineEditor')).toBe(false);
    expect(isSignatureTracked('image')).toBe(false);
    expect(isSignatureTracked(undefined)).toBe(false);
  });
});

describe('nodeIsStale', () => {
  it('is false when no signature was stored (legacy / never generated with this feature)', () => {
    const node = nano('n', { generatedImage: 'data:image/png;base64,x' });
    expect(nodeIsStale(node, [], lookup(node))).toBe(false);
  });

  it('is false when the stored signature still matches current settings', () => {
    const node = nano('n', {});
    const sig = computeGenerationSignature(node, [], lookup(node));
    const stamped = nano('n', { generationSignature: sig });
    expect(nodeIsStale(stamped, [], lookup(stamped))).toBe(false);
  });

  it('is true when settings changed since the stored signature', () => {
    const old = nano('n', { positivePrompt: 'OLD' });
    const sig = computeGenerationSignature(old, [], lookup(old));
    const edited = nano('n', { positivePrompt: 'NEW', generationSignature: sig });
    expect(nodeIsStale(edited, [], lookup(edited))).toBe(true);
  });

  // Bug #221: the sig1 -> sig2 bump added `negativePrompt` and `brandBookPieces`
  // to nanoGen's recipe. Every node stamped before the bump then looked edited,
  // so running a video regenerated the untouched image feeding it. A stored
  // signature must be judged against the recipe of ITS OWN version.
  describe('signature-version tolerance', () => {
    const SIG1_NANO_FIELDS = [
      'positivePrompt',
      'model',
      'aspectRatio',
      'imageSize',
      'stylePreset',
      'skillIds',
      'seed',
      'steps',
      'guidance',
      'scheduler',
      'promptEnhancement',
    ];

    // Reproduces exactly what the sig1 build wrote to `generationSignature`.
    const sig1SignatureFor = (node: StudioNode): string => {
      const data = node.data as Record<string, unknown>;
      const own = SIG1_NANO_FIELDS.map(
        (field) => `${field}=${data[field] === undefined ? '' : String(data[field])}`,
      ).join('|');
      return `sig1:nanoGen|${own}|refs()`;
    };

    it('is NOT stale when an unedited node still carries its sig1 signature', () => {
      const node = nano('n', { generatedImage: 'data:image/png;base64,x' });
      const stamped = nano('n', {
        generatedImage: 'data:image/png;base64,x',
        generationSignature: sig1SignatureFor(node),
      });
      expect(stamped.data.generationSignature).toStartWith('sig1:');
      // The old rule was a raw string compare against the CURRENT signature. This
      // asserts that rule would have called an untouched node stale — so the test
      // below is load-bearing, not vacuously green.
      expect(stamped.data.generationSignature).not.toBe(
        computeGenerationSignature(stamped, [], lookup(stamped)),
      );
      expect(nodeIsStale(stamped, [], lookup(stamped))).toBe(false);
    });

    it('is still stale when a sig1-stamped node was genuinely edited', () => {
      const old = nano('n', { positivePrompt: 'OLD' });
      const edited = nano('n', {
        positivePrompt: 'NEW',
        generationSignature: sig1SignatureFor(old),
      });
      expect(nodeIsStale(edited, [], lookup(edited))).toBe(true);
    });

    it('re-stamps at the CURRENT version, never at the stored one', () => {
      const node = nano('n', {});
      expect(computeGenerationSignature(node, [], lookup(node))).toStartWith('sig2:');
    });

    it('is not stale when the signature came from a version this build cannot read', () => {
      const node = nano('n', { generationSignature: 'sig9:from-a-newer-build' });
      expect(nodeIsStale(node, [], lookup(node))).toBe(false);
    });
  });

  it('is false for non-tracked node types even with a mismatched signature', () => {
    const node: StudioNode = {
      id: 'n',
      position: { x: 0, y: 0 },
      type: 'extendVideo',
      data: { prompt: 'now different', generationSignature: 'sig1:stale' },
    };
    expect(nodeIsStale(node, [], lookup(node))).toBe(false);
  });
});
