"use client";

import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";

export function SwitchingIndicator() {
  const { isSwitching } = useActiveBrandContext();

  return (
    <div
      aria-hidden={!isSwitching}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
      data-active={isSwitching}
    >
      <div
        className="h-full origin-left bg-primary transition-transform duration-300 ease-out data-[active=false]:scale-x-0 data-[active=true]:animate-pulse"
        data-active={isSwitching}
        style={{
          transform: isSwitching ? "scaleX(1)" : "scaleX(0)",
        }}
      />
    </div>
  );
}
