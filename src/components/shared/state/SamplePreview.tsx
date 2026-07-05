// Sample-behind-CTA wrapper (IMP-024). Shows a blurred, non-interactive sample
// of what a module looks like once set up, with the real CTA overlaid on top.
// The sample is decorative: it is aria-hidden and inert so assistive tech and
// keyboard users only reach the overlay action.

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const BLUR_CLASS = {
  sm: "blur-[2px]",
  md: "blur-sm",
  lg: "blur-md",
} as const

type SamplePreviewProps = {
  children: ReactNode
  overlay: ReactNode
  blur?: keyof typeof BLUR_CLASS
  className?: string
}

export function SamplePreview({
  children,
  overlay,
  blur = "md",
  className,
}: SamplePreviewProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      <div
        aria-hidden="true"
        inert
        className={cn(
          "pointer-events-none select-none opacity-60",
          BLUR_CLASS[blur],
        )}
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/40 p-4">
        {overlay}
      </div>
    </div>
  )
}
