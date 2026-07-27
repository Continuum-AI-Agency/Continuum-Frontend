import { describe, expect, it } from 'bun:test';
import { parseGoalFocus } from './focus';

describe('parseGoalFocus', () => {
  it('accepts exact request and artifact deep links', () => {
    expect(parseGoalFocus('request:request_1')).toEqual({
      kind: 'request',
      id: 'request_1',
    });
    expect(parseGoalFocus('artifact:artifact_1')).toEqual({
      kind: 'artifact',
      id: 'artifact_1',
    });
  });

  it('rejects unknown or empty focus values', () => {
    expect(parseGoalFocus('delivery:delivery_1')).toBeNull();
    expect(parseGoalFocus('request:')).toBeNull();
  });
});
