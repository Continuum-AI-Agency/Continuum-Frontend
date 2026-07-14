import { describe, expect, it } from 'bun:test';
import { applyOps, buildWorkflowGraph } from './workflow-builder';
import { coerceNodeConfig, createNodeData, getAllowedTargetHandles } from './workflow-graph';

// The bug: node `data` is a loose record, `imageSize` is on the agent-writable
// whitelist, and NOTHING validated it. The canvas agent wrote `imageSize: "1024px"`
// — a value that exists nowhere in the codebase — and the node sat there until the
// user pressed Run, at which point the generation endpoint 400d.

describe('coerceNodeConfig — the agent write-time guard', () => {
  it('corrects the invented "1024px" the canvas agent actually wrote', () => {
    const result = coerceNodeConfig('nanoGen', {
      model: 'nano-banana-2',
      imageSize: '1024px',
      positivePrompt: 'a hero shot',
    });

    expect(result.data.imageSize).toBe('1K');
    expect(result.changes.join(' ')).toContain('1024px');
  });

  it('drops a size from a model that takes none', () => {
    const result = coerceNodeConfig('nanoGen', { model: 'nano-banana', imageSize: '2K' });

    expect(result.data.imageSize).toBeUndefined();
    expect(result.changes.join(' ')).toContain('takes no image size');
  });

  it('re-checks the size when the MODEL changes under it', () => {
    const result = coerceNodeConfig(
      'nanoGen',
      { model: 'nano-banana-pro' },
      { model: 'nano-banana-2', imageSize: '512px' },
    );

    expect(result.data.imageSize).toBe('1K');
  });

  it('rejects a model that is not an image generator', () => {
    const result = coerceNodeConfig('nanoGen', { model: 'veo-3.1' });

    expect(result.data.model).toBe('nano-banana-2');
    expect(result.changes.join(' ')).toContain('not an image generator');
  });

  it('is patch-safe: a prompt-only update never injects a model', () => {
    const result = coerceNodeConfig(
      'nanoGen',
      { positivePrompt: 'new copy' },
      { model: 'nano-banana-pro', imageSize: '4K' },
    );

    expect(result.data).toEqual({ positivePrompt: 'new copy' });
    expect(result.changes).toEqual([]);
  });

  it('leaves non-image node types alone', () => {
    const patch = { prompt: 'x', resolution: '1080p' };
    expect(coerceNodeConfig('videoGen', patch).data).toBe(patch);
  });
});

describe('createNodeData — every agent add_node / build_canvas goes through here', () => {
  it('coerces an illegal imageSize at creation', () => {
    const { data } = createNodeData('nanoGen', { imageSize: '1024px' });
    expect(data.imageSize).toBe('1K');
  });

  it('creates a nanoGen with no imageSize for a model that takes none', () => {
    const { data } = createNodeData('nanoGen', { model: 'nano-banana' });
    expect('imageSize' in data).toBe(false);
  });

  it('sizes the node to its aspect ratio, not a hardcoded 400x225 box', () => {
    expect(createNodeData('nanoGen').style).toEqual({ width: 400, height: 225 });
    expect(createNodeData('nanoGen', { aspectRatio: '1:1' }).style).toEqual({
      width: 300,
      height: 300,
    });
    expect(createNodeData('nanoGen', { aspectRatio: '9:16' }).style).toEqual({
      width: 225,
      height: 400,
    });
  });
});

describe('applyOps update_node — the other door into a node', () => {
  it('coerces an illegal imageSize written by an agent edit', () => {
    const { graph } = buildWorkflowGraph([{ ref: 'gen', type: 'nanoGen' }]);
    const { graph: next, errors } = applyOps(graph, [
      { op: 'update_node', id: 'gen', data: { imageSize: '1024px' } },
    ]);

    expect(errors).toEqual([]);
    expect(next.nodes[0].data.imageSize).toBe('1K');
  });

  it('resizes the node when an agent changes its aspect ratio', () => {
    const { graph } = buildWorkflowGraph([{ ref: 'gen', type: 'nanoGen' }]);
    const { graph: next } = applyOps(graph, [
      { op: 'update_node', id: 'gen', data: { aspectRatio: '1:1' } },
    ]);

    expect(next.nodes[0].style).toEqual({ width: 300, height: 300 });
  });

  it('clears the size when an agent switches to a model that takes none', () => {
    const { graph } = buildWorkflowGraph([
      { ref: 'gen', type: 'nanoGen', data: { model: 'nano-banana-2', imageSize: '4K' } },
    ]);
    const { graph: next } = applyOps(graph, [
      { op: 'update_node', id: 'gen', data: { model: 'nano-banana' } },
    ]);

    expect('imageSize' in next.nodes[0].data).toBe(false);
  });
});

describe('nanoGen negative prompt handle', () => {
  it('exposes a `negative` target handle, the way the video generators do', () => {
    expect(getAllowedTargetHandles({ id: 'g', type: 'nanoGen' })).toContain('negative');
  });

  it('lets an agent wire a text node into it by role', () => {
    const { graph, errors } = buildWorkflowGraph(
      [
        { ref: 'avoid', type: 'string', data: { value: 'no text, no logos' } },
        { ref: 'gen', type: 'nanoGen' },
      ],
      [{ from_ref: 'avoid', to_ref: 'gen', role: 'negative' }],
    );

    expect(errors).toEqual([]);
    expect(graph.edges[0].targetHandle).toBe('negative');
  });

  it('still resolves an un-hinted text connection to the prompt handle', () => {
    const { graph } = buildWorkflowGraph(
      [
        { ref: 'copy', type: 'string', data: { value: 'a hero shot' } },
        { ref: 'gen', type: 'nanoGen' },
      ],
      [{ from_ref: 'copy', to_ref: 'gen' }],
    );

    expect(graph.edges[0].targetHandle).toBe('prompt');
  });
});
