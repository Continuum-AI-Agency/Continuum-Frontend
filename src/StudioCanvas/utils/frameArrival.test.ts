import { describe, expect, test } from 'bun:test';
import { arrivalFrameKey } from './frameArrival';

const present = (ids: string[]) => new Set(ids);

describe('arrivalFrameKey', () => {
  test('frames a batch once its nodes are on the canvas', () => {
    expect(arrivalFrameKey(null, ['agent-node'], present(['human', 'agent-node']))).toBe(
      'agent-node',
    );
  });

  test('waits until the arrived node is actually in the graph', () => {
    expect(arrivalFrameKey(null, ['agent-node'], present(['human']))).toBeNull();
  });

  test('a later edit of the same arrival does not move the camera again', () => {
    const first = arrivalFrameKey(null, ['agent-node'], present(['human', 'agent-node']));
    expect(
      arrivalFrameKey(first, ['agent-node'], present(['human', 'agent-node', 'measured'])),
    ).toBeNull();
  });

  test('a new arrival batch frames again', () => {
    expect(
      arrivalFrameKey('agent-node', ['agent-node', 'second'], present(['agent-node', 'second'])),
    ).toBe('agent-node\0second');
  });

  test('an empty arrival leaves the camera where it is', () => {
    expect(arrivalFrameKey(null, [], present(['human']))).toBeNull();
  });
});
