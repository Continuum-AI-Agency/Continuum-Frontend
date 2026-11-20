import { expect, test } from 'bun:test';
import React from 'react';
import { BrandTrendsGrid } from '@/components/brand-insights/BrandTrendsGrid';
import { renderToStaticMarkup } from '@/i18n/__tests__/render';

test('BrandTrendsGrid shows generated date in the date column', () => {
  const html = renderToStaticMarkup(
    <BrandTrendsGrid
      generatedAt="2026-02-23T12:00:00.000Z"
      platforms={['linkedin']}
      trends={[
        {
          id: 'trend-1',
          title: 'Signal spike',
          description: 'Audience spike in engagement',
          relevanceToBrand: 'Matches campaign goals',
          isSelected: false,
          timesUsed: 0,
        },
      ]}
    />,
  );

  expect(html).toContain('Date');
  expect(html).toContain('2026');
  expect(html).toContain('LinkedIn');
  expect(html).not.toContain('>Trend<');
});
