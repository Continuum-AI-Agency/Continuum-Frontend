"use client";

import React from "react";
import { OnboardingProvider, useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { BrandProfileStep } from "@/components/onboarding/steps/BrandProfileStep";
import { IntegrationsStep } from "@/components/onboarding/steps/IntegrationsStep";
import { ReviewStep } from "@/components/onboarding/steps/ReviewStep";
import { OnboardingDebugControls } from "@/components/onboarding/OnboardingDebugControls";
import type { OnboardingState } from "@/lib/onboarding/state";
import { Progress } from "@/components/ui/progress";

type OnboardingContainerProps = {
  brandId: string;
  initialState: OnboardingState;
};

function OnboardingRouter() {
  const { state, updateState } = useOnboarding();
  
  const step = Math.min(Math.max(state.step || 0, 0), 2);
  
  const progressValue = ((step + 1) / 3) * 100;
  
  const stepTitles = [
    "Brand Profile",
    "Integrations",
    "Review & Launch"
  ];

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8 space-y-4">
        <div className="grid grid-cols-3 w-full">
          {stepTitles.map((title, index) => (
            <button
              key={title}
              onClick={() => updateState({ step: index })}
              className={`text-sm font-medium transition-colors text-center pb-2 border-b-2 ${
                step === index 
                  ? "text-primary border-primary" 
                  : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/50"
              }`}
            >
              <span className="block text-xs uppercase tracking-wider opacity-70 mb-1">Step {index + 1}</span>
              {title}
            </button>
          ))}
        </div>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        {step === 0 && <BrandProfileStep />}
        {step === 1 && <IntegrationsStep />}
        {step === 2 && <ReviewStep />}
      </div>
    </div>
  );
}

export default function OnboardingContainer({ brandId, initialState }: OnboardingContainerProps) {
  return (
    <OnboardingProvider brandId={brandId} initialState={initialState}>
      <OnboardingRouter />
      <OnboardingDebugControls />
    </OnboardingProvider>
  );
}
