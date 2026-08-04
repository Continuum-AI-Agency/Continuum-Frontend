import { describe, expect, it } from 'bun:test';
import { shouldForgetUnavailableRun } from './useAgentRunStream';

describe('shouldForgetUnavailableRun', () => {
  it('drops stale tenant-denied and deleted runs without treating auth expiry as deletion', () => {
    expect(shouldForgetUnavailableRun(403)).toBe(true);
    expect(shouldForgetUnavailableRun(404)).toBe(true);
    expect(shouldForgetUnavailableRun(401)).toBe(false);
    expect(shouldForgetUnavailableRun(500)).toBe(false);
  });
});
