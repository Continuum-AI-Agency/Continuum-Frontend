import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { Sparkline } from './Sparkline';

afterEach(cleanup);

describe('Sparkline', () => {
  it('draws a labelled line for two or more finite points', () => {
    const { container } = render(<Sparkline values={[1, Number.NaN, 4, 2]} ariaLabel="Reach" />);
    expect(container.querySelector('svg[aria-label="Reach"]')).not.toBeNull();
  });

  it('falls back to a flat baseline below two finite points', () => {
    const { container } = render(<Sparkline values={[5, Number.NaN, undefined]} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('[aria-hidden] span')).not.toBeNull();
  });
});
