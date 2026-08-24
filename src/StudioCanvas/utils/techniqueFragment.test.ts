import { describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import {
  inferTechniquePorts,
  MAX_TECHNIQUE_PORTS,
  suggestTechniqueKind,
} from './techniqueFragment';

const node = (id: string, type: string, x = 0, y = 0): StudioNode =>
  ({ id, type, position: { x, y }, data: {} }) as unknown as StudioNode;

const edge = (id: string, source: string, target: string, handles?: Partial<Edge>): Edge =>
  ({ id, source, target, ...handles }) as Edge;

describe('inferTechniquePorts', () => {
  it('turns an inbound boundary edge into a typed input port', () => {
    const generator = node('gen', 'nanoGen');
    const outside = node('ref', 'image');

    const { inputPorts } = inferTechniquePorts(
      [generator],
      [edge('e1', outside.id, generator.id, { targetHandle: 'ref-image' })],
    );

    expect(inputPorts.find((port) => port.origin === 'edge')).toMatchObject({
      nodeRef: 'gen',
      handleId: 'ref-image',
      dataType: 'image',
      label: 'Reference image',
    });
    // The generator's own required prompt is still open, and ports on one node
    // are ordered by handle, so the wired reference is the second id.
    expect(inputPorts.map((port) => [port.id, port.handleId])).toEqual([
      ['in-1', 'prompt'],
      ['in-2', 'ref-image'],
    ]);
  });

  it('turns an outbound boundary edge into an output port', () => {
    const prompt = node('prompt', 'string');
    const outside = node('gen', 'nanoGen');

    const { outputPorts } = inferTechniquePorts(
      [prompt],
      [edge('e1', prompt.id, outside.id, { sourceHandle: 'text', targetHandle: 'prompt' })],
    );

    expect(outputPorts).toEqual([
      {
        id: 'out-1',
        nodeRef: 'prompt',
        handleId: 'text',
        dataType: 'text',
        label: 'Text',
        origin: 'edge',
      },
    ]);
  });

  it('ignores edges wholly inside the selection', () => {
    const prompt = node('prompt', 'string', 0, 0);
    const generator = node('gen', 'nanoGen', 400, 0);

    const { inputPorts, outputPorts } = inferTechniquePorts(
      [prompt, generator],
      [edge('e1', prompt.id, generator.id, { sourceHandle: 'text', targetHandle: 'prompt' })],
    );

    expect(inputPorts.some((port) => port.origin === 'edge')).toBe(false);
    // The generator still terminates the selection, so its image output stands.
    expect(outputPorts).toEqual([
      {
        id: 'out-1',
        nodeRef: 'gen',
        handleId: 'image',
        dataType: 'image',
        label: 'Image',
        origin: 'terminal',
      },
    ]);
  });

  it('reports a required handle nothing is wired into as an open input', () => {
    const { inputPorts } = inferTechniquePorts([node('gen', 'nanoGen')], []);

    expect(inputPorts).toEqual([
      {
        id: 'in-1',
        nodeRef: 'gen',
        handleId: 'prompt',
        dataType: 'text',
        label: 'Prompt',
        origin: 'open',
      },
    ]);
  });

  it('does not repeat an open input once an edge already fills it', () => {
    const generator = node('gen', 'nanoGen');
    const { inputPorts } = inferTechniquePorts(
      [generator],
      [edge('e1', 'outside', generator.id, { targetHandle: 'prompt' })],
    );

    expect(inputPorts).toHaveLength(1);
    expect(inputPorts[0]?.origin).toBe('edge');
  });

  it('does not call a producer terminal when anything downstream is wired', () => {
    const generator = node('gen', 'nanoGen');
    const { outputPorts } = inferTechniquePorts(
      [generator],
      [edge('e1', generator.id, 'outside', { sourceHandle: 'image' })],
    );

    expect(outputPorts).toHaveLength(1);
    expect(outputPorts[0]?.origin).toBe('edge');
  });

  it('caps each side at the schema maximum and says it truncated', () => {
    const selection = Array.from({ length: MAX_TECHNIQUE_PORTS + 1 }, (_, index) =>
      node(`s${index}`, 'string', index * 100),
    );
    const edges = selection.map((entry, index) =>
      edge(`e${index}`, 'outside', entry.id, { targetHandle: 'image' }),
    );

    const { inputPorts, truncated } = inferTechniquePorts(selection, edges);

    expect(inputPorts).toHaveLength(MAX_TECHNIQUE_PORTS);
    expect(truncated).toBe(true);
    // Ports are numbered in the kept order, never in the input order.
    expect(inputPorts.map((port) => port.id)).toEqual(
      Array.from({ length: MAX_TECHNIQUE_PORTS }, (_, index) => `in-${index + 1}`),
    );
  });

  it('terminates on a cycle inside the selection and emits no port for it', () => {
    const a = node('a', 'string', 0);
    const b = node('b', 'string', 100);

    const { inputPorts, outputPorts } = inferTechniquePorts(
      [a, b],
      [
        edge('e1', 'a', 'b', { sourceHandle: 'text', targetHandle: 'image' }),
        edge('e2', 'b', 'a', { sourceHandle: 'text', targetHandle: 'image' }),
      ],
    );

    expect(inputPorts).toEqual([]);
    expect(outputPorts).toEqual([]);
  });

  it('orders ports by canvas position so re-saving is stable', () => {
    const right = node('right', 'nanoGen', 900, 0);
    const left = node('left', 'nanoGen', 100, 0);
    const edges = [
      edge('e1', 'outside', 'right', { targetHandle: 'ref-image' }),
      edge('e2', 'outside', 'left', { targetHandle: 'ref-image' }),
    ];

    const first = inferTechniquePorts([right, left], edges);
    const second = inferTechniquePorts([left, right], edges.slice().reverse());

    expect(first.inputPorts).toEqual(second.inputPorts);
    expect(first.inputPorts.find((port) => port.id === 'in-1')?.nodeRef).toBe('left');
  });

  it('falls back to a handle-derived type when contracts does not list the handle', () => {
    // ref-images is allowed on nanoGen in contracts but never rendered by the FE;
    // the mirror case (a rendered handle contracts omits) must not lose the save.
    const generator = node('gen', 'nanoGen');
    const { inputPorts } = inferTechniquePorts(
      [generator],
      [edge('e1', 'outside', generator.id, { targetHandle: 'ref-video' })],
    );

    expect(inputPorts.find((port) => port.handleId === 'ref-video')?.dataType).toBe('video');
  });
});

describe('suggestTechniqueKind', () => {
  it('reads the shape of the selection', () => {
    expect(suggestTechniqueKind([node('a', 'image'), node('b', 'string')])).toBe('reference');
    expect(suggestTechniqueKind([node('a', 'string'), node('b', 'nanoGen')])).toBe('generation');
    expect(suggestTechniqueKind([node('a', 'nanoGen'), node('b', 'frameExtract')])).toBe(
      'transformation',
    );
    expect(suggestTechniqueKind([node('a', 'nanoGen'), node('b', 'timelineEditor')])).toBe(
      'assembly',
    );
    expect(suggestTechniqueKind([node('a', 'nanoGen'), node('b', 'organicPublish')])).toBe(
      'delivery',
    );
  });
});
