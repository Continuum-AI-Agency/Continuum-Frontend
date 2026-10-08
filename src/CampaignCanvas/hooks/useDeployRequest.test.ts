import { describe, expect, it } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import { useDeployRequest } from './useDeployRequest';

const DEPLOY = { versionId: 'v2', contentHash: 'a'.repeat(64), name: 'Summer', version: 2 };

describe('useDeployRequest', () => {
  it('opens ONE request per version while it is in flight — a double-click is ignored', () => {
    const { result } = renderHook(() => useDeployRequest());
    let first = false;
    let second = true;
    act(() => {
      first = result.current.requestDeploy(DEPLOY);
      second = result.current.requestDeploy(DEPLOY);
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(result.current.request?.id).toBe(`deploy:v2:${'a'.repeat(64)}`);
    expect(result.current.inFlight).toBe(true);
  });

  it('stays in flight after the panel takes it, and ends only when it settles', () => {
    const { result } = renderHook(() => useDeployRequest());
    act(() => {
      result.current.requestDeploy(DEPLOY);
    });
    const id = result.current.request?.id ?? '';
    act(() => result.current.consumed());
    expect(result.current.request).toBeNull();
    expect(result.current.inFlight).toBe(true);
    act(() => result.current.settled(id, { ok: false, reason: 'Deploy is blocked: no Page' }));
    expect(result.current.inFlight).toBe(false);
    expect(result.current.refusal).toBe('Deploy is blocked: no Page');

    // Settled, the same version can be asked for again — and the refusal clears.
    act(() => {
      result.current.requestDeploy(DEPLOY);
    });
    expect(result.current.inFlight).toBe(true);
    expect(result.current.refusal).toBeNull();
  });

  it('ignores the outcome of a request it is not waiting on', () => {
    const { result } = renderHook(() => useDeployRequest());
    act(() => {
      result.current.requestDeploy(DEPLOY);
    });
    act(() => result.current.settled('deploy:other:x', { ok: true }));
    expect(result.current.inFlight).toBe(true);
  });

  it('can be cancelled when the panel that would carry it closes, so Deploy is never stuck', () => {
    const { result } = renderHook(() => useDeployRequest());
    act(() => {
      result.current.requestDeploy(DEPLOY);
    });
    act(() => result.current.cancel('The Jaina panel was closed before the approval opened.'));
    expect(result.current.inFlight).toBe(false);
    expect(result.current.request).toBeNull();
    expect(result.current.refusal).toBe('The Jaina panel was closed before the approval opened.');
  });
});
