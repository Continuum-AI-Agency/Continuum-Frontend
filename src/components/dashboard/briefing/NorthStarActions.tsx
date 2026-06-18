import { CalendarDays, Frame, TrendingUp } from "lucide-react";
import { NorthStarCta } from "./NorthStarCta";

// The three "North Star" next-step actions surfaced beneath the briefing so a
// user (especially right after onboarding) always has a clear move to make.
export function NorthStarActions() {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      <NorthStarCta
        tone="primary"
        title="Open Creative Studio"
        description="Turn a signal into a creative."
        href="/ai-studio"
        icon={Frame}
      />
      <NorthStarCta
        title="Launch a campaign"
        description="Put budget behind your best work."
        href="/scale/campaign-canvas"
        icon={TrendingUp}
      />
      <NorthStarCta
        title="Plan a post"
        description="Schedule it in the calendar."
        href="/organic?tab=planner"
        icon={CalendarDays}
      />
    </div>
  );
}
