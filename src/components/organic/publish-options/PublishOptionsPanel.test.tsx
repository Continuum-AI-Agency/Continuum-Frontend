import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { PublishOptionsPanel } from './PublishOptionsPanel';
import { formatOffset, publishesGeneratedVideo, withPlatformOptions } from './publishOptionsMap';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

afterEach(() => cleanup());

function draft(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'draft-1',
    title: 'Reel',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Reel',
    objective: '',
    captionPreview: 'Caption',
    tags: [],
    mediaCount: 1,
    ...overrides,
  };
}

const generatedReel = {
  mediaSuggestion: {
    mediaStatus: 'ready',
    reel: { generated: true, signedUrl: 'https://cdn.example/reel.mp4' },
  },
} as unknown as Partial<OrganicCalendarDraft>;

describe('withPlatformOptions', () => {
  it("replaces one platform's block and leaves the others alone", () => {
    const saved = { tiktok: { aiGenerated: true } };
    expect(withPlatformOptions(saved, 'instagram', { firstComment: 'hi' })).toEqual({
      tiktok: { aiGenerated: true },
      instagram: { firstComment: 'hi' },
    });
  });

  it('stores an emptied block as no key at all', () => {
    const saved = { instagram: { firstComment: 'hi' } };
    expect(withPlatformOptions(saved, 'instagram', { firstComment: undefined })).toEqual({});
  });
});

describe('publishesGeneratedVideo', () => {
  it('is true only when the generated record, not attached media, will publish', () => {
    expect(publishesGeneratedVideo(draft(generatedReel))).toBe(true);
    expect(
      publishesGeneratedVideo(
        draft({
          ...generatedReel,
          publishingAssets: [
            { role: 'primary', kind: 'video', storagePath: 'a.mp4', storageUrl: 'https://x/a.mp4' },
          ],
        }),
      ),
    ).toBe(false);
    expect(publishesGeneratedVideo(draft())).toBe(false);
  });
});

describe('formatOffset', () => {
  it('reads milliseconds as m:ss.s', () => {
    expect(formatOffset(3200)).toBe('0:03.2');
    expect(formatOffset(65_000)).toBe('1:05.0');
  });
});

describe('PublishOptionsPanel', () => {
  it('saves a typed first comment, trimmed, as a coalesced edit of the whole map', () => {
    const onChange = mock();
    render(
      <PublishOptionsPanel
        draft={draft()}
        publishOptions={{ tiktok: { aiGenerated: true } }}
        platform="instagram"
        format="REEL"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('First comment'), {
      target: { value: '  Link in bio ' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      { tiktok: { aiGenerated: true }, instagram: { firstComment: 'Link in bio' } },
      'typing',
    );
  });

  it('offers no first comment where the platform API has none', () => {
    render(
      <PublishOptionsPanel
        publishOptions={undefined}
        draft={draft()}
        platform="linkedin"
        format="REEL"
        onChange={mock()}
      />,
    );
    expect(screen.queryByLabelText('First comment')).toBeNull();
    expect(screen.getByText(/LinkedIn does not accept a first comment/)).toBeTruthy();
  });

  it('offers a cover only for video, and only where the platform takes one', () => {
    render(
      <PublishOptionsPanel
        publishOptions={undefined}
        draft={draft()}
        platform="instagram"
        format="POST"
        onChange={mock()}
      />,
    );
    expect(screen.getByText('A cover applies to video posts only.')).toBeTruthy();
    cleanup();
    render(
      <PublishOptionsPanel
        publishOptions={undefined}
        draft={draft()}
        platform="facebook"
        format="REEL"
        onChange={mock()}
      />,
    );
    expect(screen.getByText(/Facebook picks the cover itself/)).toBeTruthy();
  });

  it('clears a chosen cover back to the platform default', () => {
    const onChange = mock();
    render(
      <PublishOptionsPanel
        draft={draft(generatedReel)}
        publishOptions={{ instagram: { firstComment: 'hi', thumbnail: { offsetMs: 1500 } } }}
        platform="instagram"
        format="REEL"
        onChange={onChange}
      />,
    );
    expect(screen.getByText('Frame at 0:01.5')).toBeTruthy();
    fireEvent.click(screen.getByText('Use the default cover'));
    expect(onChange).toHaveBeenLastCalledWith({ instagram: { firstComment: 'hi' } }, 'discrete');
  });

  it('composes the next save from the map it is given, not from a stale draft snapshot', () => {
    const onChange = mock();
    render(
      <PublishOptionsPanel
        draft={draft({ ...generatedReel, publishOptions: undefined })}
        publishOptions={{ instagram: { firstComment: 'just saved', thumbnail: { offsetMs: 900 } } }}
        platform="instagram"
        format="REEL"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Use the default cover'));
    expect(onChange).toHaveBeenLastCalledWith(
      { instagram: { firstComment: 'just saved' } },
      'discrete',
    );
  });

  it('offers no frame to pick until the video reports a finite duration', () => {
    const { container } = render(
      <PublishOptionsPanel
        publishOptions={undefined}
        draft={draft(generatedReel)}
        platform="instagram"
        format="REEL"
        onChange={mock()}
      />,
    );
    const frames = container.querySelector('[data-cover-frames]');
    expect(frames?.getAttribute('data-cover-frames')).toBe('loading');
    expect(screen.queryByLabelText('Cover frame')).toBeNull();
    expect(screen.queryByText('Use this frame')).toBeNull();

    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: Number.NaN });
    fireEvent.durationChange(video);
    expect(screen.queryByLabelText('Cover frame')).toBeNull();

    Object.defineProperty(video, 'duration', { configurable: true, value: 6.2 });
    fireEvent.loadedMetadata(video);
    expect(frames?.getAttribute('data-cover-frames')).toBe('ready');
    expect(screen.getByLabelText('Cover frame').getAttribute('max')).toBe('6200');
  });

  it('says why no frame can be picked when the video fails to load', () => {
    const { container } = render(
      <PublishOptionsPanel
        publishOptions={undefined}
        draft={draft(generatedReel)}
        platform="instagram"
        format="REEL"
        onChange={mock()}
      />,
    );
    fireEvent.error(container.querySelector('video') as HTMLVideoElement);
    expect(container.querySelector('[data-cover-frames]')?.getAttribute('data-cover-frames')).toBe(
      'error',
    );
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
  });

  it("locks TikTok's AI label on for a generated video and shows it nowhere else", () => {
    render(
      <PublishOptionsPanel
        publishOptions={undefined}
        draft={draft({ ...generatedReel, platforms: ['tiktok'] })}
        platform="tiktok"
        format="REEL"
        onChange={mock()}
      />,
    );
    // By role AND accessible name — a <label> around the explanation once made the whole
    // sentence the switch's name, which a label-text query does not notice.
    const toggle = screen.getByRole('switch', { name: 'AI-generated content' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.hasAttribute('data-disabled')).toBe(true);
    cleanup();
    render(
      <PublishOptionsPanel
        publishOptions={undefined}
        draft={draft(generatedReel)}
        platform="instagram"
        format="REEL"
        onChange={mock()}
      />,
    );
    expect(screen.queryByRole('switch', { name: 'AI-generated content' })).toBeNull();
  });
});
