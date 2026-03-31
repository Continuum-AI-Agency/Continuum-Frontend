"use client";

import { useEffect } from "react";

export default function OrganicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[organic] route error:", error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Something went wrong
      </h2>
      <p className="max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
        The organic planner encountered an error. Your data is safe.
      </p>
      <button
        onClick={reset}
        className="inline-flex h-9 items-center rounded-lg bg-[#5A48F9] px-4 text-sm font-medium text-white transition-colors hover:bg-[#4a3ad4]"
      >
        Try again
      </button>
    </div>
  );
}
