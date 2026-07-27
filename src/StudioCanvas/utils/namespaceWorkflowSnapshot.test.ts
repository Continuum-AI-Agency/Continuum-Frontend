import { describe, expect, it } from 'bun:test';

import { namespaceWorkflowSnapshot } from './namespaceWorkflowSnapshot';

describe('namespaceWorkflowSnapshot', () => {
  it('makes an editable workflow module collision-safe without hiding its nodes', () => {
    const result = namespaceWorkflowSnapshot(
      {
        nodes: [
          {
            id: 'prompt',
            type: 'string',
            position: { x: 0, y: 0 },
            data: { value: 'Hook' },
          },
          {
            id: 'shot',
            type: 'videoGen',
            position: { x: 400, y: 0 },
            data: { prompt: '' },
          },
        ],
        edges: [{ id: 'edge', source: 'prompt', target: 'shot' }],
      },
      'module:ugc-1',
    );

    expect(result.nodes.map((node) => node.id)).toEqual([
      'module:ugc-1:prompt',
      'module:ugc-1:shot',
    ]);
    expect(result.edges[0]).toMatchObject({
      id: 'module:ugc-1:edge',
      source: 'module:ugc-1:prompt',
      target: 'module:ugc-1:shot',
    });
  });
});
