import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';

import { PostMediaPreviewImage } from './PostMediaPreviewImage';

describe('PostMediaPreviewImage', () => {
  test('requests recovery once for a failed URL and renders an intentional fallback', () => {
    const onRecover = mock(() => {});
    const view = render(
      <PostMediaPreviewImage
        postId="post-1"
        src="https://cdn.example/expired.jpg"
        alt="Post preview"
        className="preview"
        onRecover={onRecover}
      />,
    );

    const image = view.getByRole('img');
    fireEvent.error(image);
    fireEvent.error(image);

    expect(onRecover).toHaveBeenCalledTimes(1);
    expect(view.queryByRole('img')).toBeNull();
    expect(view.getByText('Media preview unavailable')).toBeTruthy();
  });

  test('tries the refreshed URL after recovery updates the post detail', () => {
    const onRecover = mock(() => {});
    const view = render(
      <PostMediaPreviewImage
        postId="post-1"
        src="https://cdn.example/expired.jpg"
        alt="Post preview"
        className="preview"
        onRecover={onRecover}
      />,
    );

    fireEvent.error(view.getByRole('img'));
    view.rerender(
      <PostMediaPreviewImage
        postId="post-1"
        src="https://cdn.example/fresh.jpg"
        alt="Post preview"
        className="preview"
        onRecover={onRecover}
      />,
    );

    expect(view.getByRole('img').getAttribute('src')).toBe('https://cdn.example/fresh.jpg');
  });
});
