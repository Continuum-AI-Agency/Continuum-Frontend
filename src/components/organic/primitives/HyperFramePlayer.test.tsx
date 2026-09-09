import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { OrganicCalendarDraft } from './types';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

const createClientRenderJobMock = mock(() => Promise.resolve({}));
const signHyperframeCompositionMock = mock(() =>
  Promise.resolve<string | null>('https://signed.example.com/composition.html'),
);

mock.module('@/lib/api/clientRenderJobs.client', () => ({
  createClientRenderJob: createClientRenderJobMock,
}));
mock.module('@/lib/client-render/ClientRenderProvider', () => ({
  openClientRenderInbox: mock(() => undefined),
}));
mock.module('@/lib/organic/hyperframeSign', () => ({
  signHyperframeComposition: signHyperframeCompositionMock,
}));

const { HyperFramePlayer } = await import('./HyperFramePlayer');

function hyperframeDraft(
  hyperframe: NonNullable<NonNullable<OrganicCalendarDraft['mediaSuggestion']>['hyperframe']>,
): OrganicCalendarDraft {
  return {
    id: 'draft-1',
    title: 'Shader preview',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Jan 1',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Hyperframe',
    objective: 'awareness',
    captionPreview: '',
    tags: [],
    mediaCount: 1,
    backendDraftId: 'backend-draft-1',
    mediaSuggestion: { hyperframe },
  };
}

afterEach(() => {
  cleanup();
  createClientRenderJobMock.mockClear();
  signHyperframeCompositionMock.mockClear();
});

afterAll(() => mock.restore());

describe('HyperFramePlayer shader preview', () => {
  it('plays the production-rendered MP4 instead of the raw iframe when shaders are active', async () => {
    const mp4Url = 'https://signed.example.com/rendered.mp4';
    render(
      <HyperFramePlayer
        brandId="brand-1"
        draft={hyperframeDraft({
          generated: true,
          compositionId: 'composition-1',
          htmlPath: 'brand-1/composition-1.html',
          mp4Status: 'ready',
          mp4Url,
          shaderStack: {
            version: 1,
            effects: [
              {
                effectId: 'vignette',
                enabled: true,
                parameters: { amount: 0.65 },
                keyframes: [],
              },
            ],
          },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play HyperFrame: Shader preview' }));

    await waitFor(() => expect(screen.getByLabelText('Shader preview')).toBeTruthy());
    const video = screen.getByLabelText('Shader preview');
    expect(video.tagName).toBe('VIDEO');
    expect(video.getAttribute('src')).toBe(mp4Url);
    expect(document.querySelector('iframe')).toBeNull();
    expect(signHyperframeCompositionMock).not.toHaveBeenCalled();
  });

  it('does not expose an unshaded iframe while the shader render is pending', async () => {
    render(
      <HyperFramePlayer
        brandId="brand-1"
        draft={hyperframeDraft({
          generated: true,
          compositionId: 'composition-1',
          htmlPath: 'brand-1/composition-1.html',
          mp4Status: 'pending',
          shaderStack: {
            version: 1,
            effects: [
              {
                effectId: 'vignette',
                enabled: true,
                parameters: { amount: 0.65 },
                keyframes: [],
              },
            ],
          },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play HyperFrame: Shader preview' }));

    await waitFor(() =>
      expect(screen.getByText('Shader preview is still rendering.')).toBeTruthy(),
    );
    expect(document.querySelector('iframe')).toBeNull();
    expect(signHyperframeCompositionMock).not.toHaveBeenCalled();
  });
});
