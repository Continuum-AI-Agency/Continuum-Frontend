import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandTrendsTabs } from '@/components/brand-insights/BrandTrendsTabs';

// The three signal feeds sit behind tabs rather than stacked accordions. Asserting on rendered
// output keeps this honest across primitive swaps. Note this targets BrandTrendsTabs directly, not
// its BrandTrendsPanel parent — tests/dashboard/DashboardViews.test.tsx replaces the parent with a
// stub via mock.module, which is process-wide in bun.
test('BrandTrendsTabs renders its signal feeds as tabs', () => {
  const markup = renderToStaticMarkup(
    <BrandTrendsTabs trends={[]} events={[]} questionsByNiche={{ questionsByNiche: {} }} />,
  );

  expect(markup).toContain('role="tablist"');
  expect(markup).toContain('Trends');
  expect(markup).toContain('Events');
  expect(markup).toContain('Questions');
});
