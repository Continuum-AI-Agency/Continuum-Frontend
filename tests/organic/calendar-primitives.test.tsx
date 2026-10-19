import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  organicCalendarDays,
  organicCreationSteps,
  organicEditorSlides,
  organicTrendTypes,
} from '@/components/organic/primitives/mock-data';
import { OrganicCalendarWorkspaceClient } from '@/components/organic/primitives/OrganicCalendarWorkspaceClient';
import { ToastProvider } from '@/components/ui/ToastProvider';

test('OrganicCalendarWorkspace renders calendar controls and workflow actions', () => {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <OrganicCalendarWorkspaceClient
          days={organicCalendarDays}
          steps={organicCreationSteps}
          editorSlides={organicEditorSlides}
          trendTypes={organicTrendTypes}
          initialSelectedDraftId={null}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );

  expect(html).toContain('Month');
  expect(html).toContain('data-tour-id="organic-list-view"');
  expect(html).toContain('Generate');
});
