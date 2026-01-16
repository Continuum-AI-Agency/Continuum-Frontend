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
const LOADER_FADE_OUT_DURATION_MS = 800;

const DashboardLoader: React.FC = () => {
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if coming from onboarding
    const fromOnboarding = sessionStorage.getItem("from_onboarding");
    if (!fromOnboarding) {
      return;
    }

    sessionStorage.removeItem("from_onboarding");
    setShouldRender(true);
    setIsVisible(true);

    const hideTimeoutId = window.setTimeout(() => {
      setIsVisible(false);
    }, DASHBOARD_LOADER_TOTAL_DURATION_MS);

    const unmountTimeoutId = window.setTimeout(() => {
      setShouldRender(false);
    }, DASHBOARD_LOADER_TOTAL_DURATION_MS + LOADER_FADE_OUT_DURATION_MS);

    return () => {
      window.clearTimeout(hideTimeoutId);
      window.clearTimeout(unmountTimeoutId);
    };
  }, []);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <OnboardingLoading
        phrases={LOADER_PHRASES}
        cycleDuration={LOADER_CYCLE_DURATION_MS}
        overlay={true}
        size="full"
        isVisible={isVisible}
      />
    </div>
  );
};

export default DashboardLoader;
