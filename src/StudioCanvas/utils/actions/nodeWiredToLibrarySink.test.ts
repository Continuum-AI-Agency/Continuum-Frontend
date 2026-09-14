import { describe, expect, it } from 'bun:test';

import { nodeWiredToLibrarySink } from './nodeWiredToLibrarySink';

describe('nodeWiredToLibrarySink', () => {
  it('is false when the action only feeds another action', () => {
    expect(
      nodeWiredToLibrarySink(
        'flip',
        [{ source: 'flip', target: 'crop' }],
        new Map([
          ['flip', 'action'],
          ['crop', 'action'],
        ]),
      ),
    ).toBe(false);
  });

  it('is true when Export or API Render sits anywhere downstream', () => {
    expect(
      nodeWiredToLibrarySink(
        'flip',
        [
          { source: 'flip', target: 'crop' },
          { source: 'crop', target: 'out' },
        ],
        new Map([
          ['flip', 'action'],
          ['crop', 'action'],
          ['out', 'export'],
        ]),
      ),
    ).toBe(true);
    expect(
      nodeWiredToLibrarySink(
        'flip',
        [{ source: 'flip', target: 'render' }],
        new Map([
          ['flip', 'action'],
          ['render', 'apiRender'],
        ]),
      ),
    ).toBe(true);
  });
});
