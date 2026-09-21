import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { CompetitorPostAnalysis, InstagramPost } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CompetitorPostView } from './competitorPostView';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// The panel reads the saved-ids list when it opens; nothing else reaches the network.
// Full module surface, because a partial mock deletes the exports it leaves out.
mock.module('@/lib/api/http', () => {
  const request = (args: { path: string }) =>
    Promise.resolve(args.path.includes('/inspiration/saved-ids') ? { postIds: [] } : {});
  return { request, http: { request } };
});

const { CompetitorPostHoverTile } = await import('./CompetitorPostHoverTile');
const { InspirationAnalysePanel } = await import('./InspirationAnalysePanel');

const reel: InstagramPost = {
  id: 'r1',
  shortcode: 'abc',
  permalink: 'https://www.instagram.com/reel/abc/',
  kind: 'reel',
  coverUrl: 'https://cdn.example.com/cover.jpg',
  caption: 'Three things nobody tells you about renting',
  timestamp: '2026-09-01T00:00:00.000Z',
  likeCount: 3700,
  commentsCount: 37,
  viewCount: 35900,
  mediaCount: 1,
  items: [{ kind: 'video', url: 'https://cdn.example.com/reel.mp4' }],
  outlierScore: 3.24,
  baselineEngagement: 1150,
};

const analysis: CompetitorPostAnalysis = {
  kind: 'video',
  video: {
    transcript: 'Nobody tells you the rooftop is the best room in the building.',
    scene_beats: [{ t_seconds: 0, description: 'Creator walks onto the roof' }],
    hook_first_3s: 'A door swings open onto a skyline',
    audio_kind: 'voiceover',
    format: 'talking_head',
    visual_hook: 'Skyline reveal',
  },
  idea: {
    topic: 'Amenity reveal',
    industry: 'Real estate',
    ideaSeed: 'Sell the building through its best room.',
    uniqueAngle: 'Leads with the roof, not the unit.',
    commonBeliefChallenged: 'Renters choose on the apartment itself.',
    contrarianReality: 'Shared spaces decide the lease.',
    supportingEvidence: ['Shows the roof at golden hour'],
  },
  model: 'gemini',
  duration_ms: 1200,
};

function view(over: Partial<CompetitorPostView> = {}, post: Partial<InstagramPost> = {}) {
  return {
    competitorId: 'c1',
    competitorName: 'The Duchess',
    instagramUsername: 'theduchess.nyc',
    post: { ...reel, ...post },
    format: 'talking_head',
    analysis: null,
    relevance: null,
    whyItWorked: null,
    ...over,
  } satisfies CompetitorPostView;
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(cleanup);

describe('CompetitorPostHoverTile face', () => {
  it('shows the format, the multiplier and views/likes/comments without hovering', () => {
    const { getByTestId, container } = wrap(<CompetitorPostHoverTile brandId="b1" view={view()} />);
    expect(getByTestId('format-label').textContent).toBe('Talking head');
    expect(getByTestId('outlier-badge').textContent).toBe('3.2x');
    const metric = (unit: string) =>
      container.querySelector(`[data-metric="${unit}"]`)?.getAttribute('data-value');
    expect(metric('views')).toBe('35900');
    expect(metric('likes')).toBe('3700');
    expect(metric('comments')).toBe('37');
  });

  it('shows no views slot on a photo and no badge when the account has no baseline', () => {
    const { queryByTestId, container } = wrap(
      <CompetitorPostHoverTile
        brandId="b1"
        view={view({ format: 'photo' }, { kind: 'post', viewCount: null, outlierScore: null })}
      />,
    );
    expect(queryByTestId('outlier-badge')).toBeNull();
    expect(container.querySelector('[data-metric="views"]')).toBeNull();
    expect(queryByTestId('format-label')?.textContent).toBe('Photo');
  });

  it('names the brand terms a post matched when sorted for the brand', () => {
    const { getByTestId } = wrap(
      <CompetitorPostHoverTile
        brandId="b1"
        view={view({ relevance: { score: 0.8, matchedTerms: ['rooftop', 'rentals'] } })}
      />,
    );
    expect(getByTestId('relevance-reason').textContent).toContain('rooftop, rentals');
  });
});

describe('InspirationAnalysePanel', () => {
  it('offers Analyse when the post has not been analysed', () => {
    const { getByRole, queryByRole } = wrap(
      <InspirationAnalysePanel brandId="b1" view={view()} open onOpenChange={() => {}} />,
    );
    expect(getByRole('button', { name: 'Analyse' })).toBeDefined();
    expect(queryByRole('tab', { name: 'Transcript' })).toBeNull();
  });

  it('renders the transcript tab and Why it worked from a described analysis', () => {
    const { getByTestId, getByRole } = wrap(
      <InspirationAnalysePanel
        brandId="b1"
        view={view({
          analysis,
          whyItWorked: {
            outlierMultiple: 3.24,
            baselineEngagement: 1150,
            formatRead: 'Talking head',
            hook: 'A door swings open onto a skyline',
            whyItWorked: 'It beat the account median 3.2x with a skyline reveal hook.',
            reasons: [{ cites: 'hook', text: 'Opens on a skyline reveal' }],
          },
        })}
        open
        onOpenChange={() => {}}
      />,
    );
    for (const name of ['Transcript', 'Idea', 'Hook', 'Visuals']) {
      expect(getByRole('tab', { name })).toBeDefined();
    }
    expect(getByTestId('analysis-transcript').textContent).toContain('rooftop is the best room');
    expect(getByTestId('why-it-worked').textContent).toContain('skyline reveal hook');
    expect(getByRole('button', { name: 'Save as template' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps Save as template disabled until the post is analysed', () => {
    const { getByRole } = wrap(
      <InspirationAnalysePanel brandId="b1" view={view()} open onOpenChange={() => {}} />,
    );
    expect(getByRole('button', { name: 'Save as template' }).hasAttribute('disabled')).toBe(true);
  });
});
