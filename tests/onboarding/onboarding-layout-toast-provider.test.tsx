import { expect, mock, test } from 'bun:test';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { useToast } from '@/components/ui/ToastProvider';

// FeatureMessages is an async server component that loads the route's catalogs; a static
// render cannot await it, and these tests are about the client providers inside it.
mock.module('@/i18n/FeatureMessages', () => ({
  FeatureMessages: ({ children }: { children: React.ReactNode }) => children,
}));
const { default: OnboardingLayout } = await import('@/app/[locale]/onboarding/layout');

function ToastConsumer() {
  useToast();
  return <div>consumer</div>;
}

function QueryClientConsumer() {
  useQueryClient();
  return <div>consumer</div>;
}

test('useToast throws when rendered outside any provider', () => {
  expect(() => renderToStaticMarkup(<ToastConsumer />)).toThrow(
    'useToast must be used within ToastProvider',
  );
});

test('OnboardingLayout supplies ToastProvider so useToast does not throw', () => {
  const html = renderToStaticMarkup(
    <OnboardingLayout>
      <ToastConsumer />
    </OnboardingLayout>,
  );

  expect(html).toContain('consumer');
});

test('useQueryClient throws when rendered outside any provider', () => {
  expect(() => renderToStaticMarkup(<QueryClientConsumer />)).toThrow('No QueryClient set');
});

test('OnboardingLayout supplies ReactQueryProvider so useQueryClient does not throw', () => {
  const html = renderToStaticMarkup(
    <OnboardingLayout>
      <QueryClientConsumer />
    </OnboardingLayout>,
  );

  expect(html).toContain('consumer');
});
