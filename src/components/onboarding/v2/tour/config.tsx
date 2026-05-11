import type { Tour } from "nextstepjs";

export const TOUR_NAME = "continuum-onboarding";

export const onboardingTour: Tour[] = [
  {
    tour: TOUR_NAME,
    steps: [
      {
        icon: "👋",
        title: "Welcome to Continuum",
        content: (
          <p className="text-sm leading-relaxed text-[#0b1220]">
            Your Brand DNA is live. Let&apos;s walk through the three places you&apos;ll spend most of your
            time — it takes 30 seconds.
          </p>
        ),
        side: "bottom",
        showControls: true,
        showSkip: true,
      },
      {
        icon: "🎨",
        title: "Creative Studio",
        content: (
          <p className="text-sm leading-relaxed text-[#0b1220]">
            Compose images, video, and copy on a single canvas. Your brand voice and palette are already
            loaded — every node respects them by default.
          </p>
        ),
        nextRoute: "/ai-studio",
        side: "right",
        showControls: true,
        showSkip: true,
      },
      {
        icon: "🗓️",
        title: "Organic planner",
        content: (
          <p className="text-sm leading-relaxed text-[#0b1220]">
            Schedule and edit posts across every channel from one calendar. Drag to move, click to refine —
            never copy-paste between platforms again.
          </p>
        ),
        nextRoute: "/organic",
        side: "right",
        showControls: true,
        showSkip: true,
      },
      {
        icon: "✨",
        title: "Try it now with your trends",
        content: (
          <p className="text-sm leading-relaxed text-[#0b1220]">
            We pre-warmed a trends report from your URL. Click any trend to start a campaign — it inherits
            your brand DNA automatically.
          </p>
        ),
        selector: "[data-tour-id='brand-trends']",
        nextRoute: "/dashboard",
        side: "left",
        showControls: true,
        showSkip: true,
      },
    ],
  },
];
