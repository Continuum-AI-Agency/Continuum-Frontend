import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { LinkedInPostGrid, type LinkedInPostView } from './LinkedInPostGrid';

afterEach(cleanup);

const posts: LinkedInPostView[] = [
  {
    author: 'Ada Lovelace',
    headline: 'Head of Growth',
    content: 'Shipping our Q3 playbook — here is what we learned.',
    time: '3h',
    reactions: '128',
    comments: '14',
  },
  {
    author: 'Grace Hopper',
    headline: 'VP Engineering',
    content: 'Debugging in prod again, and loving it.',
    time: '1d',
    reactions: '42',
  },
];

describe('LinkedInPostGrid', () => {
  it('renders a tile per post with author, snippet and engagement', () => {
    const { getByText } = render(<LinkedInPostGrid posts={posts} />);
    expect(getByText('Ada Lovelace')).toBeTruthy();
    expect(getByText('Grace Hopper')).toBeTruthy();
    expect(getByText(/Shipping our Q3 playbook/)).toBeTruthy();
    expect(getByText('128 reactions')).toBeTruthy();
  });

  it('renders nothing when there are no posts', () => {
    const { container } = render(<LinkedInPostGrid posts={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
