"use client";

import React, { useState, useEffect } from "react";
import OnboardingLoading from "@/components/loader-animations/OnboardingLoading";

const DashboardLoader: React.FC = () => {
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    // Check if coming from onboarding
    const fromOnboarding = sessionStorage.getItem('from_onboarding');
    if (fromOnboarding) {
      sessionStorage.removeItem('from_onboarding');
      setShowLoader(true);

      // Show loader for minimum 3 seconds, then fade out
      setTimeout(() => {
        setShowLoader(false);
      }, 3000);
    }
  }, []);

  if (!showLoader) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <OnboardingLoading
        fastMode={true}
        overlay={true}
        size="full"
      />
    </div>
  );
};

export default DashboardLoader;