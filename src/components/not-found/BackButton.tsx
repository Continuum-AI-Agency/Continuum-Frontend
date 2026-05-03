"use client";

import { ArrowLeft } from "lucide-react";

export function BackButton() {
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/12 bg-white/[0.04] px-3 text-sm font-medium text-zinc-100 transition-colors hover:border-white/22 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#7c6fff]"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Go back
    </button>
  );
}
