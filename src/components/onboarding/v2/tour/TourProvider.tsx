"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { NextStepProvider, NextStep, useNextStep } from "nextstepjs";
import { onboardingTour, TOUR_NAME } from "./config";

export function TourProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextStepProvider>
      <NextStep steps={onboardingTour} clickThroughOverlay={false} displayArrow>
        <Suspense fallback={null}>
          <TourAutoStart />
        </Suspense>
        {children}
      </NextStep>
    </NextStepProvider>
  );
}

function TourAutoStart() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { startNextStep, currentTour } = useNextStep();

  useEffect(() => {
    if (params.get("tour") !== "1" || currentTour === TOUR_NAME) return;
    startNextStep(TOUR_NAME);
    const next = new URLSearchParams(Array.from(params.entries()));
    next.delete("tour");
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  }, [params, currentTour, startNextStep, router, pathname]);

  return null;
}
