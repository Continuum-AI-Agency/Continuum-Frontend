"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type OnboardingGateProps = {
  children: React.ReactNode;
};

export default function OnboardingGate({ children }: OnboardingGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [allow, setAllow] = useState(true);

  useEffect(() => {
    try {
      const isOnboardingRoute = pathname?.startsWith("/onboarding");
      const hasCompleted = typeof window !== "undefined" && window.localStorage.getItem("onboarding.complete") === "true";

      if (isOnboardingRoute) {
        if (hasCompleted) {
          router.replace("/dashboard");
          setAllow(false);
        } else {
          setAllow(true);
        }
        setReady(true);
        return;
      }

      if (!hasCompleted) {
        setAllow(false);
        router.replace("/onboarding");
        setReady(true);
        return;
      }

      setAllow(true);
      setReady(true);
    } catch {
      // If accessing localStorage fails, allow rendering to avoid blocking
      setAllow(true);
      setReady(true);
    }
  }, [pathname, router]);

  if (!ready) return null;
  if (!allow) return null;
  return <>{children}</>;
}


