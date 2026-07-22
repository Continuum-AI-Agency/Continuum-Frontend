import { describe, expect, it } from 'bun:test';

import { type CanvasConnectionInputs, deriveCanvasConnectionState } from './canvasConnectionState';

const base: CanvasConnectionInputs = {
  roomsLoading: false,
  hasRoom: true,
  status: 'SUBSCRIBED',
  dbStatus: 'SUBSCRIBED',
  isSaving: false,
  isCollaborative: false,
};

describe('deriveCanvasConnectionState', () => {
  it('reports workspace-loading while the room list loads and no room is active', () => {
    expect(
      deriveCanvasConnectionState({
        ...base,
        hasRoom: false,
        roomsLoading: true,
        status: 'INITIALIZING',
        dbStatus: 'INITIALIZING',
      }),
    ).toBe('workspace-loading');
  });

  it('reports idle (not connecting) when there is settled-no workspace', () => {
    // The old bug: no room => channels never subscribe => stuck on "connecting".
    expect(
      deriveCanvasConnectionState({
        ...base,
        hasRoom: false,
        roomsLoading: false,
        status: 'INITIALIZING',
        dbStatus: 'INITIALIZING',
      }),
    ).toBe('idle');
  });

  it('reports connecting only while a real room is initializing realtime', () => {
    expect(
      deriveCanvasConnectionState({ ...base, status: 'INITIALIZING', dbStatus: 'INITIALIZING' }),
    ).toBe('connecting');
    expect(deriveCanvasConnectionState({ ...base, dbStatus: 'INITIALIZING' })).toBe('connecting');
  });

  it('reports connected when both channels are subscribed', () => {
    expect(deriveCanvasConnectionState(base)).toBe('connected');
  });

  it('reports saving while a save is in flight', () => {
    expect(deriveCanvasConnectionState({ ...base, isSaving: true })).toBe('saving');
  });

  it('keeps solo edits calm (saved-locally) when a channel degrades', () => {
    expect(deriveCanvasConnectionState({ ...base, dbStatus: 'CLOSED' })).toBe('saved-locally');
    expect(deriveCanvasConnectionState({ ...base, status: 'ERROR' })).toBe('saved-locally');
  });

  it('alarms with sync-error only when collaborating and the DB channel degrades', () => {
    expect(
      deriveCanvasConnectionState({ ...base, isCollaborative: true, dbStatus: 'TIMED_OUT' }),
    ).toBe('sync-error');
  });

  it('reports live-disconnected when collaborating and presence drops', () => {
    expect(deriveCanvasConnectionState({ ...base, isCollaborative: true, status: 'ERROR' })).toBe(
      'live-disconnected',
    );
  });

  it('prioritizes a collaborative DB outage over an in-flight save', () => {
    expect(
      deriveCanvasConnectionState({
        ...base,
        isCollaborative: true,
        dbStatus: 'ERROR',
        isSaving: true,
      }),
    ).toBe('sync-error');
  });
});
