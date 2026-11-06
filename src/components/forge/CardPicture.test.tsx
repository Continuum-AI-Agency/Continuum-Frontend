import { afterEach, describe, expect, it } from 'bun:test';
import type { ApiRenderJob, ApiRenderOutput } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { CardPicture } from './TemplateCard';

afterEach(cleanup);

const output = (over: Partial<ApiRenderOutput>) =>
  ({
    kind: 'video',
    url: 'https://fleet.test/render.mp4',
    fileName: 'render.mp4',
    assetId: null,
    ...over,
  }) as unknown as ApiRenderOutput;

const draw = (file: ApiRenderOutput) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CardPicture
        brandId="brand-1"
        name="Card"
        render={{ job: {} as ApiRenderJob, file }}
        emptyLabel={null}
      >
        <div data-testid="wireframe" />
      </CardPicture>
    </QueryClientProvider>,
  );

describe('CardPicture', () => {
  it('draws a video render with no poster as its placeholder: no file read, never an <img>', () => {
    const { container } = draw(output({}));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });

  it('draws a video render with a poster as that poster', () => {
    const { container } = draw(output({ posterUrl: 'https://fleet.test/poster.jpg' }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://fleet.test/poster.jpg',
    );
    expect(container.querySelector('video')).toBeNull();
  });
});
