import { describe, expect, it } from 'bun:test';
import type { UiFetchedPost } from '@continuum/contracts';
import { renderToStaticMarkup } from 'react-dom/server';

import { PostContentCardGrid } from './PostContentCardGrid';

const post = (contentKey: string, source: UiFetchedPost['source']): UiFetchedPost => ({
  contentKey,
  postId: 'same-provider-id',
  source,
  platform: source,
  caption: `${source} caption`,
  mediaUrl: null,
  permalink: null,
  postedAt: null,
  scheduledAt: null,
  format: null,
  status: 'published',
  topic: null,
  metrics: null,
  rank: null,
  quality: null,
});

describe('PostContentCardGrid identity', () => {
  it('keeps colliding provider ids scoped to their composite content key', () => {
    const html = renderToStaticMarkup(
      <PostContentCardGrid
        posts={[
          post('instagram:instagram:same-provider-id', 'instagram'),
          post('facebook:facebook:same-provider-id', 'facebook'),
        ]}
      />,
    );

    expect(html).toContain('data-content-key="instagram:instagram:same-provider-id"');
    expect(html).toContain('data-content-key="facebook:facebook:same-provider-id"');
    expect(html.match(/data-post-id="same-provider-id"/g)).toHaveLength(2);
    expect(html).toContain('instagram caption');
    expect(html).toContain('facebook caption');
  });
});
