import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import OnboardingLayout from "@/app/onboarding/layout";
import { useToast } from "@/components/ui/ToastProvider";

function ToastConsumer() {
  useToast();
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
