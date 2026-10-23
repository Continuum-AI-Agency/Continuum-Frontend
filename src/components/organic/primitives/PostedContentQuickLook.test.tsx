import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PostedContentPreview } from './PostedContentQuickLook';
import { SocialPostFrame } from './SocialPostFrame';
import type { OrganicCalendarPostedContent } from './types';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

afterEach(cleanup);

const post = (
  overrides: Partial<OrganicCalendarPostedContent> = {},
): OrganicCalendarPostedContent => ({
  id: 'post-1',
  source: 'published_posts',
  platform: 'instagram',
  timestamp: '2026-08-03T15:00:00Z',
  dayId: '2026-08-03',
  timeLabel: '9:00 AM',
  title: 'Published launch',
  caption: 'The finished post',
  ...overrides,
});

describe('PostedContentPreview', () => {
  it('renders a published reel in the same vertical frame a reel draft uses', () => {
    const onViewMetrics = mock(() => undefined);
    const { container } = render(
      <PostedContentPreview
        post={post({
          mediaType: 'REELS',
          thumbnailUrl: 'https://cdn.example/thumb.jpg',
          permalink: 'https://www.instagram.com/reel/abc/',
        })}
        onViewMetrics={onViewMetrics}
      />,
    );

    const frame = container.querySelector('[data-preview-frame="instagram"]');
    expect(frame?.getAttribute('data-frame-kind')).toBe('vertical');
    expect(frame?.querySelector('[data-frame-media] img')?.getAttribute('src')).toBe(
      'https://cdn.example/thumb.jpg',
    );
    expect(container.querySelector('[data-preview-frame-slot]')).toBeTruthy();
    expect(screen.getByText('The finished post')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open post' }).getAttribute('href')).toBe(
      'https://www.instagram.com/reel/abc/',
    );
    fireEvent.click(screen.getByRole('button', { name: 'View post metrics' }));
    expect(onViewMetrics).toHaveBeenCalledTimes(1);
  });

  it('offers "Delete from Facebook" only when given a delete, and locks it while deleting', () => {
    const onDelete = mock(() => undefined);
    const { rerender } = render(<PostedContentPreview post={post({ platform: 'facebook' })} />);
    expect(screen.queryByRole('button', { name: /Delete from/ })).toBeNull();

    rerender(<PostedContentPreview post={post({ platform: 'facebook' })} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete from Facebook' }));
    expect(onDelete).toHaveBeenCalledTimes(1);

    rerender(
      <PostedContentPreview post={post({ platform: 'facebook' })} onDelete={onDelete} isDeleting />,
    );
    const pending = screen.getByRole('button', { name: 'Deleting from Facebook…' });
    expect(pending.hasAttribute('disabled')).toBe(true);
  });

  it('renders a text-only Facebook post with no media box, stamped with its own time', () => {
    const { container } = render(<PostedContentPreview post={post({ platform: 'facebook' })} />);

    const frame = container.querySelector('[data-preview-frame="facebook"]');
    expect(frame?.getAttribute('data-frame-kind')).toBe('feed');
    expect(frame?.querySelector('[data-frame-media]')).toBeNull();
    expect(frame?.textContent).toContain('Mon, Aug 3 · 9:00 AM');
  });

  it('renders a production YouTube Short (SHORTS behind a watch URL) as a vertical Short', () => {
    const { container } = render(
      <PostedContentPreview
        post={post({
          platform: 'youtube',
          mediaType: 'SHORTS',
          thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
          permalink: 'https://www.youtube.com/watch?v=x',
        })}
      />,
    );

    const frame = container.querySelector('[data-preview-frame="youtube"]');
    expect(frame?.getAttribute('data-frame-kind')).toBe('vertical');
    expect(screen.getByText('Shorts')).toBeTruthy();
    // YouTube's still is landscape with the Short pillarboxed: crop it, never letterbox it.
    expect(frame?.querySelector('[data-frame-media] img')?.className).toContain('object-cover!');
  });

  it('renders a YouTube watch URL as long-form', () => {
    const { container } = render(
      <PostedContentPreview
        post={post({
          platform: 'youtube',
          mediaType: 'VIDEO',
          thumbnailUrl: 'https://cdn.example/yt.jpg',
          permalink: 'https://www.youtube.com/watch?v=abc',
        })}
      />,
    );

    expect(container.querySelector('[data-frame-kind]')?.getAttribute('data-frame-kind')).toBe(
      'landscape',
    );
  });

  it('keeps the generic card for a platform with no native frame', () => {
    const { container } = render(
      <PostedContentPreview post={post({ platform: 'threads' as 'instagram' })} />,
    );

    expect(container.querySelector('[data-preview-frame]')).toBeNull();
    expect(screen.getByText('Published launch')).toBeTruthy();
    expect(screen.getByText('The finished post')).toBeTruthy();
  });

  it('paints the first frame of a production IG reel that carries only its video file', () => {
    // organic_published_posts REEL rows hold media_urls {videoUrl} and no still; the route
    // maps them to mediaUrl = the video, thumbnailUrl = null, mediaKind = video.
    const videoUrl = 'https://ref.supabase.co/storage/v1/object/sign/media-library/r.mp4?token=t';
    const { container } = render(
      <PostedContentPreview
        post={post({
          mediaType: 'REEL',
          mediaUrl: videoUrl,
          thumbnailUrl: null,
          mediaKind: 'video',
        })}
      />,
    );

    const frame = container.querySelector('[data-preview-frame="instagram"]');
    expect(frame?.getAttribute('data-frame-kind')).toBe('vertical');
    const video = frame?.querySelector('[data-frame-media] video') as HTMLVideoElement | null;
    expect(video?.getAttribute('src')).toBe(`${videoUrl}#t=0.01`);
    expect(video?.muted).toBe(true);
    expect(video?.hasAttribute('playsinline')).toBe(true);
    expect(video?.getAttribute('preload')).toBe('metadata');
    expect(frame?.querySelector('[data-frame-media] img')).toBeNull();
    expect(screen.queryByText('Preview unavailable')).toBeNull();
  });

  it('keeps a full-screen frame full size when a published post has no media at all', () => {
    for (const [overrides, kind] of [
      [{ mediaType: 'REELS' }, 'vertical'],
      [{ mediaType: 'STORY' }, 'story'],
      [{ platform: 'youtube', mediaType: 'VIDEO' }, 'landscape'],
    ] as const) {
      const { container, unmount } = render(<PostedContentPreview post={post(overrides)} />);
      const frame = container.querySelector('[data-frame-kind]');
      expect(frame?.getAttribute('data-frame-kind')).toBe(kind);
      const box = frame?.querySelector('[data-frame-media] > div') as HTMLElement | null;
      expect(box?.textContent).toBe('Preview unavailable');
      expect(box?.style.aspectRatio).not.toBe('');
      unmount();
    }
  });

  it('titles a published YouTube video with its own title and describes it with the full caption', () => {
    const { container } = render(
      <PostedContentPreview
        post={post({
          source: 'external',
          platform: 'youtube',
          mediaType: 'VIDEO',
          title: 'How we roast',
          caption: 'Twelve ratios, one winner.\nFull method below.',
          thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
          permalink: 'https://www.youtube.com/watch?v=x',
        })}
      />,
    );

    expect(container.querySelector('[data-frame-kind]')?.getAttribute('data-frame-kind')).toBe(
      'landscape',
    );
    expect(screen.getByText('How we roast')).toBeTruthy();
    expect(screen.getByText(/Twelve ratios, one winner\./).textContent).toContain(
      'Full method below.',
    );
    expect(screen.getByText('Subscribe').getAttribute('aria-hidden')).toBe('true');
  });

  it('titles our own published YouTube row the way the publisher did: by the caption first line', () => {
    render(
      <PostedContentPreview
        post={post({
          platform: 'youtube',
          mediaType: 'VIDEO',
          title: 'Our planner label',
          caption: 'Launch day\nEverything we shipped.',
          thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
        })}
      />,
    );
    expect(screen.getByText('Launch day')).toBeTruthy();
    expect(screen.queryByText('Our planner label')).toBeNull();
  });

  it('overlays a published Short with its own title, the Shorts label hidden from readers', () => {
    render(
      <PostedContentPreview
        post={post({
          source: 'external',
          platform: 'youtube',
          mediaType: 'SHORTS',
          title: 'Ratio test',
          caption: 'A description YouTube never overlays',
          thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
        })}
      />,
    );

    expect(screen.getByText('Ratio test')).toBeTruthy();
    expect(screen.queryByText('A description YouTube never overlays')).toBeNull();
    expect(screen.getByText('Shorts').getAttribute('aria-hidden')).toBe('true');
  });

  it('shows no caption prompt for a published post with an empty caption', () => {
    render(
      <PostedContentPreview post={post({ caption: '', thumbnailUrl: 'https://cdn/p.jpg' })} />,
    );
    expect(screen.queryByText(/Write your/)).toBeNull();
  });
});

describe('SocialPostFrame', () => {
  const props = {
    platform: 'instagram' as const,
    caption: '',
    mediaNode: null,
  };

  it('draws the story reply bar only for readers, keeping the progress bar while editable', () => {
    const { container, rerender } = render(
      <SocialPostFrame {...props} frame={{ kind: 'story', mediaAspect: 9 / 16 }} editable />,
    );
    expect(screen.queryByText('Send message')).toBeNull();
    // The progress bar is the story's identity, not an affordance: it stays.
    expect(container.querySelector('[data-story-progress]')).toBeTruthy();

    rerender(
      <SocialPostFrame {...props} frame={{ kind: 'story', mediaAspect: 9 / 16 }} editable={false} />,
    );
    expect(screen.getByText('Send message').getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[data-frame-media]')?.textContent).toBe('Preview unavailable');
  });

  it('keeps the "Needs media" action for a draft and the caption prompt only while editable', () => {
    const onAddMedia = mock();
    render(
      <SocialPostFrame
        {...props}
        frame={{ kind: 'vertical', mediaAspect: 9 / 16 }}
        onAddMedia={onAddMedia}
        editable
      />,
    );
    expect(screen.getByText('Needs media')).toBeTruthy();
    expect(screen.queryByText('Preview unavailable')).toBeNull();
    expect(screen.getByText('Write your caption…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add media' }));
    expect(onAddMedia).toHaveBeenCalledTimes(1);
  });

  it('titles a YouTube draft by its caption first line and describes it with the whole caption', () => {
    render(
      <SocialPostFrame
        {...props}
        platform="youtube"
        caption={'\nLaunch <day>\nEverything we shipped.'}
        frame={{ kind: 'landscape', mediaAspect: 16 / 9 }}
        editable={false}
      />,
    );
    expect(screen.getByText('Launch day')).toBeTruthy();
    expect(screen.getByText(/Everything we shipped\./).textContent).toContain('Launch <day>');
  });

  // The frame shows what goes out: the plan's caption (hashtags folded in, limits applied),
  // and nothing at all when the plan sends none.
  it('shows the caption as sent when the plan gives one, instead of the typed one', () => {
    const { rerender } = render(
      <SocialPostFrame
        {...props}
        caption="Typed"
        hashtags={{ high: ['#dropped'] }}
        sentCaption="Sent text #kept"
        frame={{ kind: 'feed', mediaAspect: 1 }}
        editable={false}
      />,
    );
    expect(screen.getByText(/Sent text #kept/)).toBeTruthy();
    expect(screen.queryByText(/#dropped/)).toBeNull();

    rerender(
      <SocialPostFrame
        {...props}
        caption="Typed"
        sentCaption={null}
        frame={{ kind: 'feed', mediaAspect: 1 }}
        editable={false}
      />,
    );
    expect(screen.queryByText(/Typed/)).toBeNull();
  });
});
