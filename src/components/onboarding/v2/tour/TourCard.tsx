"use client";

import type { CardComponentProps } from "nextstepjs";

// Custom nextstepjs card. The library default renders "Skip Tour" as a
// full-width button at the BOTTOM of a tall, unclamped card, which pushes
// controls off-screen on steps positioned near a viewport edge. This card is
// compact, height-clamped to the viewport, and moves Skip into the header so the
// dismiss control is always reachable at the top of the card.
export function TourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const isLast = currentStep === totalSteps - 1;
  const canSkip = step.showSkip && !isLast && Boolean(skipTour);
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="flex max-h-[80vh] w-[20rem] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          {step.icon ? <span className="text-lg leading-none">{step.icon}</span> : null}
          <h2 className="truncate text-sm font-semibold">{step.title}</h2>
        </div>
        {canSkip ? (
          <button
            type="button"
            onClick={skipTour}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            Skip
          </button>
        ) : null}
      </div>

      <div className="min-h-0 overflow-auto px-4 pt-2">{step.content}</div>

      <div className="h-1 w-full bg-slate-100">
        <div className="h-1 rounded-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} />
      </div>

      {step.showControls ? (
        <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs">
          <button
            type="button"
            onClick={prevStep}
            disabled={currentStep === 0}
            className="rounded-md px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:invisible"
          >
            Previous
          </button>
          <span className="whitespace-nowrap text-slate-400">
            {currentStep + 1} of {totalSteps}
          </span>
          <button
            type="button"
            onClick={nextStep}
            className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white transition-colors hover:bg-slate-700"
          >
            {isLast ? "Finish" : "Next"}
          </button>
        </div>
      ) : (
        <div className="pb-3" />
      )}

      {arrow}
    </div>
  );
}
