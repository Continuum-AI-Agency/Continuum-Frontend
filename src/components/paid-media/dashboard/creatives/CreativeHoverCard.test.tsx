import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';

import { CreativeHoverCard } from './CreativeHoverCard';

afterEach(() => cleanup());

describe('CreativeHoverCard', () => {
  it('renders the trigger child unchanged', () => {
    const { container } = render(
      <CreativeHoverCard
        ad={{ id: 'ad-1', name: 'Hero', creative: { id: 'c', imageUrl: 'u' } }}
        logs={[]}
        onOpenDetail={() => undefined}
      >
        <button type="button">Open</button>
      </CreativeHoverCard>,
    );
    expect(container.textContent).toContain('Open');
  });
});
