import { expect, test } from 'bun:test';
import React from 'react';
import { BrandTrendsPanel } from '@/components/brand-insights/BrandTrendsPanel';
import { renderToStaticMarkup } from '@/i18n/__tests__/render';

test('BrandTrendsPanel loading state does not render progress step labels', () => {
  const html = renderToStaticMarkup(
    <BrandTrendsPanel
      trends={[]}
      events={[]}
      questionsByNiche={{ questionsByNiche: {} }}
      brandId="brand-1"
      isLoading
    />,
  );

  expect(html).not.toContain('Awaiting Strategic Analysis');
  expect(html).not.toContain('Queued');
});
