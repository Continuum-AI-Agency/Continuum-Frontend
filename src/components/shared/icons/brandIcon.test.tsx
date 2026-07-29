import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

import { buildPlannerPlatforms } from '@/components/organic/primitives/planner-platforms';
import { facebook } from '@/lib/brand-icons';
import { FigmaIcon, InstagramIcon, makeSvgIcon } from './brandIcon';

afterEach(cleanup);

describe('makeSvgIcon', () => {
  it('renders the brand artwork inline', () => {
    const FacebookIcon = makeSvgIcon(facebook);
    const { container } = render(<FacebookIcon />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('labels the mark with the brand title', () => {
    const FacebookIcon = makeSvgIcon(facebook);
    const { container } = render(<FacebookIcon />);

    expect(container.querySelector('span')?.getAttribute('title')).toBe('Facebook');
  });

  it('keeps its base sizing classes when the caller passes a className', () => {
    const FacebookIcon = makeSvgIcon(facebook);
    const { container } = render(<FacebookIcon className="size-3" />);

    const className = container.querySelector('span')?.getAttribute('class') ?? '';
    expect(className).toContain('size-3');
    expect(className).toContain('shrink-0');
  });
});

describe('brand marks lucide v1 removed', () => {
  // lucide-react v1 dropped every brand glyph, which broke the build at these
  // exact call sites. Each mark must now come from @/lib/brand-icons.
  it('renders a Figma mark', () => {
    const { container } = render(<FigmaIcon />);

    expect(container.querySelector('span')?.getAttribute('title')).toBe('Figma');
    expect(container.querySelectorAll('path').length).toBe(5);
  });

  it('renders an Instagram mark', () => {
    const { container } = render(<InstagramIcon />);

    expect(container.querySelector('span')?.getAttribute('title')).toBe('Instagram');
  });

  it('gives every planner platform a renderable icon', () => {
    const platforms = buildPlannerPlatforms(['instagram', 'linkedin'], [], [], {
      includeComingSoon: true,
    });

    expect(platforms.length).toBeGreaterThan(0);
    for (const platform of platforms) {
      const { container } = render(<platform.Icon className="size-4" />);
      expect(container.firstElementChild).not.toBeNull();
      cleanup();
    }
  });
});
