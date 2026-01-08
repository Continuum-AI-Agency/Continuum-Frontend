"use client";

import React from "react";
import { useToast } from "@/components/ui/ToastProvider";

type DashboardErrorHandlerProps = {
  error?: string;
};

export function DashboardErrorHandler({ error }: DashboardErrorHandlerProps) {
  const { show: showToast } = useToast();
  const [errorShown, setErrorShown] = React.useState(false);

  React.useEffect(() => {
    if (error && !errorShown) {
      showToast({
        title: "Access Restricted",
        description: error,
        variant: "warning",
        durationMs: 6000,
      });
      setErrorShown(true);
      // Clear the error from URL without triggering a navigation
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [error, showToast, errorShown]);

  return null;
}
