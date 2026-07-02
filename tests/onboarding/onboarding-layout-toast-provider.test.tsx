import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useQueryClient } from "@tanstack/react-query";

import OnboardingLayout from "@/app/onboarding/layout";
import { useToast } from "@/components/ui/ToastProvider";

function ToastConsumer() {
  useToast();
  return <div>consumer</div>;
}

function QueryClientConsumer() {
  useQueryClient();
  return <div>consumer</div>;
}

test("useToast throws when rendered outside any provider", () => {
  expect(() => renderToStaticMarkup(<ToastConsumer />)).toThrow(
    "useToast must be used within ToastProvider"
  );
});

test("OnboardingLayout supplies ToastProvider so useToast does not throw", () => {
  const html = renderToStaticMarkup(
    <OnboardingLayout>
      <ToastConsumer />
    </OnboardingLayout>
  );

  expect(html).toContain("consumer");
});

test("useQueryClient throws when rendered outside any provider", () => {
  expect(() => renderToStaticMarkup(<QueryClientConsumer />)).toThrow(
    "No QueryClient set"
  );
});

test("OnboardingLayout supplies ReactQueryProvider so useQueryClient does not throw", () => {
  const html = renderToStaticMarkup(
    <OnboardingLayout>
      <QueryClientConsumer />
    </OnboardingLayout>
  );

  expect(html).toContain("consumer");
});
