import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const requestPreview = mock(async () => ({
  thumbnail_url: 'https://cdn.example.com/creative.jpg',
  image_url: null,
}));

mock.module('@/lib/api/http', () => ({
  http: { request: requestPreview },
}));

const { CreativeCell } = await import('./CreativeCell');

afterEach(() => {
  cleanup();
  requestPreview.mockClear();
});

const creative = {
  ad_id: 'ad-1',
  ad_account_id: 'act-1',
  brand_id: 'brand-1',
};

describe('CreativeCell', () => {
  it('resolves and displays a creative preview in card mode', async () => {
    render(
      <CreativeCell
        label="mapped creative field"
        creative={creative}
        display="card"
        alt="Spring launch"
      />,
    );

    const image = await screen.findByRole('img', { name: 'Spring launch' });
    expect(image.getAttribute('src')).toBe('https://cdn.example.com/creative.jpg');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(requestPreview).toHaveBeenCalledTimes(1);
  });

  it('shows an honest fallback when a card has no resolvable creative reference', () => {
    render(<CreativeCell label="Missing creative" creative={null} display="card" />);

    expect(screen.getByText('Preview unavailable')).toBeTruthy();
    expect(requestPreview).not.toHaveBeenCalled();
  });

  it('shows the same fallback when preview recovery fails', async () => {
    requestPreview.mockRejectedValueOnce(new Error('expired creative'));
    render(<CreativeCell label="Expired creative" creative={creative} display="card" />);

    expect(await screen.findByText('Preview unavailable')).toBeTruthy();
    expect(requestPreview).toHaveBeenCalledTimes(1);
  });

  it('keeps table cells lazy until their hover card opens', async () => {
    render(<CreativeCell label="Spring launch" creative={creative} />);

    expect(screen.getByText('Spring launch')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    await waitFor(() => expect(requestPreview).not.toHaveBeenCalled());
  });
});
