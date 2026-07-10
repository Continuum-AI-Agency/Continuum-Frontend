import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BrandInsightsDataTable } from '@/components/brand-insights/BrandInsightsDataTable';

test('BrandInsightsDataTable renders semantic table structure', () => {
  const html = renderToStaticMarkup(
    <BrandInsightsDataTable
      rows={[
        {
          id: 'row-1',
          title: 'Signal spike',
          subtitle: 'Detail summary',
          secondaryValue: 'Feb 23, 2026',
          platforms: ['instagram'],
        },
      ]}
      emptyTitle="Empty"
      emptyDescription="No rows"
      countLabel="rows"
      searchPlaceholder="Search rows"
      secondaryHeaderLabel="Date"
    />,
  );

  expect(html).toContain('<table');
  expect(html).toContain('<thead');
  expect(html).toContain('<tbody');
  expect(html).toContain('Content');
  expect(html).toContain('Date');
});

test('BrandInsightsDataTable renders platform dots instead of pills', () => {
  const html = renderToStaticMarkup(
    <BrandInsightsDataTable
      rows={[
        {
          id: 'row-1',
          title: 'Signal spike',
          secondaryValue: 'Feb 23, 2026',
          platforms: ['instagram', 'x'],
        },
      ]}
      emptyTitle="Empty"
      emptyDescription="No rows"
      countLabel="rows"
      searchPlaceholder="Search rows"
      secondaryHeaderLabel="Date"
    />,
  );

  // Labels live in sr-only text + title tooltips; visible chrome is colored dots only.
  expect(html).toContain('Platforms: Instagram, X');
  expect(html).toContain('bg-pink-500');
  expect(html).toContain('bg-zinc-700');
  expect(html).not.toContain('bg-pink-500/10');
  expect(html).not.toMatch(/>Instagram</);
  expect(html).not.toMatch(/>X</);
});

test('BrandInsightsDataTable keeps subtitle out of the default row scan', () => {
  const html = renderToStaticMarkup(
    <BrandInsightsDataTable
      rows={[
        {
          id: 'row-1',
          title: 'Signal spike',
          subtitle: 'Detail summary that should stay hidden until hover or expand',
          secondaryValue: 'Feb 23, 2026',
          details: [{ label: 'Description', value: 'Hover-only body copy' }],
        },
      ]}
      emptyTitle="Empty"
      emptyDescription="No rows"
      countLabel="rows"
      searchPlaceholder="Search rows"
      secondaryHeaderLabel="Date"
    />,
  );

  // Default scan shows the title only. Subtitle and detail bodies surface on
  // hover/expand (portal content is not present in the closed SSR markup).
  expect(html).toContain('Signal spike');
  expect(html).not.toContain('Detail summary that should stay hidden until hover or expand');
  expect(html).not.toContain('Hover-only body copy');
});
