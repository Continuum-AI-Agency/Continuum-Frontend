"use client";

import React, { useState, useEffect } from "react";
import OnboardingLoading from "@/components/loader-animations/OnboardingLoading";
import { DEFAULT_LOADING_PHRASES } from "@/lib/ui/loadingPhrases";
import {
  DASHBOARD_LOADER_TOTAL_DURATION_MS,
  getDashboardLoaderCycleDurationMs,
} from "@/lib/ui/dashboardLoaderTiming";

const LOADER_PHRASES = DEFAULT_LOADING_PHRASES;
const LOADER_CYCLE_DURATION_MS = getDashboardLoaderCycleDurationMs(LOADER_PHRASES.length);

const DashboardLoader: React.FC = () => {
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    // Check if coming from onboarding
    const fromOnboarding = sessionStorage.getItem('from_onboarding');
    if (fromOnboarding) {
      sessionStorage.removeItem('from_onboarding');
      setShowLoader(true);

      // Show loader for 3 seconds, then remove it.
      const timeoutId = window.setTimeout(() => {
        setShowLoader(false);
      }, DASHBOARD_LOADER_TOTAL_DURATION_MS);

      return () => window.clearTimeout(timeoutId);
    }
  }, []);

  if (!showLoader) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <OnboardingLoading
        phrases={LOADER_PHRASES}
        cycleDuration={LOADER_CYCLE_DURATION_MS}
        overlay={true}
        size="full"
      />
    </div>
  );
};

export default DashboardLoader;
