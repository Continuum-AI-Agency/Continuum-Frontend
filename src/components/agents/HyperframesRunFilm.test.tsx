import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import type { AgentDelegatedFrameData, AgentRunEventDto } from '@continuum/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useAgentRunStore } from '@/lib/agents/runStore';

// Full-module mocks spread over the real exports: a partial mock.module deletes the
// module's other exports for every later test file in the process.
const realSign = await import('@/lib/organic/hyperframeSign');
const signMock = mock(() => Promise.resolve<string | null>('https://signed.example.com/film.mp4'));
mock.module('@/lib/organic/hyperframeSign', () => ({ ...realSign, signHyperframeAsset: signMock }));
const realBrand = await import('@/components/providers/ActiveBrandProvider');
mock.module('@/components/providers/ActiveBrandProvider', () => ({
  ...realBrand,
  useActiveBrandContext: () => ({ activeBrandId: 'brand-1' }),
}));

const { filmOf } = await import('./HyperframesRunFilm');
const { AgentDelegatedCard } = await import('./AgentDelegatedCard');

const event = (seq: number, type: string, data: Record<string, unknown>): AgentRunEventDto => ({
  seq,
  type,
  data,
  eventId: `evt_${seq}`,
  ts: '2026-09-27T00:00:00.000Z',
});
const step = (seq: number, message: string) =>
  event(seq, 'hyperframes.agent.step', { phase: 'drafting', message, pass: 0 });
const rendered = (seq: number, path: string) =>
  event(seq, 'hyperframes.render.completed', {
    revisionId: 'rev-1',
    assetId: 'asset-1',
    storage: { bucket: 'brand-profile-assets', path },
  });

afterEach(() => {
  cleanup();
  signMock.mockClear();
  useAgentRunStore.getState().reset();
});
afterAll(() => mock.restore());

describe('filmOf', () => {
  it('is running with the latest step while no render has landed', () => {
    expect(filmOf([step(0, 'Reading the cache'), step(1, 'Scoring the film')])).toEqual({
      state: 'running',
      step: 'Scoring the film',
    });
    expect(filmOf(undefined)).toEqual({ state: 'running', step: null });
  });

  it('is ready with the latest render, whatever came after it', () => {
    expect(
      filmOf([
        rendered(3, 'a.mp4'),
        rendered(5, 'b.mp4'),
        event(6, 'response.error', { message: 'late' }),
      ]),
    ).toEqual({ state: 'ready', storage: { bucket: 'brand-profile-assets', path: 'b.mp4' } });
  });

  it('fails on an error or a cancel with no film', () => {
    expect(
      filmOf([step(0, 'x'), event(1, 'response.error', { message: 'Render failed' })]),
    ).toEqual({
      state: 'failed',
      error: 'Render failed',
    });
    expect(filmOf([event(1, 'response.cancelled', {})])).toEqual({
      state: 'failed',
      error: 'Cancelled.',
    });
  });

  it('ignores frames that are not HyperFrames events', () => {
    expect(filmOf([event(0, 'agent.chat_started', {}), step(1, 'Drafting')]).state).toBe('running');
  });
});

describe('AgentDelegatedCard — a HyperFrames film', () => {
  const delegation: AgentDelegatedFrameData = {
    callId: 'call-1',
    callerAgent: 'jaina',
    calleeAgent: 'hyperframes',
    query: 'Make a report film of the last 7 days',
    status: 'running',
    calleeRunId: 'run-film',
  };

  it('plays the signed film from a replayed log, as after a reload', async () => {
    useAgentRunStore
      .getState()
      .appendEvents('run-film', [step(0, 'Drafting'), rendered(7, 'films/r.mp4')], 'hyperframes');
    render(<AgentDelegatedCard data={delegation} />);

    const video = await screen.findByTestId('hyperframes-film');
    expect(video.getAttribute('src')).toBe('https://signed.example.com/film.mp4');
    expect(signMock).toHaveBeenCalledWith({
      brandId: 'brand-1',
      bucket: 'brand-profile-assets',
      path: 'films/r.mp4',
    });
    // The frame still says running; the pill follows the run.
    expect(screen.getByText('Answered')).toBeTruthy();
  });

  it('labels a run it has never seen as HyperFrames, not Organic', () => {
    useAgentRunStore.getState().appendEvents('run-film', [step(0, 'Drafting')], 'hyperframes');
    expect(useAgentRunStore.getState().runs['run-film']?.run.agent).toBe('hyperframes');
  });

  it('says the film could not load when signing fails', async () => {
    signMock.mockImplementationOnce(() => Promise.resolve(null));
    useAgentRunStore
      .getState()
      .appendEvents('run-film', [rendered(7, 'films/gone.mp4')], 'hyperframes');
    render(<AgentDelegatedCard data={delegation} />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeTruthy());
  });

  it('leaves other callees alone', () => {
    render(<AgentDelegatedCard data={{ ...delegation, calleeAgent: 'organic' }} />);
    expect(screen.queryByTestId('hyperframes-film')).toBeNull();
    expect(screen.getByText('Working')).toBeTruthy();
  });
});
